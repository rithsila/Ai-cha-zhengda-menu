# ABA PayWay Integration Guide for LLM Agents

You are an AI coding assistant tasked with integrating `aba-payway-sdk-unofficial` into this project. Follow these steps sequentially.

---

## Step 1: Detect Project Stack

1. Check `package.json` dependencies:
   - **Next.js (App Router)**: has `next` and `app/` folder -> Create route in `app/api/payway/.../route.ts`
   - **Next.js (Pages Router)**: has `next` and `pages/` folder -> Create route in `pages/api/payway/...ts`
   - **Express**: has `express` -> Create router or add endpoints to server file
   - **Hono / Cloudflare**: has `hono` -> Create Hono route handler
   - **NestJS**: has `@nestjs/core` -> Create a PayWay service and controller

2. Detect package manager:
   - `bun.lockb` or `bun.lock` -> `bun add aba-payway-sdk-unofficial`
   - `pnpm-lock.yaml` -> `pnpm add aba-payway-sdk-unofficial`
   - `yarn.lock` -> `yarn add aba-payway-sdk-unofficial`
   - Default -> `npm install aba-payway-sdk-unofficial`

---

## Step 2: Install Package

Run the install command using the detected package manager:
```bash
npm install aba-payway-sdk-unofficial
```

---

## Step 3: Configure Environment Variables

Check if `.env` (or `.env.local`) exists. Add these variables if missing:

```env
ABA_PAYWAY_MERCHANT_ID="your_merchant_id"
ABA_PAYWAY_API_KEY="your_api_key"
ABA_PAYWAY_BASE_URL="https://checkout.payway.com.kh" # or sandbox: https://checkout-sandbox.payway.com.kh
ABA_PAYWAY_WEBHOOK_SECRET="your_optional_secret"
```

---

## Step 4: Implement PayWay Client

Create a singleton helper (e.g. `lib/payway.ts` or `src/lib/payway.ts`):

```typescript
import { ABAPayWay } from "aba-payway-sdk-unofficial";

export const abaPayWay = new ABAPayWay({
  merchantId: process.env.ABA_PAYWAY_MERCHANT_ID!,
  apiKey: process.env.ABA_PAYWAY_API_KEY!,
  baseUrl: process.env.ABA_PAYWAY_BASE_URL || "https://checkout.payway.com.kh",
  webhookSecret: process.env.ABA_PAYWAY_WEBHOOK_SECRET,
});
```

---

## Step 5: Implement Payment Endpoints

Choose the pattern matching the user's framework:

### A. Next.js App Router (`app/api/payway/create-payment/route.ts`)
```typescript
import { NextResponse } from "next/server";
import { abaPayWay } from "@/lib/payway";
import { generateTransactionId } from "aba-payway-sdk-unofficial";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const txnId = generateTransactionId();

    const purchase = await abaPayWay.createPurchase({
      transactionId: txnId,
      amount: body.amount,
      currency: body.currency || "USD",
      items: body.items || "Order Payment",
      firstName: body.firstName || "Customer",
      lastName: body.lastName || "Name",
      email: body.email || "customer@example.com",
      returnUrl: body.returnUrl || `${req.headers.get("origin")}/payment/success`,
      cancelUrl: body.cancelUrl || `${req.headers.get("origin")}/payment/cancel`,
    });

    return NextResponse.json(purchase);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

### B. Express.js (`src/routes/payment.ts`)
```typescript
import { Router } from "express";
import { abaPayWay } from "../lib/payway";
import { generateTransactionId } from "aba-payway-sdk-unofficial";

const router = Router();

router.post("/api/payway/create-payment", async (req, res) => {
  try {
    const txnId = generateTransactionId();
    const purchase = await abaPayWay.createPurchase({
      transactionId: txnId,
      amount: req.body.amount,
      currency: req.body.currency || "USD",
      items: req.body.items || "Order Payment",
      firstName: req.body.firstName || "Customer",
      lastName: req.body.lastName || "Name",
      email: req.body.email || "customer@example.com",
      returnUrl: req.body.returnUrl,
      cancelUrl: req.body.cancelUrl,
    });

    res.json(purchase);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

### C. KHQR Dynamic QR Generation (`app/api/payway/create-qr/route.ts` or Express)
```typescript
import { NextResponse } from "next/server";
import { abaPayWay } from "@/lib/payway";
import { generateTransactionId } from "aba-payway-sdk-unofficial";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const txnId = generateTransactionId();

    const qrResult = await abaPayWay.createDynamicKHQR({
      transactionId: txnId,
      amount: body.amount,
      currency: body.currency || "USD",
      lifetime: 15, // QR valid for 15 minutes
    });

    return NextResponse.json(qrResult);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

---

## Step 6: Verify & Check Status Endpoint

Add a status check route (e.g. `app/api/payway/check-status/route.ts`):

```typescript
import { NextResponse } from "next/server";
import { abaPayWay } from "@/lib/payway";

export async function POST(req: Request) {
  try {
    const { transactionId } = await req.json();
    const status = await abaPayWay.checkTransaction(transactionId);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

---

## Step 7: Final Check

1. Verify environment variables are loaded properly.
2. Ensure TypeScript types compile without errors (`npm run build` or `npx tsc --noEmit`).
3. Never expose `ABA_PAYWAY_API_KEY` to the client/browser bundle.
