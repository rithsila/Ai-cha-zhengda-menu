# Lucky Draw Feature Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Lucky Draw system by enabling prize voucher redemption in online checkout, adding the Staff Raffle draw UI, displaying earned tickets on orders, and adding celebratory animations.

**Architecture:** 
1. The backend will allow orders to link a `prizeClaimId` so customers can redeem free drinks or food items online.
2. The staff dashboard will get a Raffle Draw control card that triggers `/api/lucky-draw/draw` with a live shuffle UI.
3. The customer menu will display ticket earning badges in cart/checkout and play sound + confetti on winning spins.

**Tech Stack:** React, Tailwind CSS, TypeScript, Express, Prisma, SQLite, Canvas API, Vitest.

---

### Task 1: Redeem Prize Vouchers at Online Checkout

**Files:**
- Modify: `apps/api/src/app.ts` (`POST /api/orders`)
- Modify: `apps/menu/src/components/CheckoutModal.tsx`
- Test: `apps/api/tests/customer-lucky-draw.test.ts`

**Interfaces:**
- Consumes: `GET /api/me/prizes` returning pending claims.
- Produces: `POST /api/orders` accepting `{ prizeClaimCode?: string }`, applying 100% discount on matched prize item and marking claim as `claimed`.

- [x] **Step 1: Write backend test for ordering with prize voucher**
- [x] **Step 2: Run test to confirm failure**
- [x] **Step 3: Update backend `POST /api/orders`**
- [x] **Step 4: Update `CheckoutModal.tsx` to let user pick available voucher**
- [x] **Step 5: Run tests and verify**

---

### Task 2: Staff Raffle Draw UI in Dashboard

**Files:**
- Modify: `apps/staff/src/components/crm/LuckyDrawManagement.tsx`
- Test: Build and manual verification

**Interfaces:**
- Consumes: `POST /api/lucky-draw/draw` with `{ prizeName: string, tierFilter: string }`
- Produces: Visual Raffle Draw card with candidate counter and winner announcement popup.

- [x] **Step 1: Add Raffle Draw state and API call in `LuckyDrawManagement.tsx`**
- [x] **Step 2: Build the Raffle Draw card UI**
- [x] **Step 3: Build Winner Celebration modal**
- [x] **Step 4: Verify staff app build**

---

### Task 3: Ticket Transparency in Cart, Checkout, and Order Receipt

**Files:**
- Modify: `apps/menu/src/components/CheckoutModal.tsx`
- Modify: `apps/menu/src/components/OrdersView.tsx`

**Interfaces:**
- Consumes: User tier and system ticket rates.
- Produces: Clean ticket indicator badges on checkout summary and order history.

- [x] **Step 1: Add ticket badge in CheckoutModal**
- [x] **Step 2: Add ticket badge in OrdersView**
- [x] **Step 3: Verify menu app build**

---

### Task 4: Sound & Confetti Celebrations for Spin Wheel

**Files:**
- Modify: `apps/menu/src/components/CustomerLuckyWheelModal.tsx`

**Interfaces:**
- Consumes: Spin state and win event.
- Produces: Audible tick sound during deceleration and confetti animation on win.

- [x] **Step 1: Add Web Audio API ticking sound generator**
- [x] **Step 2: Add Confetti burst on prize celebration**
- [x] **Step 3: Verify spin wheel in browser**

---

### Task 5: End-to-End Verification & Quality Check

**Files:**
- Run: API test suites
- Run: Staff app build
- Run: Menu app build

- [x] **Step 1: Run API tests (26 test files / 245 tests passed)**
- [x] **Step 2: Run Menu build (built in 379ms)**
- [x] **Step 3: Run Staff build (built in 171ms)**
