# ABA PayWay Sandbox Testing Guide

How to test ABA PayWay end to end, from scratch, before Ai-Cha & Zhengda switch
to real money.

Last verified against ABA's docs and against this repo's live sandbox
credentials: **2026-09-01**.

---

## 1. Is sandbox testing required? Yes.

Not optional, and not just good practice — it is how ABA gates production
access. From ABA's own integration manual (PayWay v2.0.020, Merchant Portal
section):

> Production credentials will be shared once the integration on the Staging
> environment is **reviewed by our eMerchant integration team**.

So the order of events is fixed:

1. You integrate against sandbox.
2. You produce sandbox transactions ABA can look at.
3. ABA reviews the integration.
4. **Then** ABA issues production merchant ID + API key.

You cannot skip to production and test there. There is also no "test mode"
switch on a production merchant account — sandbox and production are separate
hosts with separate credentials.

Beyond the gate, sandbox is where you find the three failures that are painful
to debug live: a wrong hash, a non-whitelisted IP, and a payment option your
merchant profile does not actually have enabled.

---

## 2. Where this project stands right now

These were checked on 2026-09-01 by calling ABA sandbox directly with the
credentials in `apps/api/.env`:

| Check | Result |
| --- | --- |
| `ABA_MERCHANT_ID` / `ABA_API_KEY` present | ✅ set |
| `ABA_BASE_URL` | ✅ `https://checkout-sandbox.payway.com.kh` |
| Hash / API key accepted by ABA | ✅ (no `code 5 Invalid Hash`) |
| Merchant profile valid | ✅ (no `code 8 Invalid merchant profile`) |
| API reachable from this machine (whitelisting) | ✅ (no `Invalid Domain Name`) |
| Credentials match the sandbox onboarding email | ✅ confirmed by the account owner |
| `createPurchase` with `abapay_khqr_deeplink` | ✅ returns a real KHQR + ABA deeplink |
| `checkStatus` on that transaction | ✅ returns `PENDING`, amount `0.10` |
| KHQR merchant name in the payload | ✅ `rithsilanew2020` — same account as the portal |
| KHQR **payable** by a live banking app | ❌ no — Bakong account is the placeholder `111111111111111` (section 7) |

**Meaning: your integration already works against sandbox.** Credential setup,
hashing, and KHQR generation are done. What is left is the part below —
proving a payment actually settles, and collecting the evidence ABA asks for.

Two notes from that check:

- ABA's response does **not** include an expiry, so the API falls back to the
  SDK's `getQRExpiration()` (~15 minutes). The countdown you see on the
  checkout screen is ours, not ABA's.
- `apps/api/.env` contains `ABA_WEBHOOK_URL` and `ABA_RETURN_DEEPLINK`. Neither
  is read anywhere in the codebase today — this app confirms payment by
  polling, not by webhook. Leave them or delete them; they do nothing.

---

## 3. Before you test — prerequisites

Work through this list first. Anything unchecked will waste an afternoon.

### 3.1 Accounts and access

- [ ] **Sandbox merchant account.** Register at
      <https://sandbox.payway.com.kh/register-sandbox/>. ABA emails you a
      sandbox **Merchant ID** and **API Key**.
- [ ] **Re-read that onboarding email.** ABA's portal states it carries
      "API keys **and testing instructions**". Those instructions are
      account-specific and outrank this guide and the public docs — in
      particular, if ABA documents a way to pay a sandbox KHQR, that is where
      it will be. Search it before opening a support ticket.
- [ ] **Sandbox merchant portal login.** <https://sandbox.payway.com.kh/> —
      this is the current portal (PayWay Portal V2.0), and it shows a
      **Sandbox Mode** banner across the top so you always know which
      environment you are in. ABA's 2022 PDF still names the older
      `merchant-sandbox.payway.com.kh/login`; go by the live site.
- [ ] **Confirm which payment options your sandbox profile has enabled.** Ours
      has ABA KHQR. If yours does not, `createPurchase` fails and no amount of
      code fixes it — ABA has to enable it.

### 3.2 Which key is which (ABA sends five values)

ABA's onboarding email contains more than the two values this app uses, and
their naming is actively misleading. Sort them out before you paste anything.

ABA's sandbox email for this project contained exactly five items, labelled
this way:

