# Testing ABA PayWay with the sandbox

This is the step-by-step live test. Do it once you have sandbox credentials.
Everything else in the payment code is already covered by automated tests that
run without credentials.

## Step 1 — Get sandbox credentials

Register here: https://sandbox.payway.com.kh/register-sandbox/

ABA will email you three things:

- a **merchant ID**
- an **API key** (also called the public key)
- a **webhook secret**

## Step 2 — Put them in the API config

Open `apps/api/.env` and add:

```env
ABA_MERCHANT_ID="your_merchant_id"
ABA_API_KEY="your_api_key"
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"
ABA_WEBHOOK_SECRET="your_webhook_secret"
```

If `apps/api/.env` does not exist yet, copy `apps/api/.env.example` first.

Never commit this file. It is already in `.gitignore`.

## Step 3 — Restart the API

```bash
cd apps/api
npm run dev
```

The server must be restarted. It reads the values from the environment.

## Step 4 — Place a small test order

Start the customer app in another terminal:

```bash
cd apps/menu
npm run dev
```

Open it, add one cheap item, choose **KHQR**, and confirm.

You should see:

- a **Pay with ABA Mobile** button,
- a **QR code** picture,
- a **countdown** starting near 15:00.

## Step 5 — Pay it

Either scan the QR with ABA Mobile, or press the button to open ABA's checkout
page.

Within a few seconds of paying, the screen should move to the success page and
show your pickup code. The app asks the server every 3 seconds, and the server
asks ABA.

## Step 6 — Check the result

```bash
curl http://localhost:4000/api/payment/aba/status/<orderId>
```

You should get `"status": "APPROVED"` and `"orderStatus": "paid"`.

---

## If something goes wrong

**"ABA PayWay is not configured"**
`ABA_MERCHANT_ID` or `ABA_API_KEY` is empty, or you did not restart the server.

**"Wrong Hash"**
The API key is wrong, or the request fields changed. The list of fields and
their exact order must match between `hash.ts` and `client.ts` in
`packages/aba-payway-sdk-unofficial`. Changing one without the other breaks the
signature.

**"ABA PayWay returned a non-JSON response"**
ABA sent back an HTML page instead of data. This almost always means the
merchant ID or API key is wrong. The message includes the start of the page, so
read it.

Note: when this was tested with deliberately fake credentials, ABA replied with
its HTML checkout page (HTTP 200), not an error code. So an HTML reply is the
normal sign of bad credentials.

**The QR picture is an empty grey box**
ABA returned no `qr_string`. The request must send `payment_option=abapay_khqr`,
which the server does. If it still happens, your merchant account may not have
KHQR enabled — ask ABA.

**The screen never leaves "Waiting for payment confirmation"**
Check the API logs. The status route talks to ABA directly, so it works even
without a public webhook URL. If the status route returns 502, the server cannot
reach ABA.

## About webhooks

Webhooks are the other way ABA tells us a payment landed. They only work when
your server has a public HTTPS address — ABA cannot reach `localhost`.

For local testing you do not need them. The status route is enough.

When you do set them up, remember: if `ABA_WEBHOOK_SECRET` is empty the server
**rejects** every webhook with 503. That is on purpose. An unverified webhook
would let anyone mark an order as paid.
