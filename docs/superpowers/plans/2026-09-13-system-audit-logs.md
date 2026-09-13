# System Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete system audit log to track payments (ABA transactions & webhooks), order status changes, menu & price updates, and staff actions, complete with a search dashboard for troubleshooting customer complaints.

**Architecture:** An append-only SQLite `AuditLog` table in Prisma. A resilient helper `recordAuditLog()` logs events without blocking or breaking user transactions. Instrumented API routes for payments, orders, catalog price changes, and staff actions. A manager-accessible Audit Logs tab in the Staff dashboard with live search by Order ID, ABA Transaction ID, and action filter.

**Tech Stack:** Express 5, Prisma, SQLite, TypeScript, React 19, Vite, Tailwind v4, Vitest.

---

### Task 1: Prisma Schema & AuditLog Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: `npx prisma db push`

**Interfaces:**
- Produces: `prisma.auditLog` model

- [ ] **Step 1: Add `AuditLog` model to `schema.prisma`**

Add the model to `apps/api/prisma/schema.prisma`:
```prisma
model AuditLog {
  id          String   @id @default(uuid())
  actorType   String   // "staff" | "manager" | "customer" | "system"
  actorId     String?  // StaffAccount.id, telegramUserId, or "aba-webhook"
  actorName   String?  // e.g. "Sophea (Staff)", "Admin", "Customer"
  action      String   // "PAYMENT_INITIATED", "PAYMENT_APPROVED", "PAYMENT_MISMATCH", "ORDER_STATUS_CHANGED", "PRICE_UPDATE", "ITEM_SOLD_OUT_TOGGLED"
  entityType  String   // "order", "payment", "menu_item", "category", "staff"
  entityId    String?  // Order ID, Menu Item ID, etc.
  oldValue    String?  // JSON snapshot before change
  newValue    String?  // JSON snapshot after change
  metadata    String?  // JSON extra details (tranId, amounts, raw error, IP)
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
  @@index([action])
  @@index([createdAt])
  @@index([actorId])
}
```

- [ ] **Step 2: Sync database and regenerate Prisma Client**

Run:
```bash
npx --prefix apps/api prisma db push
npx --prefix apps/api prisma generate
```
Expected: Database schema synced, client generated.

- [ ] **Step 3: Verify existing tests still pass**

Run:
```bash
npm --prefix apps/api test
```
Expected: All tests pass.

- [ ] **Step 4: Commit schema changes**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(audit): add AuditLog model to Prisma schema"
```

---

### Task 2: Audit Logging Utility & Unit Tests

**Files:**
- Create: `apps/api/src/audit.ts`
- Create: `apps/api/tests/audit.test.ts`
- Modify: `apps/api/src/auth.ts` (export session helper)

**Interfaces:**
- Produces: `recordAuditLog(prisma: any, entry: AuditLogEntry): Promise<void>`
- Produces: `getStaffSessionInfo(req: any): { role: string; name: string; id?: string } | null`

- [ ] **Step 1: Write the failing unit test for `recordAuditLog`**

Create `apps/api/tests/audit.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/app';
import { recordAuditLog } from '../src/audit';

