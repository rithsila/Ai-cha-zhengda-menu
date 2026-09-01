# Testing ABA PayWay with the sandbox

This is the step-by-step live test. Do it once you have sandbox credentials.
Everything else in the payment code is already covered by automated tests that
run without credentials.

## Step 1 — Get sandbox credentials

Register here: https://sandbox.payway.com.kh/register-sandbox/

ABA will email you two things:

- a **merchant ID**
- an **API key** (also called the public key)

## Step 2 — Put them in the API config

Open `apps/api/.env` and add:

```env
ABA_MERCHANT_ID="your_merchant_id"
ABA_API_KEY="your_api_key"
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"
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

- an **Open ABA Mobile** button (on supported phones),
- a **QR code** picture,
- a **countdown** starting near 15:00.

## Step 5 — Pay it

Either scan the QR with ABA Mobile, or press **Open ABA Mobile** to open the
payment directly in the app. The QR remains visible as the fallback.

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
The API key is wrong, or the merchant credentials do not match the selected
sandbox. The installed SDK signs requests; do not reimplement its hash logic.

**"ABA PayWay returned a non-JSON response"**
ABA sent back an HTML page instead of data. This almost always means the
merchant ID or API key is wrong. The message includes the start of the page, so
read it.

Note: when this was tested with deliberately fake credentials, ABA replied with
its HTML checkout page (HTTP 200), not an error code. So an HTML reply is the
normal sign of bad credentials.

**The QR picture is an empty grey box**
ABA returned no `qr_image`. The request sends
`payment_option=abapay_khqr_deeplink`, which returns both the QR and the ABA
Mobile deeplink. If it still happens, your merchant account may not have KHQR
enabled — ask ABA.

**The screen never leaves "Waiting for payment confirmation"**
Check the API logs. The status route talks to ABA directly, so it works even
without a public webhook URL. If the status route returns 502, the server cannot
reach ABA.

## Payment confirmation

The app confirms payment by polling its own status route, which asks ABA's
server using the transaction id. A return URL or client-side success signal is
never enough to mark an order paid.
