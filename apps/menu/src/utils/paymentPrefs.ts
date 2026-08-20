/**
 * The customer's default payment method, remembered between visits.
 *
 * localStorage can throw (private mode, some embedded webviews), so every
 * access is guarded and simply falls back to the default.
 */
export type PaymentMethod = 'khqr' | 'cash';

const KEY = 'aicha:defaultPaymentMethod';
// Cash is the safe default: it always works, while KHQR needs the shop's ABA
// credentials to be set up on the server.
const DEFAULT: PaymentMethod = 'cash';

export function getDefaultPaymentMethod(): PaymentMethod {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'khqr' || stored === 'cash') return stored;
  } catch {}
  return DEFAULT;
}

export function setDefaultPaymentMethod(m: PaymentMethod): void {
  if (m !== 'khqr' && m !== 'cash') return;
  try {
    localStorage.setItem(KEY, m);
  } catch {}
}