describe('Audit Logging System', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  it('records an audit log entry successfully', async () => {
    await recordAuditLog(prisma, {
      actorType: 'manager',
      actorId: 'admin-1',
      actorName: 'Admin',
      action: 'PRICE_UPDATE',
      entityType: 'menu_item',
      entityId: 'a1',
      oldValue: { basePrice: 2.0 },
      newValue: { basePrice: 2.5 },
      metadata: { reason: 'Sugar inflation' },
    });

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('PRICE_UPDATE');
    expect(logs[0].actorName).toBe('Admin');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ basePrice: 2.0 });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ basePrice: 2.5 });
  });

  it('never throws even if writing to database fails', async () => {
    const mockPrisma = {
      auditLog: {
        create: () => Promise.reject(new Error('DB connection failed')),
      },
    };

    await expect(
      recordAuditLog(mockPrisma as any, {
        actorType: 'system',
        action: 'TEST_ERROR',
        entityType: 'order',
      })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx --prefix apps/api vitest run tests/audit.test.ts
```
Expected: FAIL (module `../src/audit` not found).

- [ ] **Step 3: Implement `apps/api/src/audit.ts` and `apps/api/src/auth.ts` helper**

In `apps/api/src/auth.ts`, export:
```typescript
export function getStaffSessionInfo(req: { headers: Record<string, unknown> }): { role: StaffRole; name?: string; telegramUserId?: string; phoneNumber?: string } | null {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  return { role: session.role, name: (session as any).name, telegramUserId: (session as any).telegramUserId, phoneNumber: (session as any).phoneNumber };
}
```

In `apps/api/src/audit.ts`:
```typescript
export interface AuditLogEntry {
  actorType: 'staff' | 'manager' | 'customer' | 'system';
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: 'order' | 'payment' | 'menu_item' | 'category' | 'store_config' | 'staff';
  entityId?: string | null;
  oldValue?: Record<string, any> | string | null;
  newValue?: Record<string, any> | string | null;
  metadata?: Record<string, any> | string | null;
}

export async function recordAuditLog(prisma: any, entry: AuditLogEntry): Promise<void> {
  try {
    const stringify = (val: any) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };

    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        oldValue: stringify(entry.oldValue),
        newValue: stringify(entry.newValue),
        metadata: stringify(entry.metadata),
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx --prefix apps/api vitest run tests/audit.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit audit utility**

```bash
git add apps/api/src/audit.ts apps/api/src/auth.ts apps/api/tests/audit.test.ts
git commit -m "feat(audit): implement resilient audit logging helper and test suite"
```

---

### Task 3: Instrument Payment & Order Lifecycle

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/audit.test.ts`

**Interfaces:**
- Logs actions: `PAYMENT_INITIATED`, `PAYMENT_APPROVED`, `PAYMENT_MISMATCH`, `PAYMENT_WEBHOOK_RECEIVED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`

- [ ] **Step 1: Write integration tests for payment and order status audit logging**

In `apps/api/tests/audit.test.ts`, add test cases verifying:
- Payment approval writes a `PAYMENT_APPROVED` entry.
- Order status update writes an `ORDER_STATUS_CHANGED` entry with actor details.

- [ ] **Step 2: Instrument ABA payment handlers in `apps/api/src/app.ts`**

1. In `POST /api/payment/aba/create`:
   Record `PAYMENT_INITIATED` (`entityType: 'payment'`, `entityId: order.id`, metadata: `{ tranId, amount: order.totalAmount }`).
2. In `confirmAbaPayment()`:
   - On mismatch: Record `PAYMENT_MISMATCH` with received amount/currency vs expected.
   - On approved: Record `PAYMENT_APPROVED` with `tranId`, `amount`, and `pickupCode`.
3. In `POST /api/payment/aba/callback`:
   Record `PAYMENT_WEBHOOK_RECEIVED` with `tran_id` and webhook body.
4. In `PUT /api/orders/:id/status`:
   Extract staff info using `getStaffSessionInfo(req)` and record `ORDER_STATUS_CHANGED` with `oldValue: existingOrder.status`, `newValue: status`, and `cancelReason`.

- [ ] **Step 3: Run payment and access-control tests**

Run:
```bash
npm --prefix apps/api test
```
Expected: All 32+ suites pass.

- [ ] **Step 4: Commit payment & order audit instrumentation**

```bash
git add apps/api/src/app.ts apps/api/tests/audit.test.ts
git commit -m "feat(audit): instrument ABA payments and order status transitions"
```

---

### Task 4: Instrument Menu, Price & Catalog Edits

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/audit.test.ts`

**Interfaces:**
- Logs actions: `ITEM_PRICE_UPDATE`, `ITEM_SOLD_OUT_TOGGLED`, `ITEM_DELETED`

- [ ] **Step 1: Add catalog audit tests to `apps/api/tests/audit.test.ts`**

Test that:
- Updating item base price logs `ITEM_PRICE_UPDATE` with old and new price.
- Toggling sold-out logs `ITEM_SOLD_OUT_TOGGLED` with actor name.

- [ ] **Step 2: Instrument catalog routes in `apps/api/src/app.ts`**

1. In `PUT /api/catalog/:id`:
   If `basePrice !== undefined && basePrice !== existing.basePrice`, record `ITEM_PRICE_UPDATE` with `oldValue: { basePrice: existing.basePrice }`, `newValue: { basePrice }`, actor details.
2. In `PUT /api/catalog/:id/sold-out`:
   Record `ITEM_SOLD_OUT_TOGGLED` with item id, old value, new value (`isSoldOut`).
3. In `DELETE /api/catalog/:id`:
   Record `ITEM_DELETED` or `ITEM_ARCHIVED`.

- [ ] **Step 3: Run catalog and audit tests**

Run:
```bash
npx --prefix apps/api vitest run tests/audit.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit catalog audit instrumentation**

```bash
git add apps/api/src/app.ts apps/api/tests/audit.test.ts
git commit -m "feat(audit): instrument menu item price updates and sold out toggles"
```

---

### Task 5: Staff Audit Log API & Dashboard UI

**Files:**
- Modify: `apps/api/src/app.ts` (Add `GET /api/audit-logs`)
- Modify: `apps/staff/src/App.tsx` (Add Audit Logs Tab)
- Create: `apps/staff/src/components/AuditLogView.tsx`

**Interfaces:**
- Produces: `GET /api/audit-logs?search=...&action=...&limit=50`
- Produces: Staff Dashboard tab `audit` (accessible to managers)

- [ ] **Step 1: Add `GET /api/audit-logs` endpoint in `apps/api/src/app.ts`**

Endpoint specifications:
- Auth: `requireStaff`.
- Filters:
  - `search`: search by `entityId`, `actorName`, or `metadata` (e.g. ABA transaction ID or Order ID).
  - `action`: filter by specific action.
  - `limit`: default 50.
- Order: `createdAt: 'desc'`.

- [ ] **Step 2: Add API test for `GET /api/audit-logs`**

Verify query filters, search by ABA transaction ID, and pagination in `apps/api/tests/audit.test.ts`.

- [ ] **Step 3: Build `AuditLogView.tsx` in `apps/staff`**

Features:
- Search input (Order ID, ABA Transaction ID, Staff Name, Item ID).
- Action filter dropdown (`All`, `Payments`, `Price Changes`, `Order Status`, `Sold Out`).
- Clear display table:
  - **Timestamp** (formatted local time)
  - **Action Badge** (green for Approved, amber for Price, red for Cancel/Mismatch)
  - **Actor** (e.g. "Sophea (Staff)" or "ABA Webhook")
  - **Target** (Order `#AI-001`, Item `Milk Tea`, etc.)
  - **Details summary** (e.g. `Price: $2.00 → $2.50`, `ABA Tran ID: ABA98124`, `Amount: $5.00`)
- Expandable modal/row to view full JSON payload for dispute resolution.

- [ ] **Step 4: Integrate tab into `apps/staff/src/App.tsx`**

Add `audit` to navigation sidebar and route rendering.

- [ ] **Step 5: Run full workspace build and test suite**

Run:
```bash
npm --prefix apps/api test
npm run build
```
Expected: All tests pass, API and Staff apps build cleanly.

- [ ] **Step 6: Commit complete feature**

```bash
git add apps/api apps/staff
git commit -m "feat(audit): add audit log API endpoint and staff dashboard UI"
```
