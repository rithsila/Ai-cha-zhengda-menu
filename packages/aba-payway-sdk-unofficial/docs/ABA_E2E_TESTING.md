# ABA KHQR End-to-End Testing Guide

**Last Updated:** 2026-01-29  
**Status:** Complete Testing Documentation  
**Scope:** Full E2E testing for ABA PayWay KHQR integration

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Testing Environment Setup](#testing-environment-setup)
4. [Testing Methods](#testing-methods)
   - Method 1: Mock Webhook Testing (No ABA Required)
   - Method 2: Placeholder QR Mode (Development)
   - Method 3: ABA Sandbox Testing (Full Integration)
5. [API Testing with cURL](#api-testing-with-curl)
6. [Frontend Flow Testing](#frontend-flow-testing)
7. [Webhook Testing](#webhook-testing)
8. [Database Verification](#database-verification)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment Checklist](#production-deployment-checklist)

---

## Overview

This guide covers end-to-end testing for the ABA KHQR payment integration in the EA Safety Score platform. We provide **three testing approaches** ranging from simple mock testing to full sandbox integration.

### Architecture Recap

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TESTING FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Frontend   │───▶│   Supabase   │───▶│  ABA Sandbox │               │
│  │   (Next.js)  │    │   Edge Func  │    │   (Optional) │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                                           │
│         │                   ▼                                           │
│         │            ┌──────────────┐                                   │
│         │            │  PostgreSQL  │                                   │
│         │            │   (Orders)   │                                   │
│         │            └──────────────┘                                   │
│         │                   │                                           │
│         └───────────────────┤                                           │
│                             ▼                                           │
│                      ┌──────────────┐                                   │
│                      │   Webhook    │◀── Manual or ABA Callback        │
│                      │   Handler    │                                   │
│                      └──────────────┘                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Testing Approaches Summary

| Method             | ABA Account     | Complexity  | Use Case                |
| ------------------ | --------------- | ----------- | ----------------------- |
| **Mock Webhook**   | Not needed      | ⭐ Simple   | Unit testing, CI/CD     |
| **Placeholder QR** | Not needed      | ⭐⭐ Easy   | UI/UX testing           |
| **ABA Sandbox**    | Sandbox account | ⭐⭐⭐ Full | Production-like testing |

---

## Prerequisites

### Required Tools

```bash
# 1. cURL (for API testing)
curl --version

# 2. jq (for JSON formatting)
jq --version

# 3. Supabase CLI (for local testing)
supabase --version

# 4. ngrok (optional, for webhook testing)
ngrok --version
```

### Environment Variables

Ensure these are set in your environment:

```bash
# Supabase Configuration
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# ABA PayWay (Sandbox or Production)
export ABA_PAYWAY_MERCHANT_ID="your-merchant-id"
export ABA_PAYWAY_API_KEY="your-api-key"
export ABA_PAYWAY_BASE_URL="https://checkout-sandbox.payway.com.kh"
export ABA_PAYWAY_WEBHOOK_SECRET="your-webhook-secret"
```

### Supabase Functions Status

Verify functions are deployed:

```bash
# List deployed functions
supabase functions list

# Expected output:
# ├── check-khqr-status
# ├── create-khqr
# ├── webhook-aba
# └── ... other functions
```

---

## Testing Environment Setup

### Option A: Local Development (Supabase CLI)

```bash
# 1. Start Supabase locally
supabase start

# 2. Serve functions locally
supabase functions serve

# 3. Set local secrets
supabase secrets set --env-file .env.local

# 4. Your local endpoint
export FUNCTIONS_URL="http://localhost:54321/functions/v1"
```

### Option B: Deployed Supabase (Recommended for Testing)

```bash
# Use your deployed Supabase project
export FUNCTIONS_URL="https://your-project.supabase.co/functions/v1"
export ANON_KEY="your-anon-key"
```

### Option C: Fallback Mode (No ABA Credentials)

```bash
# Enable placeholder QR mode for UI testing
export ABA_PAYWAY_ALLOW_FALLBACK="true"
```

---

## Testing Methods

### Method 1: Mock Webhook Testing (Fastest)

**Best for:** Automated testing, CI/CD pipelines, backend logic verification

This method bypasses ABA entirely and tests your webhook handler directly.

#### Step 1: Create a Test Order

```bash
# Insert a test order directly into the database
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "stripe_session_id": "TEST-EA-12345678",
    "payment_method": "aba_khqr",
    "plan_type": "MONTHLY",
    "amount_usd": 15.00,
    "currency": "USD",
    "status": "pending",
    "metadata": {
      "customer_email": "test@example.com",
      "customer_name": "Test User",
      "original_plan_type": "MONTHLY"
    }
  }'
```

#### Step 2: Simulate ABA Webhook

```bash
# Simulate successful payment webhook
curl -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -H "X-Signature: mock-signature" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "transaction_id": "TEST-EA-12345678",
    "merchant_id": "'$ABA_PAYWAY_MERCHANT_ID'",
    "amount": 15.00,
    "currency": "USD",
    "payment_time": "2026-01-29T08:30:00Z",
    "customer_email": "test@example.com",
    "customer_phone": "012345678",
    "metadata": {
      "plan_type": "MONTHLY"
    }
  }'
```

**Expected Response:**

```json
{
  "received": true
}
```

#### Step 3: Verify License Creation

```bash
# Check if license was created
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/licenses?select=*&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Step 4: Verify Order Status

```bash
# Check order is marked as completed
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?stripe_session_id=eq.TEST-EA-12345678" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Webhook Payload Examples

**Success Payload:**

```json
{
  "event_type": "PAYMENT_SUCCESS",
  "transaction_id": "TEST-EA-12345678",
  "merchant_id": "your-merchant-id",
  "amount": 15.0,
  "currency": "USD",
  "payment_time": "2026-01-29T08:30:00Z",
  "customer_email": "test@example.com",
  "customer_phone": "012345678",
  "bank_ref": "TEST123456",
  "apv": "123456"
}
```

**Failed Payment Payload:**

```json
{
  "event_type": "PAYMENT_FAILED",
  "transaction_id": "TEST-EA-12345678",
  "merchant_id": "your-merchant-id",
  "amount": 15.0,
  "currency": "USD",
  "customer_email": "test@example.com"
}
```

**Cancelled Payment Payload:**

```json
{
  "event_type": "PAYMENT_CANCELLED",
  "transaction_id": "TEST-EA-12345678",
  "merchant_id": "your-merchant-id",
  "amount": 15.0,
  "currency": "USD",
  "customer_email": "test@example.com"
}
```

---

### Method 2: Placeholder QR Mode (UI Testing)

**Best for:** Testing frontend UI/UX without ABA credentials

This method generates a placeholder QR code that looks real but doesn't require ABA API calls.

#### Enable Fallback Mode

```bash
# Set environment variable
export ABA_PAYWAY_ALLOW_FALLBACK="true"

# Or in Supabase secrets
supabase secrets set ABA_PAYWAY_ALLOW_FALLBACK="true"
```

#### Test the Full Flow

```bash
# 1. Create KHQR (will return placeholder)
curl -X POST "$FUNCTIONS_URL/create-khqr" \
  -H "Content-Type: application/json" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -d '{
    "plan_type": "MONTHLY",
    "currency": "USD",
    "customer_email": "test@example.com",
    "customer_name": "Test User"
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "transaction_id": "EAXXXXXXXXXX",
  "qr_code": "data:image/svg+xml;base64,...",
  "amount": 15,
  "currency": "USD",
  "plan_type": "MONTHLY",
  "expires_at": "2026-01-29T09:15:00.000Z",
  "uses_fallback": true
}
```

Note the `"uses_fallback": true` flag - this indicates a placeholder QR.

#### Complete Flow Test Script

```bash
#!/bin/bash
# test-placeholder-flow.sh

FUNCTIONS_URL="https://your-project.supabase.co/functions/v1"
ANON_KEY="your-anon-key"

# 1. Create KHQR
echo "Creating KHQR..."
RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/create-khqr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "plan_type": "YEARLY",
    "currency": "USD",
    "customer_email": "test@example.com",
    "customer_name": "Test User"
  }')

TRANSACTION_ID=$(echo $RESPONSE | jq -r '.transaction_id')
echo "Transaction ID: $TRANSACTION_ID"

# 2. Check status (should be PENDING)
echo "Checking status..."
curl -s -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "{\"transaction_id\": \"$TRANSACTION_ID\"}" | jq

# 3. Simulate payment webhook
echo "Simulating payment..."
curl -s -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"PAYMENT_SUCCESS\",
    \"transaction_id\": \"$TRANSACTION_ID\",
    \"merchant_id\": \"test-merchant\",
    \"amount\": 99.00,
    \"currency\": \"USD\",
    \"customer_email\": \"test@example.com\"
  }"

# 4. Check status again (should be PAID)
echo "Checking status after payment..."
curl -s -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "{\"transaction_id\": \"$TRANSACTION_ID\"}" | jq
```

---

### Method 3: ABA Sandbox Testing (Full Integration)

**Best for:** Production-like testing with actual ABA API

#### Step 1: Register for Sandbox Account

1. Visit: https://sandbox.payway.com.kh/register-sandbox/
2. Complete the registration form
3. Wait for email with sandbox credentials
4. Save your credentials:
   - Merchant ID
   - API Key (Public Key)
   - API Secret (for webhook verification)

#### Step 2: Configure Sandbox Environment

```bash
# Set sandbox credentials
export ABA_PAYWAY_MERCHANT_ID="your-sandbox-merchant-id"
export ABA_PAYWAY_API_KEY="your-sandbox-api-key"
export ABA_PAYWAY_BASE_URL="https://checkout-sandbox.payway.com.kh"
export ABA_PAYWAY_ALLOW_FALLBACK="false"

# Update Supabase secrets
supabase secrets set ABA_PAYWAY_MERCHANT_ID="your-sandbox-merchant-id"
supabase secrets set ABA_PAYWAY_API_KEY="your-sandbox-api-key"
supabase secrets set ABA_PAYWAY_BASE_URL="https://checkout-sandbox.payway.com.kh"
supabase secrets set ABA_PAYWAY_ALLOW_FALLBACK="false"
```

#### Step 3: Test Purchase API

```bash
# Create a real KHQR via ABA Sandbox
curl -X POST "$FUNCTIONS_URL/create-khqr" \
  -H "Content-Type: application/json" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -d '{
    "plan_type": "MONTHLY",
    "currency": "USD",
    "customer_email": "test@example.com",
    "customer_name": "Test User",
    "customer_phone": "012345678"
  }' | jq
```

**Expected Response:**

```json
{
  "success": true,
  "transaction_id": "EAXXXXXXXXXX",
  "checkout_url": "https://checkout-sandbox.payway.com.kh/checkout/...",
  "abapay_deeplink": "abapay://...",
  "qr_code": "data:image/svg+xml;base64,...",
  "amount": 15,
  "currency": "USD",
  "plan_type": "MONTHLY",
  "expires_at": "2026-01-29T09:15:00.000Z",
  "uses_fallback": false
}
```

Note the `"uses_fallback": false` - this means ABA API was actually called.

#### Step 4: Test via ABA Checkout URL

When using sandbox credentials, ABA returns a `checkout_url`. You have two options:

**Option A: Browser-Based Testing**

1. Open the `checkout_url` in a browser
2. ABA Sandbox checkout page will load
3. Complete the test payment form (no real ABA app needed)
4. ABA will redirect to your `return_url` and send webhook

**Option B: QR Code Testing**

1. Display the QR code (`qr_code` field - it's a base64 SVG)
2. The QR contains EMVCo data for KHQR
3. Note: Cannot scan with real ABA app (sandbox/production separation)
4. Use the checkout URL method instead for sandbox testing

#### Step 5: Check Transaction Status via ABA API

```bash
# Check status via your API (which calls ABA)
curl -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -d '{
    "transaction_id": "EAXXXXXXXXXX"
  }' | jq
```

**Note:** In sandbox, if you haven't "paid" via the checkout URL, status will remain PENDING.

---

## API Testing with cURL

### Complete API Test Suite

Save this as `test-aba-api.sh`:

```bash
#!/bin/bash
set -e

# Configuration
FUNCTIONS_URL="${FUNCTIONS_URL:-https://your-project.supabase.co/functions/v1}"
ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-your-anon-key}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}ABA KHQR API Test Suite${NC}"
echo "========================"
echo "Functions URL: $FUNCTIONS_URL"
echo ""

# Test 1: Create KHQR
echo -e "${YELLOW}Test 1: Create KHQR${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/create-khqr" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{
    "plan_type": "MONTHLY",
    "currency": "USD",
    "customer_email": "apitest@example.com",
    "customer_name": "API Test",
    "customer_phone": "012345678"
  }')

echo "Response: $CREATE_RESPONSE" | jq

if [ "$(echo $CREATE_RESPONSE | jq -r '.success')" != "true" ]; then
  echo -e "${RED}FAILED: Create KHQR${NC}"
  exit 1
fi

TRANSACTION_ID=$(echo $CREATE_RESPONSE | jq -r '.transaction_id')
echo -e "${GREEN}PASSED: Create KHQR (ID: $TRANSACTION_ID)${NC}"
echo ""

# Test 2: Check Status (Pending)
echo -e "${YELLOW}Test 2: Check Status (Pending)${NC}"
STATUS_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "{\"transaction_id\": \"$TRANSACTION_ID\"}")

echo "Response: $STATUS_RESPONSE" | jq

if [ "$(echo $STATUS_RESPONSE | jq -r '.status')" != "PENDING" ]; then
  echo -e "${RED}FAILED: Expected PENDING status${NC}"
  exit 1
fi

echo -e "${GREEN}PASSED: Status is PENDING${NC}"
echo ""

# Test 3: Simulate Webhook
echo -e "${YELLOW}Test 3: Simulate Webhook${NC}"
WEBHOOK_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -d "{
    \"event_type\": \"PAYMENT_SUCCESS\",
    \"transaction_id\": \"$TRANSACTION_ID\",
    \"merchant_id\": \"test-merchant\",
    \"amount\": 15.00,
    \"currency\": \"USD\",
    \"customer_email\": \"apitest@example.com\",
    \"payment_time\": \"2026-01-29T08:30:00Z\"
  }")

echo "Response: $WEBHOOK_RESPONSE" | jq

if [ "$(echo $WEBHOOK_RESPONSE | jq -r '.received')" != "true" ]; then
  echo -e "${RED}FAILED: Webhook not received${NC}"
  exit 1
fi

echo -e "${GREEN}PASSED: Webhook received${NC}"
echo ""

# Test 4: Check Status (Paid)
echo -e "${YELLOW}Test 4: Check Status (Paid)${NC}"
STATUS_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d "{\"transaction_id\": \"$TRANSACTION_ID\"}")

echo "Response: $STATUS_RESPONSE" | jq

if [ "$(echo $STATUS_RESPONSE | jq -r '.status')" != "PAID" ]; then
  echo -e "${RED}FAILED: Expected PAID status${NC}"
  exit 1
fi

LICENSE_KEY=$(echo $STATUS_RESPONSE | jq -r '.license_key')
echo -e "${GREEN}PASSED: Status is PAID (License: $LICENSE_KEY)${NC}"
echo ""

# Test 5: Invalid Transaction
echo -e "${YELLOW}Test 5: Invalid Transaction${NC}"
INVALID_RESPONSE=$(curl -s -X POST "$FUNCTIONS_URL/check-khqr-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON_KEY" \
  -d '{"transaction_id": "INVALID-123"}')

echo "Response: $INVALID_RESPONSE" | jq

if [ "$(echo $INVALID_RESPONSE | jq -r '.status')" != "NOT_FOUND" ]; then
  echo -e "${RED}FAILED: Expected NOT_FOUND status${NC}"
  exit 1
fi

echo -e "${GREEN}PASSED: Invalid transaction returns NOT_FOUND${NC}"
echo ""

echo -e "${GREEN}========================${NC}"
echo -e "${GREEN}All tests passed!${NC}"
echo "Transaction ID: $TRANSACTION_ID"
echo "License Key: $LICENSE_KEY"
```

Run the test suite:

```bash
chmod +x test-aba-api.sh
./test-aba-api.sh
```

---

## Frontend Flow Testing

### Manual Browser Testing Steps

#### Prerequisites

```bash
# Start the Next.js dev server
cd web
pnpm dev

# App will be at http://localhost:3000
```

#### Test Case 1: Complete KHQR Payment Flow

**Steps:**

1. **Navigate to Pricing**
   - Go to `http://localhost:3000/pricing`
   - Select any paid plan (e.g., Monthly)

2. **Complete Registration (if not logged in)**
   - You'll be redirected to `/register`
   - Create an account or log in

3. **Checkout Page**
   - URL should be: `http://localhost:3000/checkout?plan=monthly`
   - Verify your email is pre-filled

4. **Select KHQR Payment**
   - Click "ABA KHQR" button
   - Wait for QR code to appear (takes 2-3 seconds)

5. **Verify QR Display**
   - QR code should display with:
     - Transaction ID
     - Status: PENDING
     - Countdown timer (15 minutes)
   - "Open ABA Checkout App" button should be visible (if using ABA sandbox)

6. **Simulate Payment (Development Mode)**
   - Since you can't scan with real ABA app in sandbox, use webhook simulation:

```bash
# Get the transaction ID from the browser console or UI
# Then trigger webhook:
curl -X POST "http://localhost:54321/functions/v1/webhook-aba" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "transaction_id": "PASTE_TRANSACTION_ID_HERE",
    "merchant_id": "test",
    "amount": 15.00,
    "currency": "USD"
  }'
```

7. **Verify Success Page**
   - Page should auto-redirect to `/checkout/success`
   - License key should be displayed
   - "Copy to clipboard" button should work

#### Test Case 2: Expired QR Code

**Steps:**

1. Create a KHQR payment
2. Wait 15 minutes (or manually expire in database)
3. Verify status changes to EXPIRED
4. Verify error message is shown
5. Verify "Generate New QR" option is available

**Quick Test (Database Update):**

```bash
# Manually expire a transaction
curl -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?stripe_session_id=eq.YOUR_TXN_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "qr_expires_at": "2026-01-01T00:00:00Z"
    }
  }'
```

#### Test Case 3: Failed Payment

**Steps:**

1. Create KHQR payment
2. Simulate failed webhook:

```bash
curl -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "PAYMENT_FAILED",
    "transaction_id": "YOUR_TXN_ID",
    "merchant_id": "test",
    "amount": 15.00,
    "currency": "USD"
  }'
```

3. Verify error message is displayed
4. Verify user can retry with new QR

---

## Webhook Testing

### Local Webhook Testing with ngrok

When testing locally, ABA can't reach your localhost. Use ngrok:

```bash
# 1. Install ngrok
# https://ngrok.com/download

# 2. Start ngrok
ngrok http 54321

# 3. Copy the HTTPS URL (e.g., https://abc123.ngrok.io)

# 4. Update webhook URL in ABA dashboard to:
# https://abc123.ngrok.io/functions/v1/webhook-aba
```

### Webhook Verification Test

Test your webhook signature verification:

```bash
# Generate a valid signature (if you have webhook secret)
# Or test with invalid signature:

curl -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -H "X-Signature: invalid-signature" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "transaction_id": "TEST-123",
    "merchant_id": "test",
    "amount": 15.00,
    "currency": "USD"
  }'

# Expected: 401 Unauthorized (if webhook secret is configured)
```

### Webhook Retry Simulation

ABA webhooks may retry on failure. Test your idempotency:

```bash
# Send same webhook multiple times
for i in {1..3}; do
  echo "Sending webhook attempt $i..."
  curl -X POST "$FUNCTIONS_URL/webhook-aba" \
    -H "Content-Type: application/json" \
    -d '{
      "event_type": "PAYMENT_SUCCESS",
      "transaction_id": "TEST-RETRY-123",
      "merchant_id": "test",
      "amount": 15.00,
      "currency": "USD"
    }'
  echo ""
done

# Verify only ONE license was created
```

---

## Database Verification

### Verify Order Creation

```bash
# Get all pending KHQR orders
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?payment_method=eq.aba_khqr&status=eq.pending&select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```

### Verify License Creation

```bash
# Get recently created licenses
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/licenses?select=*,users(email)&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```

### Verify Order-License Link

```bash
# Get orders with their licenses
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?select=*,license:licenses(*)&payment_method=eq.aba_khqr&order=created_at.desc&limit=5" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | jq
```

### SQL Queries for Verification

Run these in Supabase SQL Editor:

```sql
-- 1. Count KHQR orders by status
SELECT
  status,
  COUNT(*) as count
FROM orders
WHERE payment_method = 'aba_khqr'
GROUP BY status;

-- 2. Recent KHQR payments with license info
SELECT
  o.stripe_session_id,
  o.status,
  o.amount_usd,
  o.created_at,
  o.completed_at,
  l.license_key,
  l.status as license_status
FROM orders o
LEFT JOIN licenses l ON o.license_id = l.id
WHERE o.payment_method = 'aba_khqr'
ORDER BY o.created_at DESC
LIMIT 10;

-- 3. Failed webhook handling check
SELECT
  stripe_session_id,
  status,
  metadata->>'failure_reason' as failure_reason,
  created_at
FROM orders
WHERE payment_method = 'aba_khqr'
  AND status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Pending orders older than 15 minutes (should be expired)
SELECT
  stripe_session_id,
  status,
  metadata->>'qr_expires_at' as expires_at,
  created_at
FROM orders
WHERE payment_method = 'aba_khqr'
  AND status = 'pending'
  AND (metadata->>'qr_expires_at')::timestamp < NOW()
ORDER BY created_at DESC;
```

---

## Troubleshooting

### Common Issues

#### Issue 1: "Transaction not found" when checking status

**Cause:** Transaction ID doesn't exist in database

**Solution:**

```bash
# Verify transaction exists
curl -X GET "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/orders?stripe_session_id=eq.YOUR_TXN_ID" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

#### Issue 2: "There is no transaction" in ABA Sandbox Portal

**Cause:** This is **expected behavior** for Sandbox.

- The ABA PayWay Sandbox Portal only lists transactions that have been **processed** (paid or attempted via checkout).
- "Pending" transactions initiated via API (Create QR) do not appear in the portal list immediately.
- They will only appear after you simulate a payment or complete the checkout flow.

**Solution:**

- Do not rely on the Portal list to verify creation.
- Use the `test-aba-api.sh` script to verify the transaction exists via API.
- Once you trigger a successful payment (via webhook simulation or checkout URL), the transaction may appear in the portal (depending on Sandbox state).

#### Issue 3: "uses_fallback": true even with ABA credentials

**Causes:**

- ABA_PAYWAY_MERCHANT_ID or ABA_PAYWAY_API_KEY not set
- ABA API returned an error

**Solution:**

```bash
# Check Supabase logs
supabase functions logs create-khqr --tail

# Verify secrets are set
supabase secrets list
```

#### Issue 3: Webhook not triggering license creation

**Causes:**

- Order not found (wrong transaction_id)
- Webhook signature verification failed
- Database error

**Solution:**

```bash
# Check webhook logs
supabase functions logs webhook-aba --tail

# Test webhook manually with verbose output
curl -v -X POST "$FUNCTIONS_URL/webhook-aba" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "PAYMENT_SUCCESS",
    "transaction_id": "YOUR_TXN_ID",
    "merchant_id": "test",
    "amount": 15.00,
    "currency": "USD"
  }'
```

#### Issue 4: QR code displays but "Open ABA Checkout" doesn't work

**Causes:**

- checkout_url is null (ABA didn't return it)
- Using placeholder mode

**Solution:**

- Check if `uses_fallback` is true
- Verify ABA credentials are correct
- Check ABA API response in logs

#### Issue 5: "Wrong Hash" error from ABA API

**Causes:**

- Incorrect API key
- Wrong parameter order in hash generation

**Solution:**

- Verify ABA_PAYWAY_API_KEY matches your sandbox/production account
- Check hash generation logic in `_shared/aba.ts`

### Debug Mode

Enable verbose logging:

```bash
# Set debug flag
export DEBUG_ABA="true"

# In your edge function, add:
if (Deno.env.get("DEBUG_ABA")) {
  console.log("ABA Request:", JSON.stringify(params));
  console.log("ABA Response:", JSON.stringify(data));
}
```

### Contact ABA Support

For sandbox or production issues:

- **Email:** payway@ababank.com
- **Sales:** paywaysales@ababank.com
- **Developer Portal:** https://developer.payway.com.kh/

---

## Production Deployment Checklist

Before going live:

### Pre-Deployment

- [ ] Obtain production ABA merchant account
- [ ] Update `ABA_PAYWAY_BASE_URL` to `https://checkout.payway.com.kh`
- [ ] Update `ABA_PAYWAY_MERCHANT_ID` with production ID
- [ ] Update `ABA_PAYWAY_API_KEY` with production key
- [ ] Set `ABA_PAYWAY_ALLOW_FALLBACK` to `"false"`
- [ ] Configure production webhook URL in ABA dashboard
- [ ] Test with small real payment ($1)

### Post-Deployment

- [ ] Monitor webhook delivery in ABA dashboard
- [ ] Check Supabase logs for errors
- [ ] Verify license creation rate matches payment rate
- [ ] Set up alerts for failed webhooks

---

## Additional Resources

- [ABA PayWay Developer Portal](https://developer.payway.com.kh/)
- [KHQR Specification](https://api-bakong.nbc.gov.kh/document)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [ABA Sandbox Registration](https://sandbox.payway.com.kh/register-sandbox/)

---

**Document Version:** 1.0  
**Maintained by:** Development Team  
**Last Review:** 2026-01-29