| # | ABA's label | What it really is | Used for | Goes in `.env`? |
| --- | --- | --- | --- | --- |
| 1 | **Merchant Id** — `ec460802` | account identifier | every request | ✅ `ABA_MERCHANT_ID` |
| 2 | **Public Key** — a 40-char hex string | **HMAC-SHA512 shared secret** (this is the "API key") | signing the `hash` on purchase and check-transaction | ✅ `ABA_API_KEY` |
| 3 | **RSA Public Key** — `-----BEGIN PUBLIC KEY-----` | genuine RSA public key | encrypting `merchant_auth` for refund / pre-auth / payout | ❌ not yet |
| 4 | **RSA Private Key** — `-----BEGIN RSA PRIVATE KEY-----` | genuine RSA private key | its counterpart in those flows | ❌ not yet |
| 5 | **API Url** — `…/api/payment-gateway/v1/payments/purchase` | the full purchase endpoint | see 3.3 — only the origin goes in `.env` | ⚠️ partly |

Note item 2: ABA labels the HMAC secret **"Public Key"**, with no "API key"
anywhere in the email. That is the value this app calls `ABA_API_KEY`.

**⚠️ ABA's "public key" is not public.** Throughout the integration manual the
HMAC secret is written as `public_key`:

```php
base64_encode(hash_hmac('sha512', $string, $public_key, true));
```

That is your **API key**, and it is a shared secret — anyone holding it can sign
requests as you. The SDK uses the same unfortunate name internally
(`generateABAHash(params, publicKey)`), which is why `ABAPayWay({ apiKey })`
feeds straight into it. Never commit it, never ship it to the browser, and don't
let the word "public" talk you into treating it casually.

