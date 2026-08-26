# aba-payway-unofficial

![npm version](https://img.shields.io/npm/v/aba-payway-sdk-unofficial)

Unofficial ABA PayWay SDK for Cambodia. Supports KHQR generation, purchase creation, status checking, and webhook verification. Works in Node.js 18+, Deno, Bun, and Cloudflare Workers.

> **Why this project exists**: Online guides for ABA PayWay can look confusing and risky. Many developers fear losing money from wrong setups. We built this simple SDK with AI help so any developer can integrate ABA PayWay quickly and safely.

## Official ABA PayWay Links
- **Official Developer Docs**: [https://developer.payway.com.kh/](https://developer.payway.com.kh/)
- **Register Free Sandbox (Testing Account)**: [https://sandbox.payway.com.kh/register-sandbox/](https://sandbox.payway.com.kh/register-sandbox/)
- **ABA PayWay Business & Pricing**: [https://www.payway.com.kh/business](https://www.payway.com.kh/business)
- **NBC Bakong API Docs**: [https://api-bakong.nbc.gov.kh/document](https://api-bakong.nbc.gov.kh/document)

> **Disclaimer**: This is an unofficial open-source SDK. It is not affiliated with, endorsed by, or supported by ABA Bank or ABA PayWay.

---

## 🤖 For LLM Agents

Fetch the full integration guide and follow it step by step:

```bash
curl -fsSL https://raw.githubusercontent.com/rithsila/aba-payway-sdk-unofficial/main/docs/agent-guide.md
```

---

## Installation

```bash
npm install aba-payway-sdk-unofficial
```

---

## Quick Start

```typescript
import {
  ABAPayWay,
  generateKHQR,
  generateTransactionId,
} from "aba-payway-sdk-unofficial";

// 1. Create client
const aba = new ABAPayWay({
  merchantId: "your_merchant_id",
  apiKey: "your_api_key",
  baseUrl: "https://checkout.payway.com.kh",
  webhookSecret: "your_webhook_secret", // optional
});

// 2. Create a purchase
const txnId = generateTransactionId();

const purchase = await aba.createPurchase({
  transactionId: txnId,
  amount: 10.0,
  currency: "USD",
  items: "Product A",
  firstName: "Dara",
  lastName: "Chan",
  email: "dara@example.com",
  returnUrl: "https://yoursite.com/success",
  cancelUrl: "https://yoursite.com/cancel",
});

if (purchase.success) {
  console.log("Checkout URL:", purchase.checkoutUrl);
}

// 3. Check payment status
const status = await aba.checkStatus(txnId);
console.log("Payment status:", status.status); // "APPROVED" | "PENDING" | ...

// 4. Verify a webhook
const isValid = await aba.verifyWebhook(
  rawBody,
  signatureHeader,
  webhookSecret,
);

// 5. Generate a KHQR image (base64 SVG data URI)
const khqrImage = await generateKHQR({
  emvData: purchase.qrString ?? "",
  amount: 10.0,
  currency: "USD",
  merchantName: "My Shop",
  headerColor: "#d42b2b",
});
console.log("KHQR image:", khqrImage); // "data:image/svg+xml;base64,..."
```

---

## API Reference

| Export                     | Type     | Description                                         |
| -------------------------- | -------- | --------------------------------------------------- |
| `ABAPayWay`                | class    | Main client. Constructor takes `ABAConfig`.         |
| `ABAPayWay.createPurchase` | method   | Create a payment. Returns `PurchaseResponse`.       |
| `ABAPayWay.checkStatus`    | method   | Check transaction status. Returns `StatusResponse`. |
| `ABAPayWay.verifyWebhook`  | method   | Verify webhook signature. Returns `boolean`.        |
| `generateKHQR`             | function | Build a KHQR image (base64 SVG data URI) from EMV data. Async. |
| `generateABAHash`          | function | Generate HMAC-SHA512 hash for ABA API calls.        |
| `generateTransactionId`    | function | Generate a unique transaction ID.                   |
| `getABATimestamp`          | function | Get current timestamp in ABA format.                |
| `formatPhoneForABA`        | function | Normalize phone number for ABA API.                 |
| `getQRExpiration`          | function | Get QR code expiration timestamp.                   |

### Types

| Type               | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `ABAConfig`        | SDK configuration (merchantId, apiKey, baseUrl, webhookSecret)   |
| `PurchaseRequest`  | Input for `createPurchase`                                       |
| `PurchaseResponse` | Result from `createPurchase`                                     |
| `StatusResponse`   | Result from `checkStatus`                                        |
| `PaymentStatus`    | `"PENDING" \| "APPROVED" \| "DECLINED" \| "REFUNDED" \| "ERROR"` |
| `KHQROptions`      | Input for `generateKHQR`                                         |
| `HashParams`       | Raw parameters for hash generation                               |

---

## KHQR Customization

Use `KHQROptions` to customize the QR code display. `generateKHQR` is async and
returns a base64-encoded SVG data URI you can use directly as an `<img>` `src`:

```typescript
import { generateKHQR } from "aba-payway-sdk-unofficial";

const dataUri = await generateKHQR({
  emvData: "your_emv_qr_string",
  amount: 5.5,
  currency: "USD",
  merchantName: "Rith Shop", // shown above the QR code
  headerColor: "#1a73e8", // hex color for the header bar
});
```

---

## Environment Setup

You need ABA PayWay merchant credentials to use this SDK:

| Variable        | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `merchantId`    | Your ABA PayWay merchant ID                                |
| `apiKey`        | Your ABA PayWay API key                                    |
| `baseUrl`       | ABA PayWay base URL (e.g.`https://checkout.payway.com.kh`) |
| `webhookSecret` | Secret for webhook signature verification (optional)       |

Contact ABA Bank to get these credentials.

---

## Development

```bash
# Run unit tests (mocked, no network)
npm test

# Build the package
npm run build
```

---

## Sandbox Testing

You can test the SDK against the real ABA PayWay sandbox. This makes live
network calls, so it needs sandbox credentials.

### 1. Get sandbox credentials

Register at https://sandbox.payway.com.kh/register-sandbox/. ABA will email you
a merchant ID, an API key, and a webhook secret.

### 2. Set up your `.env` file

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
ABA_MERCHANT_ID=your_sandbox_merchant_id
ABA_API_KEY=your_sandbox_api_key
ABA_BASE_URL=https://checkout-sandbox.payway.com.kh
ABA_WEBHOOK_SECRET=your_sandbox_webhook_secret
```

`.env` is gitignored. Never commit real credentials.

### 3. Run the sandbox tests

```bash
npm run test:sandbox
```

This creates a real `$1.00` test purchase and checks its status. A new
transaction stays `PENDING` until you pay it by opening the returned checkout
URL in a browser.

If you run `npm run test:sandbox` without a `.env` file, the tests are skipped
(not failed), so they never block a normal `npm test` run.

---

## License

MIT
