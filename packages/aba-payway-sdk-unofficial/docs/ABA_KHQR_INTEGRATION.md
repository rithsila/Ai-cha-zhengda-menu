# ABA PayWay integration in this project

**Status:** implemented, waiting on real sandbox credentials for a live test.

This describes how the Ai-Cha / Zhengda Telegram Mini App takes KHQR payments
through ABA PayWay. For the SDK itself, see the package `README.md`. For the
live test steps, see `docs/ABA_SANDBOX_TESTING.md` in the repo root.

## How the money flows

```
Customer app                 API (apps/api)               ABA PayWay
------------                 --------------               ----------
POST /api/orders        -->  creates a pending order
                             (prices come from the DB,
                              never from the client)

POST /api/payment/
     aba/create         -->  createPurchase() ---------->  returns checkout URL,
                                                           deeplink and QR data
                        <--  QR image + links

customer pays with ABA Mobile or by scanning ------------> ABA

GET  /api/payment/           checkStatus() ------------->  "APPROVED"?
     aba/status/:orderId <-- marks the order paid,
     (every 3 seconds)       credits loyalty points
```

There are two ways to learn that a payment landed:

1. **The status route** — we ask ABA. Works everywhere, including a laptop.
2. **The webhook** — ABA tells us. Needs a public HTTPS address.

The app uses the status route. The webhook is a backup for production.

## The three routes

All three live in `apps/api/src/app.ts`.

All three return **503** if `ABA_MERCHANT_ID` or `ABA_API_KEY` is missing. The
server never falls back to fake credentials, because that turns a simple
configuration mistake into a confusing "wrong hash" error.

### `POST /api/payment/aba/create`

Starts a payment for an order that already exists.

Request: `{ "orderId": "..." }`

Response:

```json
{
  "checkoutUrl": "https://checkout-sandbox.payway.com.kh/checkout/...",
  "abapayDeeplink": "abapay://...",
  "qrString": "00020101021229370016...",
  "khqrSvg": "data:image/svg+xml;base64,...",
  "transactionId": "EA...",
  "expiresAt": "2026-08-19T10:00:00.000Z"
}
```

Other replies: `404` unknown order, `409` already paid or zero total, `502` ABA
refused (the message is ABA's own).

Two details that matter:

- It sends `payment_option=abapay_khqr`. Without it ABA returns no QR data at
  all and the customer sees an empty grey box.
- It sends `items` as base64-encoded JSON, which is what ABA expects.

If the order already has a transaction ID, the same one is reused, so
refreshing the checkout page does not leave an orphan transaction at ABA.

### `GET /api/payment/aba/status/:orderId`

Asks ABA whether the payment landed. This is what the checkout screen polls.

Response: `{ "status": "...", "orderStatus": "...", "pickupCode": "...", "expiresAt": "..." }`

`status` is one of `APPROVED`, `PENDING`, `DECLINED`, `EXPIRED`, `ERROR`.

When ABA says approved **and** the amount matches the order total, the order is
marked `paid` and loyalty points are credited.

### `POST /api/payment/aba/webhook`

ABA calls this when a payment completes.

It is deliberately strict:

- No `ABA_WEBHOOK_SECRET` configured → **503**. An unverified webhook would let
  anyone mark an order as paid.
- Bad or missing signature → **401**.
- Valid signature → the server still calls `checkStatus` and compares the
  amount before settling anything. The payload's own `status` field is never
  trusted.
- Amount does not match the order total → **400**, order stays pending.
- Order already paid → **200** and nothing changes. ABA retries webhooks, and
  points must not be credited twice.

## Environment variables

In `apps/api/.env`:

| Variable | What it is |
| --- | --- |
| `ABA_MERCHANT_ID` | Your merchant ID from ABA |
| `ABA_API_KEY` | Your API key (public key) |
| `ABA_BASE_URL` | `https://checkout-sandbox.payway.com.kh` for testing, `https://checkout.payway.com.kh` for real money |
| `ABA_WEBHOOK_SECRET` | Secret for checking webhook signatures. Empty means webhooks are rejected. |
| `ABA_WEBHOOK_URL` | Public URL ABA returns the customer to. Optional locally. |

## The hash

Every call to ABA is signed. The signature is:

```
Base64( HMAC_SHA512( API_KEY, all parameters joined in a fixed order ) )
```

The exact order is the array in `src/hash.ts`. The same fields, in the same
order, are built in `src/client.ts`. **If you change one, change the other**, or
every request fails with "Wrong Hash".

Empty optional fields are sent as empty strings, never left out.

`req_time` is `YYYYMMDDHHmmss` in **UTC**. Using the server's local clock makes
requests look expired from any machine outside UTC.

## Status codes from ABA

- `0` — success
- non-zero — an error; `description` explains it
- `1` — wrong hash
- `11` — invalid merchant

## Before going live

- [ ] Get production credentials from ABA Bank
- [ ] Set `ABA_BASE_URL` to `https://checkout.payway.com.kh`
- [ ] Set a real `ABA_WEBHOOK_SECRET` and register the webhook URL with ABA
- [ ] Set `VITE_API_URL` in `apps/menu` to the public API address
- [ ] Test with a small real payment
- [ ] Watch the logs for `ABA createPurchase failed` and `ABA amount mismatch`

## Testing

Automated tests need no credentials and make no network calls:

```bash
cd packages/aba-payway-sdk-unofficial && npm test   # SDK
cd apps/api && npm test                            # the three routes
```

The route tests cover the security rules directly: unsigned webhooks, wrongly
signed webhooks, short payments, and repeated webhooks.

For the live test, see `docs/ABA_SANDBOX_TESTING.md`.