**Telling them apart:** the HMAC secret is a short opaque string (this
project's is 40 hex characters). The RSA keys are long PEM
blocks. If it has a `-----BEGIN` header, it is *not* the value that belongs in
`ABA_API_KEY` — item 2 is, despite both being named "public key".

You do not need to guess which is which here: the value currently in
`ABA_API_KEY` was verified against ABA's sandbox on 2026-09-01 and signs valid
hashes, so it is the right one.

### 3.3 The API Url ABA sends — and the v1/v3 confusion

ABA's email gives the **full purchase endpoint**:

```
https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase
```

`ABA_BASE_URL` takes the **origin only** — the SDK appends the path itself:

```env
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"   # ✅
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"  # ❌
```

Pasting the whole URL from the email produces a doubled path and a 404 that
looks nothing like a credentials problem.

**On "v1 vs v3": the `v1` in that path is correct and current — do not change
it.** Verified in the SDK on 2026-09-01, the only two endpoints it calls are:

```
/api/payment-gateway/v1/payments/purchase
/api/payment-gateway/v1/payments/check-transaction-2
```

There is no v3 URL. "PayWay v3" refers to the platform generation, not a path
segment — it changes the *response shape* (the current API returns `qrString`,
`qrImage` and `abapay_deeplink` and no longer sets `checkout_url`, which is why
`app.ts` treats `checkoutUrl` as optional), while the URL stays on `v1`. The
newer-generation detail that *is* visible in the path is the `-2` suffix on
`check-transaction-2`.

Nothing here needs changing: the live test on 2026-09-01 hit exactly this v1
purchase path with these credentials and got a valid KHQR back.

### 3.4 What to do with the RSA key pair

**Nothing, for now — but store them properly.**

This app only performs KHQR checkout: `purchase` and `check-transaction`. Both
authenticate with HMAC alone. Nothing in `apps/api` reads an RSA key, and the
SDK exposes no parameter for one.

The RSA pair is required only by the APIs that move money *back* or *out*, where
ABA wants the request body encrypted as well as signed:

- **Refund** — `merchant_auth` = `RSA.PUBLIC(merchant_id, tran_id, refund_amount)`,
  and separately `hash` = HMAC with the API key. ABA's manual notes refunds
  "require different API keys for RSA encryption and are provided upon request".
- **Pre-auth completion / cancellation** — same `merchant_auth` pattern.
- **Beneficiary Payout** — visible in your sandbox portal's left nav.

So:

- [ ] Keep the pair in a password manager / secure note with the rest of the
      onboarding email. They are as sensitive as the API key.
- [ ] **Do not add them to `.env` or to Railway variables yet.** An unused
      secret sitting in a deployed environment is risk with no upside; add them
      the day you implement refunds, not before.
- [ ] If the shop later wants staff-initiated refunds, that is a new feature —
      a `merchant_auth` RSA step plus a refund route — not a config change.

One caveat, stated plainly: ABA's v2 manual documents *encrypting with the
public key* but never says what the **private key** is for. It is most likely
the counterpart for decrypting refund/payout responses. If you implement
refunds, get that confirmed by ABA rather than guessing — the account-specific
testing instructions in your onboarding email are the first place to look.

### 3.5 Whitelisting (the one people forget)

From ABA's manual:

> These APIs are only accessible from a **whitelisted domain or IP**. Developers
> need to provide one domain/IP to PayWay Integration team to whitelist before
> calling the APIs.

This applies to the machine making the **server-side** call — that is
`apps/api`, not the customer's phone.

- [ ] Decide where the API will run during testing and give ABA that public IP
      or domain. This machine's current public IP is what ABA sees when you run
      the API locally; a home/office IP usually changes, so prefer testing from
      the UAT/production host (Railway, or the Proxmox box behind the
      Cloudflare Tunnel — see `docs/DEPLOY_UAT_PROXMOX.md`).
- [ ] Also register the domain used in `continue_success_url` — ABA rejects an
      unregistered one with `code 5 Invalid Continue Success URL`.

### 3.6 Local setup

- [ ] `apps/api/.env` exists with:

```env
ABA_MERCHANT_ID="your_sandbox_merchant_id"
ABA_API_KEY="your_sandbox_api_key"
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"
WEBAPP_URL="http://localhost:5173"
CORS_ORIGINS="http://localhost:5173,http://localhost:5174"
```

- [ ] Never commit `.env`.
- [ ] KHQR is switched on for the shop (`enableKhqr`, in the staff app's store
      settings). The API hides KHQR when either the credentials or that toggle
      are missing.

### 3.7 Know the two environments

| | Sandbox | Production |
| --- | --- | --- |
| API host | `https://checkout-sandbox.payway.com.kh` | `https://checkout.payway.com.kh` |
| Merchant portal | `https://sandbox.payway.com.kh/` (Sandbox Mode banner) | `https://merchant.payway.com.kh/login/` |
| Credentials | emailed on sandbox registration | issued after ABA reviews your integration |
| Money | none | real |

Sandbox transactions never appear in the production ABA merchant portal.

---

## 4. What this app does during a payment

Worth reading once — it explains what each test step is actually proving.

1. Customer checks out with `paymentMethod: "khqr"`; the order row is created
   as `pending`.
2. Menu calls `POST /api/payment/aba/create`.
3. API calls ABA's Purchase API with `payment_option=abapay_khqr_deeplink`,
   reusing `order.transactionId` if one already exists (so a page refresh does
   not orphan a transaction at ABA).
4. ABA returns `qrString`, `qrImage` (PNG data URI), `abapay_deeplink`, and
   store links. The API stores `paymentExpiresAt`.
5. `KhqrPaymentPanel` shows the QR + ABA Mobile button and polls
   `GET /api/payment/aba/status/:orderId` **every 3 seconds**.
6. That route calls ABA's `check-transaction`. The order flips to `paid` **only**
   when ABA answers `APPROVED` *and* the paid amount matches the order total
   within one cent.
7. Unpaid KHQR orders are swept and cancelled by `apps/api/src/expiry.ts`
   (~15 min after the QR, or 30 min after order creation if the QR was never
   requested), and reserved loyalty points are handed back.

Deliberate design points, so you test the right thing:

- A browser/deeplink return is **never** treated as proof of payment. Only
  ABA's server-side status is.
- With no credentials the API returns **503**, never a fake QR — a config
  mistake stays a config mistake instead of becoming a mystery hash error.
- There is no webhook. Polling is used because ABA cannot reach a laptop.

---

## 5. The sandbox portal — what's in it, and the empty list

Confirmed against the live portal on 2026-09-01. A gold **Sandbox Mode** banner
runs across the top of every page; if you can't see it, you are in production.

### 5.1 What each section does

| Section | Use it for |
| --- | --- |
| **Transactions** | The list you verify payments against. Filters default to *Last 7 days*; there's a **Search Order ID** box top-right. |
| **Invoices** | Create a payable invoice — **this is the useful one for KHQR** (see 5.3). |
| **Customers** | Saved payers; the invoice form requires one, so create a dummy customer first. |
| **Payment Link** | A standalone payable link — the other way to produce a payable sandbox transaction with no code. |
| **Discount Programs** / **Beneficiary Payout** | Not used by this app. |
| **APIs & Docs** (top-right) | Where your sandbox credentials and API settings live. |
| ⚙️ **Settings** (top-right) | Merchant profile — check the **merchant ID** here (see 5.2). |

The blue **+** button on the Transactions page opens **New Transaction** — a
virtual terminal that takes **Amount + Card Number + Expiry + CVV only**. There
is no KHQR option in it. Combined with the test cards in section 8, it is the
fastest way to prove the portal works and to put a first row in the list, but
it tests *nothing* about this app.

### 5.2 "There is no transaction" — what it means

Expect this, and don't panic. On 2026-09-01 the API confirmed transaction
`EAMTIKKTZ547OH` exists under merchant `ec460802` with status `PENDING` and
amount `0.10`, while the portal's Transactions list showed **"There is no
transaction."**

**The reason: the list shows payments that were actually attempted, not QR
codes that were merely generated.** A `PENDING` QR nobody scanned has no
payment to display. To make a row appear you have to *pay* something — see 5.4.

The rival explanation — that the portal login and the API credentials are two
different sandbox merchants — is **ruled out by evidence, not assumption**.
Decoding the KHQR that ABA returned for merchant `ec460802` gives EMV tag 59
(merchant name):

```
tag 59 (15): rithsilanew2020
```

That is the portal account name. The credentials in `.env` and the portal you
are logged into are the same sandbox merchant.

Note that the portal **does not display your merchant ID or API key anywhere**.
**APIs & Docs** (top-right) contains only two entries:

- *API Access* — "API keys and testing instructions have been sent to your
  email."
- *Developer Documentation* — a link to <https://developer.payway.com.kh/>.

So the onboarding email is the single source of truth for credentials. If you
ever need to confirm which merchant a `.env` belongs to, compare it against that
email — there is no in-portal lookup.

### 5.3 Paying a sandbox KHQR without your app

Your **New Invoice** form offers three payment types: *Debit/Credit Card*,
*ABA PAY*, and **KHQR**. That matters — it is the clearest signal available
that KHQR exists on your sandbox profile, and it gives you a payable KHQR
target that doesn't involve your code at all.

Try this before concluding sandbox KHQR is unpayable:

1. **Customers** → create a dummy customer.
2. **Invoices** → **New Invoice** → pick that customer.
3. Under *Select payment type*, tick **KHQR**.
   - If KHQR is greyed out and won't tick, it is **not enabled** on your sandbox
     profile — that is your answer, and the thing to email ABA about.
4. Set a tiny amount (0.10 USD), fill the dates, and issue it.
5. Open the invoice's payment page and try to pay the KHQR it shows.
6. Watch **Transactions** to see whether the row appears and settles.

The outcome tells you exactly what you need to know:

- **It settles** → sandbox KHQR is payable on your profile, so Step 4 of the
  test run is a real test. Do it through the app next.
- **It won't settle** → KHQR settlement isn't testable in sandbox. Record it,
  and plan the small real production transaction in section 12 instead.

Either way you learn it in ten minutes, without touching the codebase.
**Payment Link** works the same way if you'd rather skip invoices.

### 5.4 Getting your first real transaction into the list

You asked the right question: ABA expects the sandbox to contain *transactions*,
and generating QR codes produces none. Something has to actually pay.

The only payer ABA gives you in sandbox is **card**, through the portal's own
tools. So:

1. **Transactions** → the blue **+** → **New Transaction**.
2. Amount `0.15` USD.
3. Card number, expiry and CVV from section 8 — use a **success** card, e.g.
   `5156 8399 3770 6777`, exp `01/30`, CVV `993`.
4. **Charge**.

A row now appears in **Transactions**, and it should read APPROVED. That is your
proof that the sandbox account is live and that the list works — and it is the
kind of transaction ABA's review wants to see.

It tests nothing about this app, though. For that, do 5.5.

### 5.5 Proving the app's settlement path with a genuinely paid transaction

This is the important one. The app's `confirmAbaPayment` does not care *how* a
transaction was paid — it asks ABA for a status and checks the amount. So a
card transaction paid in the portal can be used to exercise the entire
server-side settlement path, without any KHQR payer.

1. Pay a transaction in the portal for an amount you can match exactly, e.g.
   `0.15` (5.4).
2. Copy its **transaction / order ID** from the Transactions list.
3. Confirm the API can see it — reuse the Step 0 script, replacing the id:

   ```
   checkStatus('<id from portal>')  ->  {"success":true,"status":"APPROVED","amount":0.15}
   ```

   If this says `tran_id not found`, the portal id is not the `tran_id` the API
   uses; skip to 5.6 and raise it with ABA.
4. Place a real KHQR order in the app whose total is **exactly `0.15`**, and let
   the checkout screen generate its QR. Note the order id.
5. Point that order at the paid transaction (from `apps/api`):

   ```bash
   cat > bind.tmp.ts <<'EOF'
   import { PrismaClient } from '@prisma/client';
   const prisma = new PrismaClient();
   prisma.order
     .update({ where: { id: '<orderId>' }, data: { transactionId: '<paid tran_id>' } })
     .then((o) => console.log('bound:', o.id, o.transactionId, o.totalAmount))
     .finally(() => prisma.$disconnect());
   EOF
   npx tsx bind.tmp.ts; rm bind.tmp.ts
   ```

6. Hit the status route:

   ```bash
   curl http://localhost:4000/api/payment/aba/status/<orderId>
   ```

Expected — and this is what you are actually proving:

- ABA returns APPROVED,
- the amount check passes (`0.15` vs `0.15`),
- the order flips to `paid` and gets a pickup code,
- loyalty points settle,
- the order appears as paid on the staff dashboard.

That is every piece of the integration except the KHQR payer itself. Repeat it
once with a **mismatched** amount (bind a `0.15` transaction to a `2.50` order)
and confirm you get `Paid amount does not match the order total` — that check is
what stops a short payment from feeding someone.

This is a testing procedure, not something to run in production. Delete the
scratch order afterwards.

### 5.6 What to send ABA

If their review asks for evidence of a working integration, this is a complete
and honest package:

- Sandbox transaction id(s) paid via the portal, visible in **Transactions**.
- A KHQR generated by the app: transaction id, amount, and the decoded merchant
  name showing `rithsilanew2020`.
- The status-route output showing an order moving to `paid` on ABA's authority.
- The one open question, stated plainly: *"how do we complete a KHQR payment in
  sandbox — the generated QR carries Bakong merchant account `111111111111111`,
  which no live app can resolve?"* (see section 7).

---

---

## 6. Step-by-step test run

### Step 0 — Smoke-test the credentials before touching the UI

Do this first every time. It separates "credentials/whitelisting are broken"
from "my app is broken" in about ten seconds.

Create the file **inside `apps/api`** (it needs that workspace's
`node_modules`), run it, then delete it:

```bash
cd apps/api
cat > aba-smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { ABAPayWay, generateTransactionId } from 'aba-payway-sdk-unofficial';

async function main() {
  const aba = new ABAPayWay({
    merchantId: process.env.ABA_MERCHANT_ID || '',
    apiKey: process.env.ABA_API_KEY || '',
    baseUrl: process.env.ABA_BASE_URL || 'https://checkout-sandbox.payway.com.kh',
  });

  // 1. Credentials + reachability: a fake id should answer "tran_id not found".
  console.log('lookup:', JSON.stringify(await aba.checkStatus('SMOKETEST0000000001')));

  // 2. Real sandbox KHQR (no money moves in sandbox).
  const txn = generateTransactionId();
  const p = await aba.createPurchase({
    transactionId: txn,
    amount: 0.1,
    currency: 'USD',
    items: [{ name: 'Smoke test', quantity: 1, price: 0.1 }],
    paymentOption: 'abapay_khqr_deeplink',
    firstName: 'Ai-Cha',
    lastName: 'Customer',
    returnUrl: 'http://localhost:5173',
    cancelUrl: 'http://localhost:5173',
    continueSuccessUrl: 'http://localhost:5173',
  });
  console.log('txn:', txn, 'success:', p.success, 'error:', p.error);
  console.log('qrImage:', !!p.qrImage, 'deeplink:', !!p.abapayDeeplink);
  console.log('status:', JSON.stringify(await aba.checkStatus(txn)));
}
main().catch(console.error);
EOF
npx tsx aba-smoke.tmp.ts; rm aba-smoke.tmp.ts
```

Expected (this is the actual verified output shape):

```
lookup: {"success":false,"status":"ERROR","error":"tran_id not found","errorCode":"6"}
txn: EAMTIKKTZ547OH success: true error: undefined
qrImage: true deeplink: true
status: {"success":true,"status":"PENDING","amount":0.1,...}
```

`tran_id not found` on step 1 is the **pass** condition — it proves ABA
accepted your hash and merchant ID and simply has no such transaction.

> Use `tsx`, not `ts-node` — `ts-node` is broken in this repo.
> Run from `apps/api`, not from `/tmp`, or Node cannot resolve `dotenv`.

### Step 1 — Start the stack

```bash
npm install     # once, from the repo root
npm run dev
```

- API: <http://localhost:4000>
- Menu and staff: use the exact URLs Vite prints (ports shift if 5173/5174 are taken).

### Step 2 — Confirm the app is offering KHQR

```bash
curl http://localhost:4000/api/payment/methods
```

Expect `{"cash":true,"online":true}`. If `online` is `false`, either the
credentials are missing or `enableKhqr` is off in store settings — fix that
before going further.

### Step 3 — Place a KHQR order

1. Open the customer menu, add one cheap item, go to checkout.
2. Choose **KHQR** and confirm.

Expected on screen:

- a KHQR image,
- an ABA Mobile button / deeplink,
- a countdown starting near 15:00,
- no fake-QR fallback.

Write down the **order ID**. Get the transaction id from the API log or:

```bash
curl http://localhost:4000/api/payment/aba/status/<orderId>
```

This step alone proves your Purchase API integration works.

### Step 4 — Pay the sandbox QR (read sections 5.2 and 7 first)

If ABA has given your sandbox profile a way to pay KHQR, do it now: scan or
open the deeplink, complete the payment, return to the app and wait up to ~5
seconds for the next poll.

Expected:

- checkout screen flips to success,
- pickup code appears,
- order status becomes `paid`.

### Step 5 — Verify with the API

```bash
curl http://localhost:4000/api/payment/aba/status/<orderId>
```

Expect `{"status":"APPROVED","orderStatus":"paid","pickupCode":"..."}`.
`PENDING` means it has not settled yet — wait and repeat, don't loop forever.

### Step 6 — Verify in the ABA sandbox portal

At <https://sandbox.payway.com.kh/> → **Transactions**:

1. Clear the filters, or paste the transaction id into **Search Order ID**.
2. Match the amount and the transaction id.
3. Confirm the status is approved.

If the list says **"There is no transaction"** even though the API says your
transaction exists, see section 5.2 — that is expected for a QR that was
generated but never paid.

> `check-transaction` only covers transactions from the **last 7 days**. Older
> ones need the transaction-list/details API. Don't test with a stale id.

### Step 7 — Verify the staff side

Open the staff dashboard, find the paid order, and move it through
pending → preparing → ready → completed. Payment is worthless if the kitchen
never sees the ticket.

### Step 8 — Test the failure paths

These matter more than the happy path, because they are what protects the shop.

| Case | How | Expected |
| --- | --- | --- |
| Abandoned payment | Create a KHQR order, never pay, wait past expiry | Order is auto-cancelled by the sweeper, never `paid`; loyalty points returned |
| Expired QR | Leave the checkout screen open past the countdown | Status returns `EXPIRED`; screen offers a retry |
| No credentials | Blank `ABA_API_KEY`, restart API | `/api/payment/methods` → `online:false`; create returns **503**, no fake QR |
| Wrong amount | (Review only) | `confirmAbaPayment` rejects a mismatch >1¢ with a 400 and logs it |
| Someone else's order | Poll another customer's order id while signed in | 403 |
| Refresh mid-payment | Reload the checkout page | Same transaction id is reused, not a second one |
| Cancelled order pays late | Pay an already-cancelled order | 409, order does not revive |

---

## 7. Why your sandbox KHQR never gets paid

You reported the QR generates but no scan ever succeeds. That is the expected
outcome, and the QR payload itself explains it — this is no longer guesswork.

Decoding the EMV data ABA returned on 2026-09-01:

```
tag 01 (2):  12                    <- dynamic QR
tag 30:      0016abaakhppxxx@abaa  <- Bakong aggregator: ABA
             0115111111111111111   <- merchant account: FIFTEEN ONES
             0208ABA Bank
tag 52 (4):  7876                  <- merchant category code
tag 53 (3):  840                   <- USD
tag 54 (4):  0.15                  <- amount
tag 58 (2):  KH
tag 59 (15): rithsilanew2020       <- merchant name = your portal account
tag 60 (0):                        <- merchant city: EMPTY
tag 62:      ...EAMTIN1D6FV6G1     <- your transaction id
```

**The Bakong merchant account is `111111111111111` — a placeholder.** The QR is
structurally valid, which is why your app renders it and ABA tracks it as
`PENDING`, but there is no real Bakong merchant behind it. A live ABA Mobile or
Bakong app has nothing to pay. That is why scanning fails, and it is not a bug
in this codebase.

Two useful consequences:

- **Scanning a sandbox QR is safe.** It cannot quietly move real money to a
  real merchant — the account it names does not exist. (Still keep test amounts
  tiny out of habit.)
- **KHQR settlement is very likely not testable in sandbox at all**, which
  matches ABA's published test resources covering **cards only** (section 8).

So the plan:

1. **Stop treating this as a failure to fix.** Record Step 4 as *blocked at the
   payer, by design of the sandbox* — generation, expiry, polling, sweeping,
   amount checking and the staff flow are all still testable, and 5.5 shows how
   to prove the settlement path with a card-paid transaction instead.
2. **Try the portal's Invoice or Payment Link with KHQR ticked** (5.3). If ABA
   substitutes a payable QR there, you have a KHQR payer after all. If KHQR is
   greyed out, that is confirmation.
3. **Re-read the onboarding email's testing instructions** before asking ABA
   anything — they are account-specific.
4. **Then email ABA integration support**, quoting the placeholder account.
   Ask for either a sandbox payer that can settle KHQR, or written confirmation
   that it cannot be tested in sandbox and what they want demonstrated instead.
   Section 5.6 lists the evidence to attach.
5. **Fix `tag 60` before production.** Merchant city is empty, and ABA's KHQR
   guideline requires a city from the approved province list, with the merchant
   name matching the registered profile (max 25 chars). Have ABA set both on the
   production profile — `rithsilanew2020` is not the name you want customers
   seeing in their banking app.
6. Plan a **single small real transaction in production** as the final KHQR
   proof. For KHQR that is realistically the only genuine settlement you will
   see, which is why section 12 ends with one.

---

## 8. Sandbox test cards

For card testing only (invoicing tool / default checkout). Never use a real
card in sandbox.

From ABA's developer **Resources** page:

| Brand | Number | Exp | CVV | 3DS | Outcome |
| --- | --- | --- | --- | --- | --- |
| Mastercard | 5156 8399 3770 6777 | 01/30 | 993 | No | Success |
| Visa | 4286 0900 0000 0206 | 04/30 | 777 | Yes | Success |
| Mastercard | 5156 8302 7256 1029 | 04/30 | 777 | Yes | Declined |
| Visa | 4156 8399 3770 6777 | 01/30 | 993 | No | Declined |

Additional cards from the integration manual: `4026459992389502` (exp 02/22,
cvv 066), `6291440017363253` (02/22, 066), `5156832876138436` (01/30, 934),
`4286090000000040` (01/30, 361).

3DS OTP codes are emailed to the address registered on the sandbox account.

This app does not use card checkout — KHQR is the only online option — so these
are only relevant if you add cards later.

---

## 9. Error codes (and the code-6 trap)

**`code 6` means two different things depending on the call.** This has cost
people entire days:

- From **check-transaction**: *transaction not found*. Harmless. A brand-new
  transaction is not queryable for about a second — `confirmAbaPayment`
  already retries once for exactly this.
- From **purchase/checkout**: *Invalid Domain Name* — the request came from a
  non-whitelisted domain/IP. Call ABA.

Check-transaction status codes:

| `payment_status_code` | Meaning |
| --- | --- |
| 0 | APPROVED / PRE-AUTH |
| 2 | PENDING |
| 3 | DECLINED |
| 4 | REFUNDED |
| 7 | CANCELLED |

Check-transaction `status.code`: `00` success · `5` invalid hash · `6` not
found · `8` invalid merchant profile · `11` server error · `429` rate limit
(600 req/s).

Checkout/purchase error codes: `1` invalid hash · `2` invalid transaction id ·
`3` invalid amount format · `4` duplicate transaction id · `5` invalid
continue-success URL (domain not registered) · `6` non-whitelisted domain ·
`7` return param too long · `9` amount over the profile limit · `12` wrong
currency for the profile · `13` malformed base64 `items`.

---

## 10. Troubleshooting

**`ABA PayWay is not configured` / HTTP 503**
`ABA_MERCHANT_ID` or `ABA_API_KEY` is empty. Set both, restart the API, recheck
`/api/payment/methods`. The client is built per request, so a restart is enough
— but `.env` is only read at boot.

**`Wrong Hash` / `Invalid Hash`**
Merchant ID and API key are from different environments, or were pasted with a
trailing space or newline. Re-copy both from ABA's email and confirm
`ABA_BASE_URL` matches the environment those credentials belong to.

**`Invalid Domain Name` on create**
Not whitelisted. Send ABA the public IP or domain of the machine running
`apps/api`.

**No QR image returned**
The API deliberately 502s rather than showing a broken screen. Usually means
the sandbox profile does not have ABA KHQR enabled — ABA must enable it.

**Screen stuck on "waiting for payment"**
Check API logs, then `curl /api/payment/aba/status/<orderId>`, then the
sandbox portal. In that order — each one narrows it down.

**Order never becomes `paid` even though ABA shows approved**
Look for `ABA amount mismatch` in the API logs. A short payment is refused on
purpose.

---

## 11. Go-live checklist

- [x] Credentials in `.env` are the ones from ABA's sandbox email (section 5.2)
- [x] Purchase API returns QR + deeplink in sandbox (verified 2026-09-01)
- [x] `check-transaction` returns PENDING for a fresh transaction (verified 2026-09-01)
- [ ] At least one **paid** transaction exists in the sandbox portal (5.4)
- [ ] An order reached `paid` via the status route on ABA's authority (5.5)
- [ ] Amount-mismatch rejection verified (5.5)
- [ ] ABA has confirmed in writing how (or whether) sandbox KHQR can be settled
- [ ] Merchant name + city set correctly on the production profile (section 7, step 5)
- [ ] Order flips to `paid` and shows a pickup code
- [ ] Abandoned/expired KHQR orders auto-cancel and never become `paid`
- [ ] Missing credentials degrade to cash-only, never to a fake QR
- [ ] Staff dashboard handles the paid order through to completed
- [ ] ABA has reviewed the integration
- [ ] Production merchant ID + API key issued
- [ ] Production domain/IP whitelisted, and the success URL domain registered
- [ ] Confirmed with ABA which payment options are enabled in production

## 12. Switching to production

Change these in the **production environment only** (Railway variables — see
`docs/GO_LIVE_PRODUCTION.md`), never in a committed file:

```env
ABA_MERCHANT_ID="your_production_merchant_id"
ABA_API_KEY="your_production_api_key"
ABA_BASE_URL="https://checkout.payway.com.kh"
WEBAPP_URL="https://menu.aichazhengdaarakawa.com"
CORS_ORIGINS="https://menu.aichazhengdaarakawa.com,https://staff.aichazhengdaarakawa.com"
```

Then:

1. Deploy the API.
2. `curl https://<api>/api/payment/methods` → `online:true`.
3. Place **one real order for the cheapest item on the menu** and pay it with a
   real ABA account.
4. Confirm it in the production merchant portal.
5. Confirm the order is `paid` and reaches the staff board.
6. Refund it if you want, and keep the receipt as go-live evidence.

Roll back by pointing `ABA_BASE_URL` and the credentials back at sandbox, or by
turning `enableKhqr` off in store settings to fall back to cash-only.

---

## 13. Evidence template

Paste into the go-live ticket:

```md
## ABA PayWay Sandbox Test Evidence

- Test date:
- Tester:
- Environment: Sandbox (checkout-sandbox.payway.com.kh)
- Sandbox merchant ID:
- API host tested from (whitelisted IP/domain):
- Order ID:
- ABA transaction ID:
- Amount / currency:
- Payment option: abapay_khqr_deeplink
- QR generated: yes / no
- Deeplink returned: yes / no
- Portal transaction status:
- App order status:
- Staff dashboard status:
- Expiry/abandon test result:
- No-credentials test result:
- Screenshots:
- Blocked items + ABA ticket reference:
```

---

## References

- Developer portal — <https://developer.payway.com.kh/>
- Sandbox registration — <https://sandbox.payway.com.kh/register-sandbox/>
- Sandbox merchant portal — <https://sandbox.payway.com.kh/>
- API endpoints & base URLs — <https://developer.payway.com.kh/api-endpoints-984508m0>
- Ecommerce checkout — <https://developer.payway.com.kh/ecommerce-checkout-3158159f0>
- QR API — <https://developer.payway.com.kh/qr-api-14530840e0>
- Check transaction — <https://developer.payway.com.kh/check-transaction-14530826e0>
- KHQR guideline — <https://developer.payway.com.kh/khqr-guideline-3192101f0>
- Test cards — <https://developer.payway.com.kh/resources-3305682f0>
- Integration manual (PDF) — <https://checkout-sandbox.payway.com.kh/plugins/payway-v2-sandbox.pdf>
- SDK used here — `aba-payway-sdk-unofficial`, <https://github.com/rithsila/aba-payway-sdk-unofficial>
- Production sales contact — paywaysales@ababank.com
