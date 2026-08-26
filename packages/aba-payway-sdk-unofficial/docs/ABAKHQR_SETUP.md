# ABA KHQR Setup Guide for EA Safety Score

## **Your Supabase Project:** `https://<project-ref>.supabase.co` **Reference:** `https://developer.payway.com.kh/`, `https://api-bakong.nbc.gov.kh/document`

## Overview

ABA KHQR is Cambodia's standardized QR payment system that allows customers to pay using:

- ABA Mobile app
- Bakong app (National Bank of Cambodia)
- Any KHQR-compatible banking app

---

## Step 1: Apply for ABA PayWay Merchant Account

1. Go to **[ABA PayWay Business](https://www.payway.com.kh/business)**
2. Click **"Sign Up"** or **"Apply Now"**
3. Complete the merchant application:
   - Business registration documents
   - Bank account details
   - Business description

> **Processing Time:** 3-5 business days for approval

---

## Step 2: Get Your API Credentials

After approval, you'll receive:

| Credential         | Description                     | Example        |
| ------------------ | ------------------------------- | -------------- |
| **Merchant ID**    | Your unique merchant identifier | `12345`        |
| **API Key**        | Public key for requests         | `pk_xxx...`    |
| **API Secret**     | Private key for signatures      | `sk_xxx...`    |
| **Webhook Secret** | For verifying callbacks         | `whsec_xxx...` |

---

## Step 3: Configure Webhook Endpoint

In your ABA PayWay dashboard:

1. Go to **Settings** → **Webhooks**
2. Add endpoint:

| Field      | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| **URL**    | `https://<project-ref>.supabase.co/functions/v1/webhook-aba` |
| **Events** | Payment Success, Payment Failed                              |

---

## Step 4: Update Your Environment

Add these to your `.env.local`:

```bash
# ABA PayWay Configuration
ABA_PAYWAY_MERCHANT_ID=your_merchant_id
ABA_PAYWAY_API_KEY=pk_your_api_key
ABA_PAYWAY_WEBHOOK_SECRET=whsec_your_webhook_secret

# Environment (sandbox for testing, production for live)
ABA_PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh
# Production: https://checkout.payway.com.kh

# Dev-only: allow placeholder QR mode when ABA is not configured
ABA_PAYWAY_ALLOW_FALLBACK=true
```

---

## Step 5: Set Supabase Secrets

Run these commands:

```bash
npx supabase secrets set ABA_PAYWAY_MERCHANT_ID="your_merchant_id"
npx supabase secrets set ABA_PAYWAY_API_KEY="pk_your_api_key"
npx supabase secrets set ABA_PAYWAY_WEBHOOK_SECRET="whsec_your_webhook_secret"
npx supabase secrets set ABA_PAYWAY_BASE_URL="https://checkout-sandbox.payway.com.kh"
```

---

## Pricing in KHR

Exchange rate: ~4,100 KHR per USD

| Plan     | USD  | KHR (approx) |
| -------- | ---- | ------------ |
| Trial    | $0   | ៛0           |
| Monthly  | $15  | ៛61,500      |
| Yearly   | $99  | ៛405,900     |
| Lifetime | $299 | ៛1,225,900   |

---

## API Endpoints (After Setup)

### Generate KHQR Code

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/create-khqr" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_type": "MONTHLY",
    "currency": "USD",
    "customer_email": "customer@example.com"
  }'
```

**Response:**

```json
{
  "transaction_id": "txn_xxx",
  "qr_code": "data:image/png;base64,xxx...",
  "qr_data": "00020101021229...",
  "amount": 15.00,
  "currency": "USD",
  "expires_at": "2026-01-19T10:00:00Z"
}
```

### Check Payment Status

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/check-khqr-status" \
  -H "Content-Type: application/json" \
  -d '{"transaction_id": "txn_xxx"}'
```

---

## Payment Flow

```
1. User clicks "Pay with KHQR"
         │
         ▼
2. Frontend calls /create-khqr
         │
         ▼
3. Display QR code to user
         │
         ▼
4. User scans with ABA/Bakong app
         │
         ▼
5. ABA sends webhook → /webhook-aba
         │
         ▼
6. License created automatically
```

---

## ✅ Checklist

After completing setup, you should have:

- [ ] ABA PayWay merchant account approved
- [ ] API credentials received
- [ ] Webhook endpoint configured in ABA dashboard
- [ ] `.env.local` updated with all keys
- [ ] Supabase secrets set
- [ ] Test QR generation working

---

## Troubleshooting

| Error                | Cause               | Solution                             |
| -------------------- | ------------------- | ------------------------------------ |
| `INVALID_SIGNATURE`  | Wrong API secret    | Verify `ABA_PAYWAY_API_SECRET`       |
| `MERCHANT_NOT_FOUND` | Invalid merchant ID | Check `ABA_PAYWAY_MERCHANT_ID`       |
| `QR_EXPIRED`         | QR code timeout     | Generate new QR (15 min limit)       |
| `WEBHOOK_FAILED`     | URL not accessible  | Verify Supabase function is deployed |

---

## Contact ABA Support

For merchant account setup:

- **Email:** payway@ababank.com
- **Phone:** 023 225 333
- **Website:** https://www.payway.com.kh
