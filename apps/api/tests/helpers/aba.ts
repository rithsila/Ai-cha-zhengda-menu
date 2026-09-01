import { vi } from 'vitest';

/**
 * Test helpers for the ABA PayWay routes.
 *
 * Two things make these routes awkward to test:
 *  - they refuse to run without credentials (by design), and
 *  - they always call back to ABA to confirm a payment.
 *
 * So every test turns the credentials on and stubs global fetch. Nothing here
 * touches the network.
 */

export const ABA_ENV = {
  ABA_MERCHANT_ID: 'test_merchant',
  ABA_API_KEY: 'test_api_key',
  ABA_BASE_URL: 'https://checkout-sandbox.payway.com.kh',
} as const;

/** Turn ABA credentials on for the current test. */
export function enableAba(overrides: Partial<Record<keyof typeof ABA_ENV, string>> = {}) {
  Object.assign(process.env, ABA_ENV, overrides);
}

/** Turn them off again, so a later test can check the 503 path. */
export function disableAba() {
  for (const key of Object.keys(ABA_ENV)) delete process.env[key];
}

const DEFAULT_PURCHASE = {
  status: 0,
  description: 'Success',
  abapay_deeplink: 'abamobilebank://ababank.com?type=payway&qrcode=abc123',
  qr_string: '00020101021229370016KHQR-TEST-DATA',
  qr_image: 'data:image/png;base64,cXI=',
  expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
};

/**
 * Stub global fetch and route by URL. The new SDK returns ABA's own QR image,
 * so the payment flow has no secondary QR-rendering network request.
 */
export function stubAbaFetch(opts: { purchase?: any; status?: any } = {}) {
  // The SDK reads the body with .text() and parses it itself, so a stub must
  // provide text() -- json() alone is not enough.
  const reply = (payload: any) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });

  const spy = vi.fn(async (url: any) => {
    const href = String(url);
    if (href.includes('check-transaction-2')) {
      return reply(opts.status ?? { status: 0, payment_status: 'PENDING' });
    }
    if (href.includes('/payments/purchase')) {
      return reply(opts.purchase ?? DEFAULT_PURCHASE);
    }
    return { ok: false, status: 404, text: async () => 'not stubbed' };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** An ABA check-transaction reply saying "paid, this much". */
export function approvedStatus(amount: number) {
  return { status: 0, payment_status: 'APPROVED', amount: amount.toFixed(2), currency: 'USD' };
}
