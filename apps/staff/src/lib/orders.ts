import type { ButtonVariant } from '../components/ui';
import type { Order } from '../types';

/**
 * Past this age an order is not "late", it is history — a leftover row from a
 * previous shift. It gets a date instead of an hour count and never turns red,
 * because an alarm that is always on is not an alarm.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type Tone = 'normal' | 'warn' | 'late';

/** Minutes at which each lane turns amber, then red. Shown to staff in the board legend. */
export const TONE_THRESHOLDS: Record<string, { warn: number; late: number }> = {
  pending: { warn: 5, late: 10 },
  paid: { warn: 5, late: 10 },
  preparing: { warn: 8, late: 15 },
  ready: { warn: 10, late: 20 },
};

export function formatElapsed(
  createdAt: string,
  now: number,
): { label: string; stale: boolean } {
  const placed = new Date(createdAt).getTime();
  const ms = now - placed;

  if (ms >= STALE_AFTER_MS) {
    return {
      label: new Date(placed).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      }),
      stale: true,
    };
  }

  const mins = Math.floor(ms / 60000);
  if (mins < 1) return { label: 'now', stale: false };
  if (mins < 60) return { label: `${mins}m`, stale: false };
  const hours = Math.floor(mins / 60);
  return { label: `${hours}h ${String(mins % 60).padStart(2, '0')}m`, stale: false };
}

export function elapsedTone(status: string, createdAt: string, now: number): Tone {
  const ms = now - new Date(createdAt).getTime();
  if (ms >= STALE_AFTER_MS) return 'normal';
  const limits = TONE_THRESHOLDS[status];
  if (!limits) return 'normal';
  const mins = ms / 60000;
  if (mins > limits.late) return 'late';
  if (mins > limits.warn) return 'warn';
  return 'normal';
}


export interface StatusConfig {
  buttonLabel: string;
  next: string;
  button: ButtonVariant;
}

/*
 * `paid` is a real status: the ABA KHQR webhook sets it the moment a customer's
 * QR payment clears. It used to render in no lane at all while still counting
 * toward the header badge, so a paid order silently vanished from the board.
 * It sits in the Pending lane wearing a PAID tag — the money is in, the drink
 * is not made yet.
 */
export const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: { buttonLabel: 'Start preparing', next: 'preparing', button: 'primary' },
  paid: { buttonLabel: 'Start preparing', next: 'preparing', button: 'primary' },
  preparing: { buttonLabel: 'Ready for pickup', next: 'ready', button: 'success' },
  ready: { buttonLabel: 'Hand over', next: 'completed', button: 'secondary' },
};

export const PAID_STATUSES = new Set(['paid', 'completed']);

/* -------------------------------------------------------------------------- */
/* Waiting for payment                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The order row is written *before* payment is attempted, so a KHQR order sits
 * at `pending` until ABA confirms it. Nobody has paid for those, and making one
 * is a drink given away. Cash at `pending` is the opposite: a real ticket the
 * counter collects on handover, which staff should absolutely start.
 *
 * That is the whole difference, and it is the reason this predicate exists
 * rather than a status check at each call site.
 */
export function isAwaitingPayment(
  order: Pick<Order, 'paymentMethod' | 'status'>,
): boolean {
  return order.status === 'pending' && order.paymentMethod.toLowerCase() === 'khqr';
}

/**
 * A null `paymentExpiresAt` means no QR was ever issued (ABA was unreachable at
 * checkout), not that the QR expired — so it is never "expired", just unpaid
 * with no clock. Only a real timestamp in the past counts.
 */
export function paymentExpiryAt(
  order: Pick<Order, 'paymentExpiresAt'>,
): number | null {
  if (!order.paymentExpiresAt) return null;
  const at = new Date(order.paymentExpiresAt).getTime();
  return Number.isFinite(at) ? at : null;
}

/** "4:07" — mm:ss, clamped at zero so a passed deadline never renders negative. */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
