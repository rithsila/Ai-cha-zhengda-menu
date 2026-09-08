import { PrismaClient } from '@prisma/client';
import { refundOrderPoints, settleOrderPoints } from './loyalty';
import { getAbaClient, closeAbaTransaction } from './app';
import type { ABAPayWay } from 'aba-payway-sdk-unofficial';

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
 * Reconciles with PayWay before cancelling an apparently expired unpaid order.
 * Preserves an unresolved state when verification is unavailable.
 * Returns the ids it cancelled.
 */
export async function expireUnpaidKhqrOrders(
  prisma: PrismaClient,
  now: Date = new Date(),
  abaClient?: ABAPayWay | null
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
    select: { id: true, transactionId: true, totalAmount: true },
  });

  const cancelled: string[] = [];
  const aba = abaClient !== undefined ? abaClient : getAbaClient();

  for (const candidate of candidates) {
    // 1. Reconcile with PayWay before cancelling an apparently expired unpaid order
    if (candidate.transactionId && aba) {
      try {
        const result = await aba.checkStatus(candidate.transactionId);
        if (!result.success) {
          // If errorCode !== '6' (where 6 means tran_id not found in ABA), gateway returned an error.
          // Preserve an unresolved state when verification is unavailable.
          if (result.errorCode !== '6') {
            console.warn(`ABA verification unavailable for order ${candidate.id}: ${result.error}. Preserving unresolved state.`);
            continue;
          }
        } else if (result.status === 'APPROVED') {
          // The customer was actually charged! Settle the order as paid instead of cancelling it.
          if (result.amount != null && Math.abs(result.amount - candidate.totalAmount) <= 0.01) {
            const updatePaid = await prisma.order.updateMany({
              where: { id: candidate.id, status: 'pending' },
              data: { status: 'paid' },
            });
            if (updatePaid.count > 0) {
              await settleOrderPoints(prisma, candidate.id);
            }
            continue;
          }
        }
      } catch (err) {
        // Verification is unavailable (network exception). Preserve unresolved state.
        console.warn(`ABA checkStatus threw for order ${candidate.id}, skipping cancellation:`, err);
        continue;
      }
    }

    // Close transaction on ABA PayWay to reject any late incoming payment
    if (candidate.transactionId) {
      await closeAbaTransaction(candidate.transactionId).catch((err) => {
        console.warn(`ABA close-transaction failed for expired order ${candidate.id}:`, err);
      });
    }

    // 2. Re-check the status inside the write.
    const result = await prisma.order.updateMany({
      where: { id: candidate.id, paymentMethod: 'khqr', status: 'pending' },
      data: { status: 'cancelled', cancelReason: 'Payment expired' },
    });
    if (result.count === 0) continue;

    // Give the reserved points back.
    await refundOrderPoints(prisma, candidate.id);
    cancelled.push(candidate.id);
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
