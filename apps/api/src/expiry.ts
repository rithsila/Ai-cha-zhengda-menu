import { PrismaClient } from '@prisma/client';
import { refundOrderPoints } from './loyalty';

/**
 * Cancel KHQR orders that were never paid for.
 *
 * The order row is created before the customer sees the QR code, so an
 * abandoned KHQR payment leaves a `pending` ticket on the kitchen board that
 * looks exactly like a cash order, and staff make drinks nobody paid for.
 *
 * The staff dashboard tells the two apart from the fields it already gets
 * (`paymentMethod === 'khqr' && status === 'pending'`, plus `paymentExpiresAt`),
 * so nothing new is added to the order payload here. This sweep is what
 * eventually clears those tickets away.
 */

/**
 * Deadline for a KHQR order whose `paymentExpiresAt` is still null.
 *
 * That field is only set by POST /api/payment/aba/create, so it is null when the
 * customer closed the app before the QR was ever requested. Those orders would
 * otherwise sit on the board for good. `createdAt + this window` is their
 * deadline instead. Thirty minutes is comfortably longer than the ~15 minute QR
 * validity, so a customer who is slow to start the payment is never cut off
 * while they are still trying.
 */
export const UNSTARTED_KHQR_GRACE_MS = 30 * 60 * 1000;

/** How often the server sweeps. */
export const SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * Cancel every unpaid, expired KHQR order and hand back the points it reserved.
 * Returns the ids it cancelled. Exported so tests can drive it directly instead
 * of waiting for the timer.
 */
export async function expireUnpaidKhqrOrders(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<string[]> {
  const unstartedCutoff = new Date(now.getTime() - UNSTARTED_KHQR_GRACE_MS);

  // Only `pending` khqr orders are candidates, which is what keeps cash orders
  // and anything already paid / preparing / ready / completed / cancelled out.
  const candidates = await prisma.order.findMany({
    where: {
      paymentMethod: 'khqr',
      status: 'pending',
      OR: [
        { paymentExpiresAt: { lt: now } },
        { paymentExpiresAt: null, createdAt: { lt: unstartedCutoff } },
      ],
    },
    select: { id: true },
  });

  const cancelled: string[] = [];
  for (const { id } of candidates) {
    // Re-check the status inside the write. A payment that landed between the
    // read above and this line moved the row to `paid`, and updateMany with the
    // same filter simply matches nothing rather than cancelling a paid order.
    const result = await prisma.order.updateMany({
      where: { id, paymentMethod: 'khqr', status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (result.count === 0) continue;

    // Give the reserved points back. refundOrderPoints returns early once
    // `pointsSettled` is true, so it is safe to call more than once — and a
    // second sweep cannot even reach here, because the order is no longer
    // `pending`.
    await refundOrderPoints(prisma, id);
    cancelled.push(id);
  }
  return cancelled;
}

/**
 * Run the sweep on a timer. A plain setInterval is the right size for this
 * single-server shop; a job queue would be a dependency with nothing to do.
 */
export function startExpirySweep(prisma: PrismaClient, intervalMs = SWEEP_INTERVAL_MS) {
  const timer = setInterval(() => {
    expireUnpaidKhqrOrders(prisma).catch((err) => {
      console.error('Unpaid-order sweep failed:', err);
    });
  }, intervalMs);
  // Never hold the process open just for the sweep.
  timer.unref?.();
  return timer;
}
