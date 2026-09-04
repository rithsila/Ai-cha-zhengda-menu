/**
 * The customer's default payment method, remembered between visits.
 *
 * localStorage can throw (private mode, some embedded webviews), so every
 * access is guarded and simply falls back to the default.
 */
export type PaymentMethod = 'khqr' | 'cash';

const KEY = 'aicha:defaultPaymentMethod';
// KHQR is the default payment method.
const DEFAULT: PaymentMethod = 'khqr';

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
