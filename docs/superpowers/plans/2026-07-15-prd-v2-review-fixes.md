# PRD v2 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL/HIGH/MEDIUM findings from the 2026-07-15 code review of the PRD v2 implementation (C1, H1–H5, M1, M2, M4; M3 is a user action — fill ABA credentials in `.env`).

**Architecture:** Add server-side PIN auth for admin routes, move loyalty point mutations from order-creation to payment-settlement time, compute order totals server-side from the DB catalog, and wire up the dead UI (manager rewards CRUD, browser Telegram login). The Express API gets split: `src/index.ts` (entry) + `src/app.ts` (routes, testable via `createApp()`) + small helpers (`loyalty.ts`, `telegram-auth.ts`).

**Tech Stack:** Express 5 + Prisma/SQLite (API), React 19 + Vite (frontends), vitest + supertest (new, API integration tests). ⚠️ `ts-node` is broken in this repo — always use `tsx` / vitest for script execution.

## Global Constraints

- Working dir: `/Users/rithsila/Projects/Ai Cha Menu` (monorepo, npm workspaces `apps/*`).
- The whole v2 implementation is currently **uncommitted**. Task 0 commits it as a baseline so each fix task produces a clean, reviewable commit. Per-task commits stage **only the files named in the task**.
- Commit format: `<type>: <description>` (feat/fix/test/chore). Attribution footers disabled per user settings.
- Immutable state updates in React code (spread/map/filter — never mutate).
- Frontend API base URL stays hardcoded `http://localhost:4000` (existing convention, documented deploy caveat in CLAUDE.md).
- No new frontend test infra — frontend tasks verify with `npm run build` + `npm run lint` (oxlint) + manual smoke steps. API tasks are TDD with vitest.
- API test DB: `apps/api/prisma/test.db` via `DATABASE_URL=file:./test.db` (never touch `dev.db` in tests).
- Simple-English UI copy (user preference).
- Points defaults (used until config exists): redemption 100 points = $1 (`pointsPerDollar`), earning 10 points per $1 (`earnPointsPerDollar`). Delivery fee $1.00 flat.

---

### Task 0: Baseline commit of the current v2 implementation

**Files:**
- Commit (no edits): `CHANGELOG.md`, `PRD.md`, `apps/api/prisma/dev.db`, `apps/api/prisma/schema.prisma`, `apps/api/src/index.ts`, `apps/menu/src/App.tsx`, `apps/staff/src/App.tsx`, `apps/menu/src/components/AccountView.tsx`, `apps/staff/src/components/ManagerDashboard.tsx`, `.gitignore`, `apps/api/.env.example`, `apps/menu/.env.example`, `apps/staff/.env.example`, `docs/superpowers/plans/2026-07-15-prd-v2-review-fixes.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a clean git baseline so later tasks' commits contain only their own changes.

- [ ] **Step 1: Verify status matches the list above** — `git status --short`. Expected: exactly the files listed (plus nothing else surprising).
- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md PRD.md apps/api/prisma/dev.db apps/api/prisma/schema.prisma apps/api/src/index.ts apps/menu/src/App.tsx apps/staff/src/App.tsx apps/menu/src/components/AccountView.tsx apps/staff/src/components/ManagerDashboard.tsx .gitignore apps/api/.env.example apps/menu/.env.example apps/staff/.env.example docs/superpowers/plans/2026-07-15-prd-v2-review-fixes.md
git commit -m "feat: prd v2 baseline - accounts, loyalty, manager mode, web login (pre-review-fixes)"
```

---

### Task 1: API test harness + `createApp()` refactor

**Files:**
- Modify: `apps/api/package.json` (scripts + devDeps)
- Modify: `apps/api/.gitignore` (ignore test db)
- Create: `apps/api/src/app.ts` (all express setup + routes, moved from index.ts)
- Modify: `apps/api/src/index.ts` (becomes a thin entry)
- Create: `apps/api/tests/app.test.ts`

**Interfaces:**
- Consumes: existing route code in `src/index.ts:1-460`.
- Produces: `createApp(): express.Express` and `prisma: PrismaClient` exported from `src/app.ts`. `setupBot()` is called ONLY in `index.ts` (never in tests). All later API tasks edit `src/app.ts` and import `createApp` in tests.

- [ ] **Step 1: Install dev deps**

```bash
cd "apps/api" && npm install -D vitest supertest @types/supertest
```

- [ ] **Step 2: Add test script and ignore test db**

In `apps/api/package.json` replace the `test` script:

```json
"test": "DATABASE_URL=file:./test.db npx prisma db push --skip-generate --accept-data-loss && DATABASE_URL=file:./test.db vitest run --no-file-parallelism"
```

(`--no-file-parallelism` is required: all test files share one SQLite file, and parallel writers cause `SQLITE_BUSY` errors and config cross-talk between suites.)

Append to `apps/api/.gitignore`:

```
prisma/test.db
prisma/test.db-journal
```

- [ ] **Step 3: Write the failing smoke test** — `apps/api/tests/app.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('GET /', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

- [ ] **Step 4: Run test to verify it fails** — `cd apps/api && npm test`. Expected: FAIL, `Cannot find module '../src/app'`.
- [ ] **Step 5: Create `src/app.ts`** — move EVERYTHING from `index.ts` except `setupBot()` and `app.listen(...)` into:

```ts
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ABAPayWay, generateKHQR, generateTransactionId } from 'aba-payway-sdk-unofficial';

export const prisma = new PrismaClient();

export function createApp() {
  const app = express();

  app.use(express.json({
    verify: (req: any, res, buf) => { req.rawBody = buf; }
  }));
  app.use(cors());

  const aba = new ABAPayWay({
    merchantId: process.env.ABA_MERCHANT_ID || 'rithsila_sandbox',
    apiKey: process.env.ABA_API_KEY || 'sandbox_api_key_mock',
    baseUrl: process.env.ABA_BASE_URL || 'https://checkout-sandbox.payway.com.kh',
    webhookSecret: process.env.ABA_WEBHOOK_SECRET || 'sandbox_secret_mock',
  });

  // ... every existing route from index.ts, unchanged, in the same order ...

  return app;
}
```

Rewrite `src/index.ts` as:

```ts
import { createApp } from './app';
import { setupBot } from './bot';

const app = createApp();
setupBot();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Run test to verify it passes** — `npm test`. Expected: PASS (1 test).
- [ ] **Step 7: Verify dev server still boots** — `npx tsx src/index.ts` briefly, expect "Server running on http://localhost:4000", then stop it.
- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json package-lock.json apps/api/.gitignore apps/api/src/app.ts apps/api/src/index.ts apps/api/tests/app.test.ts
git commit -m "test(api): add vitest harness and extract createApp from entrypoint"
```

---

### Task 2: C1 — server-side PIN auth for admin routes

**Files:**
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/auth.test.ts`
- Modify: `apps/staff/src/App.tsx` (StaffLogin + ManagerLogin use the API; remove `VITE_*_PIN`)
- Modify: `apps/staff/src/components/ManagerDashboard.tsx` (accept `managerPin` prop, send header)
- Modify: `apps/api/.env.example`, `apps/staff/.env.example`

**Interfaces:**
- Consumes: `createApp` from Task 1.
- Produces:
  - `POST /api/auth/staff-login` body `{ pin: string, role: 'staff' | 'manager' }` → 200 `{ ok: true }` | 401 | 400.
  - Express middleware `requireManager` — checks header `x-manager-pin` against `process.env.MANAGER_PIN || '9999'`; applied to `PUT /api/config`, `POST/PUT/DELETE /api/rewards`, `PUT /api/users/:telegramUserId/points`, `GET /api/analytics/sales`. Tasks 3, 6, 8 rely on this middleware existing.
  - `ManagerDashboard({ managerPin }: { managerPin: string })` — Tasks 6 and 8 build UI inside this component and must send `'x-manager-pin': managerPin` on writes.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

beforeAll(() => {
  process.env.STAFF_PIN = '1234';
  process.env.MANAGER_PIN = '9999';
});

describe('POST /api/auth/staff-login', () => {
  it('accepts correct staff pin', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '1234', role: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  it('rejects wrong manager pin', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '0000', role: 'manager' });
    expect(res.status).toBe(401);
  });
  it('rejects missing role', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '1234' });
    expect(res.status).toBe(400);
  });
});

describe('manager-protected routes', () => {
  it('blocks PUT /api/config without header', async () => {
    const res = await request(app).put('/api/config').send({ key: 'pointsPerDollar', value: '100' });
    expect(res.status).toBe(401);
  });
  it('allows PUT /api/config with header', async () => {
    const res = await request(app).put('/api/config')
      .set('x-manager-pin', '9999')
      .send({ key: 'pointsPerDollar', value: '100' });
    expect(res.status).toBe(200);
  });
  it('blocks GET /api/analytics/sales without header', async () => {
    const res = await request(app).get('/api/analytics/sales');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (404 on login route, 200 on unprotected routes).
- [ ] **Step 3: Implement in `src/app.ts`** — add near the top of `createApp()`:

```ts
import type { Request, Response, NextFunction } from 'express';

const staffPin = () => process.env.STAFF_PIN || '1234';
const managerPin = () => process.env.MANAGER_PIN || '9999';

const requireManager = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-manager-pin'] !== managerPin()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

app.post('/api/auth/staff-login', (req, res) => {
  const { pin, role } = req.body || {};
  if (typeof pin !== 'string' || (role !== 'staff' && role !== 'manager')) {
    return res.status(400).json({ error: 'pin and role are required' });
  }
  const expected = role === 'manager' ? managerPin() : staffPin();
  if (pin !== expected) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ ok: true });
});
```

Then add `requireManager` to these existing routes: `app.put('/api/config', requireManager, ...)`, `app.post('/api/rewards', requireManager, ...)`, `app.put('/api/rewards/:id', requireManager, ...)`, `app.delete('/api/rewards/:id', requireManager, ...)`, `app.get('/api/analytics/sales', requireManager, ...)`, `app.put('/api/users/:telegramUserId/points', requireManager, ...)`.

- [ ] **Step 4: Run tests** — `npm test`. Expected: PASS.
- [ ] **Step 5: Update staff frontend** — in `apps/staff/src/App.tsx`:

`StaffLogin`: delete `const expectedPin = import.meta.env.VITE_STAFF_PIN || '1234';` and replace `handleSubmit` with:

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    const res = await fetch('http://localhost:4000/api/auth/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, role: 'staff' }),
    });
    if (res.ok) onLogin();
    else { setError(true); setPin(''); }
  } catch {
    setError(true);
  }
};
```

`ManagerLogin`: change prop to `{ onLogin }: { onLogin: (pin: string) => void }`, delete the `expectedPin` line, replace `handleSubmit` with the same fetch but `role: 'manager'` and `if (res.ok) onLogin(pin);`.

In `App`: replace `const [isManagerAuthenticated, setIsManagerAuthenticated] = useState(false);` with `const [managerPin, setManagerPin] = useState('');` and render:

```tsx
{activeTab === 'manager' ? (
  managerPin ? <ManagerDashboard managerPin={managerPin} /> : <ManagerLogin onLogin={setManagerPin} />
) : activeTab === 'menu' ? (
```

In `ManagerDashboard.tsx`: change signature to `export function ManagerDashboard({ managerPin }: { managerPin: string })` and change `handleSavePoints` fetch to include the header:

```ts
headers: { 'Content-Type': 'application/json', 'x-manager-pin': managerPin },
```

Also add the header to the analytics fetch in `fetchDashboardData`:

```ts
fetch('http://localhost:4000/api/analytics/sales', { headers: { 'x-manager-pin': managerPin } }),
```

(`fetchDashboardData` moves inside the component already — add `managerPin` to the `useEffect` dependency array: `[managerPin]`.)

- [ ] **Step 6: Update env examples** — append to `apps/api/.env.example`:

```
# ===== Staff Dashboard PINs (server-side check) =====
# PIN for the staff dashboard lock screen. Default: 1234
STAFF_PIN="1234"
# PIN for Manager Mode. Also required as x-manager-pin header on admin API calls. Default: 9999
MANAGER_PIN="9999"
```

Replace the whole content of `apps/staff/.env.example` with:

```
# PINs moved to the API server (apps/api/.env: STAFF_PIN, MANAGER_PIN).
# The staff app now checks PINs against the API, so nothing is needed here.
```

- [ ] **Step 7: Verify frontends** — `cd apps/staff && npm run build && npm run lint`. Expected: both pass.
- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/auth.test.ts apps/staff/src/App.tsx apps/staff/src/components/ManagerDashboard.tsx apps/api/.env.example apps/staff/.env.example
git commit -m "fix(security): verify staff/manager pins server-side and guard admin routes"
```

---

### Task 3: H1 + H5 — user lookup endpoint, points validation, Account tab fix

**Files:**
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/users.test.ts`
- Modify: `apps/menu/src/components/AccountView.tsx`

**Interfaces:**
- Consumes: `requireManager` middleware (Task 2).
- Produces:
  - `GET /api/users/:telegramUserId` — find-only, 200 with User JSON or 404 `{ error: 'User not found' }`. (Existing `GET /api/user/:id` upsert route is untouched — it stays the "get or create my own profile" route.)
  - `PUT /api/users/:telegramUserId/points` now 400s unless body is `{ points: <integer ≥ 0> }`.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/users.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const uid = `test-${randomUUID()}`;

beforeAll(async () => {
  process.env.MANAGER_PIN = '9999';
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 50 } });
});

describe('GET /api/users/:id (find-only)', () => {
  it('returns 404 for unknown user', async () => {
    const res = await request(app).get(`/api/users/no-such-${randomUUID()}`);
    expect(res.status).toBe(404);
  });
  it('returns an existing user', async () => {
    const res = await request(app).get(`/api/users/${uid}`);
    expect(res.status).toBe(200);
    expect(res.body.loyaltyPoints).toBe(50);
  });
});

describe('PUT /api/users/:id/points validation', () => {
  const put = (body: unknown) =>
    request(app).put(`/api/users/${uid}/points`).set('x-manager-pin', '9999').send(body as object);

  it('rejects negative points', async () => {
    expect((await put({ points: -500 })).status).toBe(400);
  });
  it('rejects non-integer points', async () => {
    expect((await put({ points: 1.5 })).status).toBe(400);
  });
  it('rejects string points', async () => {
    expect((await put({ points: 'abc' })).status).toBe(400);
  });
  it('accepts a valid value', async () => {
    const res = await put({ points: 120 });
    expect(res.status).toBe(200);
    expect(res.body.loyaltyPoints).toBe(120);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (404-route missing; -500 currently succeeds).
- [ ] **Step 3: Implement in `src/app.ts`** — add the find-only route ABOVE the points route:

```ts
app.get('/api/users/:telegramUserId', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramUserId: req.params.telegramUserId }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});
```

At the top of the points route handler add:

```ts
const { points } = req.body || {};
if (typeof points !== 'number' || !Number.isInteger(points) || points < 0) {
  return res.status(400).json({ error: 'points must be a whole number of 0 or more' });
}
```

- [ ] **Step 4: Run tests** — `npm test`. Expected: PASS.
- [ ] **Step 5: Fix AccountView** — in `apps/menu/src/components/AccountView.tsx` line 16, change the fetch URL from `/api/users/${userId}` to `/api/user/${userId}` (singular — the get-or-create route). Also fix the phone line (line 50):

```tsx
<p className="text-sm text-tg-hint font-medium">
  {profile.phoneNumber ? `+${profile.phoneNumber}` : 'No phone linked yet'}
</p>
```

And the name heading (line 47-49) so it never renders empty:

```tsx
<h2 className="text-xl font-bold text-tg-text">
  {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Telegram User'}
</h2>
```

(`ManagerDashboard.handleSearchUser` already calls `/api/users/:id` — it now works via the new find-only route, and no longer creates junk users on typos.)

- [ ] **Step 6: Verify menu app** — `cd apps/menu && npm run build && npm run lint`. Expected: pass.
- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/users.test.ts apps/menu/src/components/AccountView.tsx
git commit -m "fix: add find-only user endpoint, validate points input, repair account tab"
```

---

### Task 4: H2 — settle loyalty points at payment, not at order creation

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Order: + `pointsRedeemed`, `pointsSettled`)
- Create: `apps/api/src/loyalty.ts`
- Modify: `apps/api/src/app.ts` (order creation, webhook, status route)
- Create: `apps/api/tests/loyalty.test.ts`

**Interfaces:**
- Consumes: `createApp`, `prisma` (Task 1).
- Produces:
  - Order model gains `pointsRedeemed Int @default(0)` and `pointsSettled Boolean @default(false)`.
  - `settleOrderPoints(prisma: PrismaClient, orderId: string): Promise<Order | null>` in `src/loyalty.ts` — idempotent; deducts `min(pointsRedeemed, user.loyaltyPoints)` and credits `pointsEarned` in one transaction, then sets `pointsSettled: true`.
  - `POST /api/orders` accepts `pointsToUse?: number` (integer ≥ 0; legacy `usePoints: true` still means "use maximum" until Task 7 removes it) and **no longer mutates user points**.
  - Settlement is triggered by: ABA webhook marking the order `paid`, and `PUT /api/orders/:id/status` with `status` of `'completed'` or `'paid'` (cash orders settle when staff completes them).

- [ ] **Step 1: Update schema and push** — add to `model Order` in `apps/api/prisma/schema.prisma`:

```prisma
  pointsRedeemed Int         @default(0)
  pointsSettled  Boolean     @default(false)
```

Run: `cd apps/api && npx prisma db push` (syncs dev.db + regenerates client). Expected: "Your database is now in sync".

- [ ] **Step 2: Write failing tests** — `apps/api/tests/loyalty.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const uid = `test-${randomUUID()}`;
const itemId = `test-item-${randomUUID()}`;

const orderBody = (pointsToUse: number) => ({
  items: [{ menuItemId: itemId, quantity: 1, totalPrice: 5.0, selectedModifiers: {} }],
  totalAmount: 5.0,
  paymentMethod: 'khqr',
  telegramUserId: uid,
  orderType: 'pickup',
  pointsToUse,
});

beforeAll(async () => {
  delete process.env.ABA_WEBHOOK_SECRET; // webhook signature check skipped in tests
  // Reset rate config so a previous run of config.test.ts can't change this suite's math
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 200 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Test Tea', basePrice: 5.0 },
  });
});

describe('order creation does not move points', () => {
  it('keeps user points unchanged while order is pending', async () => {
    const res = await request(app).post('/api/orders').send(orderBody(100));
    expect(res.status).toBe(200);
    expect(res.body.pointsRedeemed).toBe(100);
    expect(res.body.discountApplied).toBe(1);      // 100 pts / 100 per $ = $1
    expect(res.body.totalAmount).toBe(4);          // 5 - 1
    expect(res.body.pointsEarned).toBe(40);        // floor(4 * 10)
    const user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user?.loyaltyPoints).toBe(200);         // untouched
  });
});

describe('settlement on completion (cash path)', () => {
  it('settles exactly once', async () => {
    const created = await request(app).post('/api/orders').send(orderBody(100));
    const id = created.body.id;

    await request(app).put(`/api/orders/${id}/status`).send({ status: 'completed' });
    let user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    const afterFirst = user!.loyaltyPoints;        // 200 - 100 + 40 = 140 (relative to fresh 200 minus prior test noise)

    await request(app).put(`/api/orders/${id}/status`).send({ status: 'completed' });
    user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user!.loyaltyPoints).toBe(afterFirst);  // idempotent
    const order = await prisma.order.findUnique({ where: { id } });
    expect(order!.pointsSettled).toBe(true);
  });
});

describe('settlement on webhook (ABA path)', () => {
  it('marks paid and settles points', async () => {
    const created = await request(app).post('/api/orders').send(orderBody(0));
    const tranId = `t-${randomUUID()}`;
    await prisma.order.update({ where: { id: created.body.id }, data: { transactionId: tranId } });
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    const res = await request(app).post('/api/payment/aba/webhook').send({ tran_id: tranId, status: 'APPROVED' });
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: created.body.id } });
    expect(order!.status).toBe('paid');
    expect(order!.pointsSettled).toBe(true);
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before + order!.pointsEarned); // earned credited at payment
  });
});
```

- [ ] **Step 3: Run to verify failure** — `npm test`. Expected: FAIL (points move at creation today; `pointsSettled` false after completion).
- [ ] **Step 4: Create `src/loyalty.ts`**:

```ts
import { PrismaClient } from '@prisma/client';

/**
 * Settle loyalty points for an order exactly once (idempotent).
 * Deducts redeemed points (clamped to the user's balance) and credits earned points.
 */
export async function settleOrderPoints(prisma: PrismaClient, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.pointsSettled || !order.telegramUserId) return order;

    const user = await tx.user.findUnique({ where: { telegramUserId: order.telegramUserId } });
    if (user) {
      const redeem = Math.min(order.pointsRedeemed, user.loyaltyPoints);
      await tx.user.update({
        where: { telegramUserId: order.telegramUserId },
        data: { loyaltyPoints: user.loyaltyPoints - redeem + order.pointsEarned },
      });
    }
    return tx.order.update({ where: { id: orderId }, data: { pointsSettled: true } });
  });
}
```

- [ ] **Step 5: Rewrite the points section of `POST /api/orders` in `src/app.ts`** — replace everything from `let discountApplied = 0;` through the end of the `$transaction` with:

```ts
const POINTS_PER_DOLLAR = 100; // Task 6 makes this configurable
const EARN_POINTS_PER_DOLLAR = 10;

let requestedPoints = 0;
if (typeof pointsToUse === 'number' && Number.isInteger(pointsToUse) && pointsToUse > 0) {
  requestedPoints = pointsToUse;
} else if (usePoints) {
  requestedPoints = user?.loyaltyPoints ?? 0; // legacy boolean = use max (removed in Task 7)
}

const available = user?.loyaltyPoints ?? 0;
const maxByTotal = Math.floor(reqTotalAmount * POINTS_PER_DOLLAR);
const pointsRedeemed = Math.min(requestedPoints, available, maxByTotal);
const discountApplied = pointsRedeemed / POINTS_PER_DOLLAR;
const finalAmount = Math.round((reqTotalAmount - discountApplied) * 100) / 100;
const pointsEarned = Math.floor(finalAmount * EARN_POINTS_PER_DOLLAR);

const order = await prisma.order.create({
  data: {
    totalAmount: finalAmount,
    paymentMethod,
    telegramUserId,
    status: 'pending',
    pickupCode: `A-${Math.floor(100 + Math.random() * 900)}`,
    orderType: orderType || 'pickup',
    deliveryAddress: deliveryAddress || null,
    deliveryLat: deliveryLat || null,
    deliveryLng: deliveryLng || null,
    branchId: branchId || null,
    pointsEarned,
    pointsRedeemed,
    discountApplied,
    items: {
      create: items.map((item: any) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        price: item.totalPrice,
        modifiers: JSON.stringify(item.selectedModifiers)
      }))
    }
  }
});
```

Add `pointsToUse` to the destructuring on the first line of the handler. Delete the old `prisma.$transaction` wrapper and both `tx.user.update` calls.

- [ ] **Step 6: Trigger settlement** — in the webhook handler, after `data: { status: 'paid' }` update succeeds, add:

```ts
await settleOrderPoints(prisma, order.id);
```

In `PUT /api/orders/:id/status`, after the update, add:

```ts
if (status === 'completed' || status === 'paid') {
  await settleOrderPoints(prisma, id);
}
```

Import at top of `app.ts`: `import { settleOrderPoints } from './loyalty';`

- [ ] **Step 7: Run tests** — `npm test`. Expected: ALL PASS (including earlier suites).
- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/dev.db apps/api/src/app.ts apps/api/src/loyalty.ts apps/api/tests/loyalty.test.ts
git commit -m "fix(loyalty): settle points at payment/completion instead of order creation"
```

---

### Task 5: M4 — compute order totals server-side

**Files:**
- Modify: `apps/api/src/app.ts` (`POST /api/orders`)
- Create: `apps/api/tests/order-totals.test.ts`

**Interfaces:**
- Consumes: order-creation code from Task 4.
- Produces: `POST /api/orders` ignores the client's `totalAmount`; each line price = DB `basePrice` + matched `ModifierOption.priceDelta`s (matched by option `id` inside `selectedModifiers`), × quantity; delivery adds flat `1.00`. Returns 400 for empty/unknown items. Task 6/7 build on the variable name `serverTotal`.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/order-totals.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const itemId = `test-item-${randomUUID()}`;
let optionId = '';

beforeAll(async () => {
  await prisma.menuItem.create({
    data: {
      id: itemId, brand: 'ai-cha', category: 'Test', name: 'Priced Tea', basePrice: 3.0,
      modifiers: { create: [{ name: 'Size', type: 'single', options: { create: [{ name: 'Large', priceDelta: 0.5 }] } }] },
    },
    include: { modifiers: { include: { options: true } } },
  });
  const created = await prisma.menuItem.findUnique({
    where: { id: itemId }, include: { modifiers: { include: { options: true } } },
  });
  optionId = created!.modifiers[0].options[0].id;
});

describe('server-side totals', () => {
  it('ignores a tampered client totalAmount', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 2, totalPrice: 0.01,
        selectedModifiers: { Size: [{ id: optionId, name: 'Large', priceDelta: 99 }] } }],
      totalAmount: 0.01,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res.status).toBe(200);
    // (3.0 + 0.5 real delta, NOT the client's fake 99) * 2 = 7.0
    expect(res.body.totalAmount).toBe(7);
  });

  it('adds the delivery fee server-side', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 3.0, selectedModifiers: {} }],
      totalAmount: 3.0,
      paymentMethod: 'cash',
      orderType: 'delivery',
      deliveryAddress: 'Test St',
    });
    expect(res.body.totalAmount).toBe(4); // 3 + 1 delivery fee
  });

  it('rejects an empty items array', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [], totalAmount: 0, paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown menu items', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: 'nope', quantity: 1, totalPrice: 1, selectedModifiers: {} }],
      totalAmount: 1, paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (totalAmount echoes the fake 0.01).
- [ ] **Step 3: Implement** — in `POST /api/orders`, immediately after destructuring the body and before the user upsert, add:

```ts
if (!Array.isArray(items) || items.length === 0) {
  return res.status(400).json({ error: 'Order must contain at least one item' });
}

const menuItems = await prisma.menuItem.findMany({
  where: { id: { in: items.map((i: any) => i?.menuItemId).filter(Boolean) } },
  include: { modifiers: { include: { options: true } } },
});

let itemsTotal = 0;
const pricedItems: { menuItemId: string; quantity: number; price: number; modifiers: string }[] = [];
for (const item of items) {
  const menuItem = menuItems.find((m) => m.id === item?.menuItemId);
  if (!menuItem) {
    return res.status(400).json({ error: `Unknown menu item: ${item?.menuItemId}` });
  }
  const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
  const allOptions = menuItem.modifiers.flatMap((g) => g.options);
  const selected = item.selectedModifiers && typeof item.selectedModifiers === 'object' ? item.selectedModifiers : {};
  const optionIds = Object.values(selected).flat().map((o: any) => o?.id).filter(Boolean);
  let unitPrice = menuItem.basePrice;
  for (const oid of optionIds) {
    const opt = allOptions.find((o) => o.id === oid);
    if (opt) unitPrice += opt.priceDelta;   // DB price, never the client's
  }
  const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
  itemsTotal += lineTotal;
  pricedItems.push({ menuItemId: menuItem.id, quantity, price: lineTotal, modifiers: JSON.stringify(selected) });
}

const DELIVERY_FEE = 1.0;
const serverTotal = Math.round((itemsTotal + (orderType === 'delivery' ? DELIVERY_FEE : 0)) * 100) / 100;
```

Then replace every use of `reqTotalAmount` with `serverTotal` (in `maxByTotal` and `finalAmount`), and replace the `items.map(...)` block inside `prisma.order.create` with:

```ts
items: { create: pricedItems }
```

Remove `totalAmount: reqTotalAmount` from the destructuring (the field is now ignored).

- [ ] **Step 4: Run all tests** — `npm test`. Expected: PASS (Task 4's tests still pass because their test item's client price equals its DB `basePrice`).
- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/order-totals.test.ts
git commit -m "fix(orders): compute totals and line prices server-side from the catalog"
```

---

### Task 6: M1 — configurable point rates + manager config UI

**Files:**
- Modify: `apps/api/src/loyalty.ts` (add `getConfigNumber`)
- Modify: `apps/api/src/app.ts` (use config in orders; validate `PUT /api/config`)
- Create: `apps/api/tests/config.test.ts`
- Modify: `apps/staff/src/components/ManagerDashboard.tsx` (rate editor UI)

**Interfaces:**
- Consumes: `requireManager` (Task 2), order creation (Tasks 4–5), `managerPin` prop.
- Produces:
  - `getConfigNumber(prisma, key, fallback): Promise<number>` in `loyalty.ts`.
  - Allowed config keys: `'pointsPerDollar'` (default 100), `'earnPointsPerDollar'` (default 10). `PUT /api/config` 400s on other keys or non-positive/non-numeric values.
  - `GET /api/config` (public, unchanged shape: `[{ key, value }]`) — Task 7's checkout UI reads `pointsPerDollar` from it.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/config.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const uid = `test-${randomUUID()}`;
const itemId = `test-item-${randomUUID()}`;

beforeAll(async () => {
  process.env.MANAGER_PIN = '9999';
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 100 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Cfg Tea', basePrice: 10.0 },
  });
});

describe('PUT /api/config validation', () => {
  const put = (body: object) =>
    request(app).put('/api/config').set('x-manager-pin', '9999').send(body);

  it('rejects unknown keys', async () => {
    expect((await put({ key: 'hackerKey', value: '1' })).status).toBe(400);
  });
  it('rejects non-positive values', async () => {
    expect((await put({ key: 'pointsPerDollar', value: '0' })).status).toBe(400);
  });
  it('accepts a valid rate', async () => {
    expect((await put({ key: 'pointsPerDollar', value: '50' })).status).toBe(200);
  });
});

describe('order creation uses the configured rate', () => {
  it('applies pointsPerDollar=50 (100 pts = $2 discount)', async () => {
    await request(app).put('/api/config').set('x-manager-pin', '9999')
      .send({ key: 'pointsPerDollar', value: '50' });
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 10, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup', telegramUserId: uid, pointsToUse: 100,
    });
    expect(res.body.discountApplied).toBe(2);   // 100 / 50
    expect(res.body.totalAmount).toBe(8);       // 10 - 2
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (no validation; discount still 1).
- [ ] **Step 3: Implement** — append to `src/loyalty.ts`:

```ts
export const CONFIG_DEFAULTS: Record<string, number> = {
  pointsPerDollar: 100,
  earnPointsPerDollar: 10,
};

export async function getConfigNumber(prisma: PrismaClient, key: string, fallback: number): Promise<number> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
```

In `src/app.ts` `PUT /api/config`, add validation at the top of the handler:

```ts
const { key, value } = req.body || {};
if (!(key in CONFIG_DEFAULTS)) {
  return res.status(400).json({ error: `Unknown config key. Allowed: ${Object.keys(CONFIG_DEFAULTS).join(', ')}` });
}
const num = Number(value);
if (!Number.isFinite(num) || num <= 0) {
  return res.status(400).json({ error: 'value must be a number greater than 0' });
}
```

In `POST /api/orders`, replace the two constants from Task 4 with:

```ts
const POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'pointsPerDollar', CONFIG_DEFAULTS.pointsPerDollar);
const EARN_POINTS_PER_DOLLAR = await getConfigNumber(prisma, 'earnPointsPerDollar', CONFIG_DEFAULTS.earnPointsPerDollar);
```

Import: `import { settleOrderPoints, getConfigNumber, CONFIG_DEFAULTS } from './loyalty';`

- [ ] **Step 4: Run tests** — `npm test`. Expected: PASS.
- [ ] **Step 5: Manager UI** — in `ManagerDashboard.tsx` loyalty tab, add state + card. State (top of component):

```tsx
const [rates, setRates] = useState({ pointsPerDollar: '100', earnPointsPerDollar: '10' });
const [rateMsg, setRateMsg] = useState('');
```

In `fetchDashboardData`, also fetch config and hydrate:

```ts
const cfgRes = await fetch('http://localhost:4000/api/config');
if (cfgRes.ok) {
  const rows: { key: string; value: string }[] = await cfgRes.json();
  setRates(prev => ({
    ...prev,
    ...Object.fromEntries(rows.filter(r => r.key in prev).map(r => [r.key, r.value])),
  }));
}
```

Save handler:

```tsx
const handleSaveRates = async () => {
  try {
    for (const [key, value] of Object.entries(rates)) {
      const res = await fetch('http://localhost:4000/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': managerPin },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) { setRateMsg('Save failed. Values must be numbers above 0.'); return; }
    }
    setRateMsg('Rates saved.');
  } catch { setRateMsg('Save failed. Is the API running?'); }
};
```

Card JSX (add inside the loyalty tab grid, as a third card):

```tsx
<div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 lg:col-span-2">
  <h3 className="text-lg font-bold text-gray-800 mb-4">Loyalty Rates</h3>
  <div className="flex flex-wrap items-end gap-4">
    <label className="text-sm font-bold text-gray-600">
      Points for a $1 discount
      <input type="number" min={1} value={rates.pointsPerDollar}
        onChange={e => setRates({ ...rates, pointsPerDollar: e.target.value })}
        className="block mt-1 w-32 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 outline-none font-bold" />
    </label>
    <label className="text-sm font-bold text-gray-600">
      Points earned per $1 spent
      <input type="number" min={1} value={rates.earnPointsPerDollar}
        onChange={e => setRates({ ...rates, earnPointsPerDollar: e.target.value })}
        className="block mt-1 w-32 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 outline-none font-bold" />
    </label>
    <button onClick={handleSaveRates}
      className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Save Rates</button>
    {rateMsg && <span className="text-sm font-bold text-gray-500">{rateMsg}</span>}
  </div>
</div>
```

- [ ] **Step 6: Verify** — `cd apps/staff && npm run build && npm run lint`. Expected: pass.
- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/loyalty.ts apps/api/tests/config.test.ts apps/staff/src/components/ManagerDashboard.tsx
git commit -m "feat(loyalty): configurable point rates with manager UI and validated config API"
```

---

### Task 7: M2 — points amount chooser at checkout (replaces all-or-nothing toggle)

**Files:**
- Modify: `apps/menu/src/components/CheckoutModal.tsx`
- Modify: `apps/api/src/app.ts` (drop legacy `usePoints`)
- Modify: `apps/api/tests/loyalty.test.ts` (only if it still references `usePoints` — Task 4's version already uses `pointsToUse`, so normally no change)

**Interfaces:**
- Consumes: `POST /api/orders` `pointsToUse` (Task 4), `GET /api/config` `pointsPerDollar` (Task 6).
- Produces: checkout sends `pointsToUse: number` (integer). Legacy `usePoints` boolean removed from the API.

- [ ] **Step 1: Remove the legacy branch in `src/app.ts`** — delete the `else if (usePoints) { ... }` branch and the `usePoints` destructuring, leaving `pointsToUse` as the only input.
- [ ] **Step 2: Run API tests** — `npm test`. Expected: PASS.
- [ ] **Step 3: Rework CheckoutModal** — in `apps/menu/src/components/CheckoutModal.tsx`:

Replace `const [usePoints, setUsePoints] = useState(false);` with:

```tsx
const [pointsToUse, setPointsToUse] = useState(0);
const [pointsPerDollar, setPointsPerDollar] = useState(100);
```

In the reset effect (`if (!isOpen)`), replace `setUsePoints(false);` with `setPointsToUse(0);`.

In `fetchData`, add a third fetch to the `Promise.all`:

```ts
fetch('http://localhost:4000/api/config')
```

and after it resolves:

```ts
if (cfgRes.ok) {
  const rows: { key: string; value: string }[] = await cfgRes.json();
  const rate = Number(rows.find(r => r.key === 'pointsPerDollar')?.value);
  if (Number.isFinite(rate) && rate > 0) setPointsPerDollar(rate);
}
```

Replace the discount math (lines ~131-134) with:

```tsx
const deliveryFee = orderType === 'delivery' ? 1.00 : 0;
const maxUsablePoints = userProfile
  ? Math.min(userProfile.loyaltyPoints, Math.floor((total + deliveryFee) * pointsPerDollar))
  : 0;
const discountApplied = pointsToUse / pointsPerDollar;
const finalTotal = Math.max(0, total + deliveryFee - discountApplied);
```

Replace the whole points toggle block (the `userProfile.loyaltyPoints > 0` card with the checkbox) with a slider + number input:

```tsx
{userProfile && userProfile.loyaltyPoints > 0 && (
  <div className={`rounded-2xl p-4 border transition-all ${
    pointsToUse > 0 ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-tg-secondary-bg border-tg-hint/15'
  }`}>
    <div className="font-bold text-tg-text flex items-center gap-2 mb-1">
      <Coins size={20} weight="fill" className={pointsToUse > 0 ? 'text-brand-primary' : 'text-tg-hint'} />
      {userProfile.loyaltyPoints} {t('pointsAvailable', 'Points Available')}
    </div>
    <p className="text-xs text-tg-hint mb-3">
      {t('choosePoints', 'Choose how many points to use. {{rate}} points = $1 off.', { rate: pointsPerDollar })}
    </p>
    <div className="flex items-center gap-3">
      <input
        type="range" min={0} max={maxUsablePoints} step={1} value={pointsToUse}
        onChange={e => setPointsToUse(Number(e.target.value))}
        className="flex-1 accent-brand-primary"
        aria-label="Points to use"
      />
      <input
        type="number" min={0} max={maxUsablePoints} value={pointsToUse}
        onChange={e => {
          const v = Math.floor(Number(e.target.value) || 0);
          setPointsToUse(Math.max(0, Math.min(v, maxUsablePoints)));
        }}
        className="w-20 bg-tg-bg border border-tg-hint/20 rounded-lg px-2 py-1 text-sm font-bold text-center text-tg-text"
        aria-label="Points to use (number)"
      />
    </div>
    <div className="text-xs font-bold text-brand-primary mt-2">
      -{formatCurrency(discountApplied)} {t('discount', 'discount')}
    </div>
  </div>
)}
```

In `handleConfirm`'s body, replace `usePoints` with `pointsToUse`. Also remove `totalAmount: total + deliveryFee,` from the body (server computes it now — Task 5).

- [ ] **Step 4: Fold in the LOW fixes for this file:**
  - Line ~88 `} catch(e) {}` → `} catch {}` (unused variable lint).
  - Geolocation error `alert("Failed to get location.")` → `setError('Could not get your location. Please drag the pin on the map.');`
- [ ] **Step 5: Verify** — `cd apps/menu && npm run build && npm run lint`. Expected: build passes, both previous warnings for this file gone.
- [ ] **Step 6: Commit**

```bash
git add apps/menu/src/components/CheckoutModal.tsx apps/api/src/app.ts
git commit -m "feat(checkout): let customers choose exact points to redeem with a slider"
```

---

### Task 8: H4 — working reward catalog management (add / deactivate)

**Files:**
- Modify: `apps/api/src/app.ts` (`GET /api/rewards` `includeInactive`, `POST /api/rewards` validation)
- Create: `apps/api/tests/rewards.test.ts`
- Modify: `apps/staff/src/components/ManagerDashboard.tsx`

**Interfaces:**
- Consumes: `requireManager` (Task 2), `managerPin` prop (Task 2).
- Produces:
  - `GET /api/rewards` → active only (customer view); `GET /api/rewards?includeInactive=1` → all (manager view).
  - `POST /api/rewards` validates `{ name: non-empty string, pointsCost: integer > 0, description?, image? }` → 400 otherwise.
  - Manager UI: add-reward form (name, description, points cost) and an Activate/Deactivate toggle per reward (soft delete via `PUT /api/rewards/:id { isActive }`). No `alert()` calls — inline status text.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/rewards.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
const auth = (r: request.Test) => r.set('x-manager-pin', '9999');

beforeAll(() => { process.env.MANAGER_PIN = '9999'; });

describe('rewards API', () => {
  it('rejects a reward without a name', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ pointsCost: 100 });
    expect(res.status).toBe(400);
  });
  it('rejects non-positive pointsCost', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ name: 'Free Tea', pointsCost: 0 });
    expect(res.status).toBe(400);
  });
  it('creates, hides on deactivate, and still shows to managers', async () => {
    const created = await auth(request(app).post('/api/rewards')).send({ name: 'Free Milk Tea', pointsCost: 500 });
    expect(created.status).toBe(200);
    const id = created.body.id;

    await auth(request(app).put(`/api/rewards/${id}`)).send({ isActive: false });

    const publicList = await request(app).get('/api/rewards');
    expect(publicList.body.find((r: any) => r.id === id)).toBeUndefined();

    const managerList = await request(app).get('/api/rewards?includeInactive=1');
    expect(managerList.body.find((r: any) => r.id === id)?.isActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (no validation; inactive rewards never listed).
- [ ] **Step 3: Implement in `src/app.ts`:**

`GET /api/rewards`:

```ts
const where = req.query.includeInactive === '1' ? {} : { isActive: true };
const rewards = await prisma.reward.findMany({ where, orderBy: { pointsCost: 'asc' } });
```

`POST /api/rewards` — replace `data: req.body` with validated fields:

```ts
const { name, description, pointsCost, image } = req.body || {};
if (typeof name !== 'string' || !name.trim() || !Number.isInteger(pointsCost) || pointsCost <= 0) {
  return res.status(400).json({ error: 'name (text) and pointsCost (whole number above 0) are required' });
}
const reward = await prisma.reward.create({
  data: { name: name.trim(), description: description || null, pointsCost, image: image || null }
});
```

- [ ] **Step 4: Run tests** — `npm test`. Expected: PASS.
- [ ] **Step 5: Manager UI** — in `ManagerDashboard.tsx`:

Fetch all rewards in `fetchDashboardData`: change the rewards URL to `'http://localhost:4000/api/rewards?includeInactive=1'`.

Add state:

```tsx
const [newReward, setNewReward] = useState({ name: '', description: '', pointsCost: '' });
const [showAddForm, setShowAddForm] = useState(false);
const [rewardMsg, setRewardMsg] = useState('');
```

Handlers (replace both `alert()` calls in the file with `setRewardMsg(...)` / existing `setRateMsg`):

```tsx
const handleAddReward = async () => {
  const pointsCost = Math.floor(Number(newReward.pointsCost));
  if (!newReward.name.trim() || !Number.isInteger(pointsCost) || pointsCost <= 0) {
    setRewardMsg('Please enter a name and a points cost above 0.');
    return;
  }
  try {
    const res = await fetch('http://localhost:4000/api/rewards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manager-pin': managerPin },
      body: JSON.stringify({ name: newReward.name.trim(), description: newReward.description.trim() || undefined, pointsCost }),
    });
    if (!res.ok) { setRewardMsg('Could not save the reward.'); return; }
    setNewReward({ name: '', description: '', pointsCost: '' });
    setShowAddForm(false);
    setRewardMsg('Reward added.');
    fetchDashboardData();
  } catch { setRewardMsg('Could not reach the API.'); }
};

const handleToggleReward = async (reward: any) => {
  try {
    const res = await fetch(`http://localhost:4000/api/rewards/${reward.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-manager-pin': managerPin },
      body: JSON.stringify({ isActive: !reward.isActive }),
    });
    if (res.ok) fetchDashboardData();
    else setRewardMsg('Could not update the reward.');
  } catch { setRewardMsg('Could not reach the API.'); }
};
```

Reward card JSX — wire the "Add Reward" button to `onClick={() => setShowAddForm(!showAddForm)}`, render the form when `showAddForm`:

```tsx
{showAddForm && (
  <div className="mb-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex flex-col gap-2">
    <input placeholder="Reward name (e.g. Free Milk Tea)" value={newReward.name}
      onChange={e => setNewReward({ ...newReward, name: e.target.value })}
      className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
    <input placeholder="Description (optional)" value={newReward.description}
      onChange={e => setNewReward({ ...newReward, description: e.target.value })}
      className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
    <div className="flex gap-2">
      <input type="number" min={1} placeholder="Points cost" value={newReward.pointsCost}
        onChange={e => setNewReward({ ...newReward, pointsCost: e.target.value })}
        className="w-32 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none" />
      <button onClick={handleAddReward}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Save Reward</button>
    </div>
  </div>
)}
{rewardMsg && <div className="mb-3 text-sm font-bold text-gray-500">{rewardMsg}</div>}
```

Replace the dead "Remove" button in the reward list with:

```tsx
<button onClick={() => handleToggleReward(reward)}
  className={`font-bold text-xs px-3 py-1.5 rounded-lg ${reward.isActive
    ? 'text-red-600 bg-red-50 hover:bg-red-100'
    : 'text-green-700 bg-green-50 hover:bg-green-100'}`}>
  {reward.isActive ? 'Deactivate' : 'Activate'}
</button>
```

And show a dim style + "(inactive)" label on inactive rows:

```tsx
<div className={`font-bold ${reward.isActive ? 'text-gray-800' : 'text-gray-400'}`}>
  {reward.name}{!reward.isActive && ' (inactive)'}
</div>
```

- [ ] **Step 6: Verify** — `cd apps/staff && npm run build && npm run lint`. Expected: pass, zero `alert(` left in the file (`grep -c "alert(" src/components/ManagerDashboard.tsx` → 0).
- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/rewards.test.ts apps/staff/src/components/ManagerDashboard.tsx
git commit -m "feat(manager): working reward catalog - validated create and activate/deactivate"
```

---

### Task 9: H3 — Telegram Login Widget callback + browser session

**Files:**
- Create: `apps/api/src/telegram-auth.ts`
- Modify: `apps/api/src/app.ts` (callback route)
- Create: `apps/api/tests/telegram-auth.test.ts`
- Create: `apps/menu/src/utils/telegramUser.ts`
- Modify: `apps/menu/src/main.tsx` (capture hash on boot)
- Modify: `apps/menu/src/App.tsx` (gate check)
- Modify: `apps/menu/src/components/AccountView.tsx`, `apps/menu/src/components/CheckoutModal.tsx`, `apps/menu/src/components/OrdersView.tsx` (use the shared helper)

**Interfaces:**
- Consumes: `WEBAPP_URL`, `TELEGRAM_BOT_TOKEN` env vars; User model.
- Produces:
  - `verifyTelegramLogin(data: Record<string, string>, botToken: string): boolean` — Telegram Login Widget HMAC check (secret = SHA256(botToken), timing-safe compare).
  - `GET /api/auth/telegram/callback?...&hash=` — verifies, rejects logins older than 24h, upserts the user, redirects to `WEBAPP_URL` (fallback `http://localhost:5173`) with `#tg_id=<telegramUserId>`.
  - `getTelegramUserId(): string | null` and `captureWebLoginFromHash(): void` in `apps/menu/src/utils/telegramUser.ts` — the ONE way frontends resolve the current user id (initData first, then localStorage key `tg_web_user_id`).
- **Known limitation (document, don't fix here):** the localStorage id is client-trusted, same trust level as the existing unverified `initDataUnsafe` usage. Real signed sessions are future work.

- [ ] **Step 1: Write failing tests** — `apps/api/tests/telegram-auth.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { verifyTelegramLogin } from '../src/telegram-auth';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-123';

function signLogin(fields: Record<string, string>, botToken: string) {
  const checkString = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

beforeAll(() => { process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN; });

describe('verifyTelegramLogin', () => {
  const fields = { id: '42', first_name: 'Test', auth_date: String(Math.floor(Date.now() / 1000)) };

  it('accepts a correctly signed payload', () => {
    expect(verifyTelegramLogin(signLogin(fields, BOT_TOKEN), BOT_TOKEN)).toBe(true);
  });
  it('rejects a tampered payload', () => {
    const signed = signLogin(fields, BOT_TOKEN);
    expect(verifyTelegramLogin({ ...signed, id: '43' }, BOT_TOKEN)).toBe(false);
  });
  it('rejects a missing hash', () => {
    expect(verifyTelegramLogin(fields as any, BOT_TOKEN)).toBe(false);
  });
});

describe('GET /api/auth/telegram/callback', () => {
  it('redirects with tg_id on valid login', async () => {
    const signed = signLogin(
      { id: '4242', first_name: 'Web', auth_date: String(Math.floor(Date.now() / 1000)) },
      BOT_TOKEN
    );
    const res = await request(app).get('/api/auth/telegram/callback').query(signed);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('#tg_id=4242');
  });
  it('rejects an invalid hash', async () => {
    const res = await request(app).get('/api/auth/telegram/callback')
      .query({ id: '1', auth_date: String(Math.floor(Date.now() / 1000)), hash: 'bad' });
    expect(res.status).toBe(401);
  });
  it('rejects an expired login', async () => {
    const signed = signLogin({ id: '1', auth_date: '1000000' }, BOT_TOKEN); // 2001
    const res = await request(app).get('/api/auth/telegram/callback').query(signed);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`. Expected: FAIL (module missing, route 404).
- [ ] **Step 3: Create `src/telegram-auth.ts`:**

```ts
import crypto from 'crypto';

const MAX_LOGIN_AGE_SECONDS = 24 * 60 * 60;

/** Verify a Telegram Login Widget payload (https://core.telegram.org/widgets/login). */
export function verifyTelegramLogin(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...fields } = data;
  if (!hash || typeof hash !== 'string') return false;

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export function isLoginFresh(authDate: string | undefined): boolean {
  const ts = Number(authDate);
  return Number.isFinite(ts) && Date.now() / 1000 - ts <= MAX_LOGIN_AGE_SECONDS;
}
```

- [ ] **Step 4: Add the callback route to `src/app.ts`:**

```ts
import { verifyTelegramLogin, isLoginFresh } from './telegram-auth';

app.get('/api/auth/telegram/callback', async (req, res) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return res.status(503).json({ error: 'Telegram login is not configured on this server' });

    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') params[k] = v;
    }
    if (!verifyTelegramLogin(params, token)) {
      return res.status(401).json({ error: 'Invalid Telegram login data' });
    }
    if (!isLoginFresh(params.auth_date)) {
      return res.status(401).json({ error: 'Login expired, please try again' });
    }

    const user = await prisma.user.upsert({
      where: { telegramUserId: params.id },
      update: {
        username: params.username || undefined,
        firstName: params.first_name || undefined,
        lastName: params.last_name || undefined,
      },
      create: {
        telegramUserId: params.id,
        username: params.username || null,
        firstName: params.first_name || null,
        lastName: params.last_name || null,
      },
    });

    const target = process.env.WEBAPP_URL || 'http://localhost:5173';
    res.redirect(`${target}#tg_id=${encodeURIComponent(user.telegramUserId)}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});
```

- [ ] **Step 5: Run tests** — `npm test`. Expected: PASS.
- [ ] **Step 6: Create `apps/menu/src/utils/telegramUser.ts`:**

```ts
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};

const STORAGE_KEY = 'tg_web_user_id';

/** Store the id from the login redirect (#tg_id=...) and clean the URL. */
export function captureWebLoginFromHash(): void {
  const match = window.location.hash.match(/tg_id=([^&]+)/);
  if (match) {
    localStorage.setItem(STORAGE_KEY, decodeURIComponent(match[1]));
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** Current user id: Telegram Mini App first, then browser login, else null. */
export function getTelegramUserId(): string | null {
  const fromTelegram = WebApp?.initDataUnsafe?.user?.id?.toString();
  if (fromTelegram) return fromTelegram;
  return localStorage.getItem(STORAGE_KEY);
}
```

- [ ] **Step 7: Wire the menu app:**
  - `main.tsx`: `import { captureWebLoginFromHash } from './utils/telegramUser';` and call `captureWebLoginFromHash();` before `createRoot(...)`.
  - `App.tsx` gate (line ~282-286):

```tsx
const isTelegramWebApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;

if (!isTelegramWebApp && !getTelegramUserId() && import.meta.env.PROD) {
  return <WebLogin />;
}
```

  - In `AccountView.tsx`, `CheckoutModal.tsx`, `OrdersView.tsx`: replace every `WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id'` with `getTelegramUserId() || 'test-user-id'` and add `import { getTelegramUserId } from '../utils/telegramUser';`.

- [ ] **Step 8: Verify** — `cd apps/menu && npm run build && npm run lint`. Expected: pass.
- [ ] **Step 9: Commit**

```bash
git add apps/api/src/telegram-auth.ts apps/api/src/app.ts apps/api/tests/telegram-auth.test.ts apps/menu/src/utils/telegramUser.ts apps/menu/src/main.tsx apps/menu/src/App.tsx apps/menu/src/components/AccountView.tsx apps/menu/src/components/CheckoutModal.tsx apps/menu/src/components/OrdersView.tsx
git commit -m "feat(auth): verified telegram login widget callback with browser session"
```

---

### Task 10: Final validation, changelog, smoke test

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: green builds/lints/tests everywhere, updated changelog, manual smoke evidence.

- [ ] **Step 1: Full check suite:**

```bash
cd apps/api && npm test && npx tsc --noEmit
cd ../menu && npm run build && npm run lint
cd ../staff && npm run build && npm run lint
```

Expected: all pass; the only remaining oxlint warning is the pre-existing `exhaustive-deps` note in `apps/menu/src/App.tsx` (out of scope).

- [ ] **Step 2: Runtime smoke test** — start `npx tsx src/index.ts` in `apps/api`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/users/nobody"            # expect 404
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:4000/api/config \
  -H 'Content-Type: application/json' -d '{"key":"pointsPerDollar","value":"100"}'            # expect 401 (no pin)
curl -s -o /dev/null -w "%{http_code}\n" -X PUT http://localhost:4000/api/users/x/points \
  -H 'Content-Type: application/json' -H 'x-manager-pin: 9999' -d '{"points":-5}'             # expect 400
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/auth/telegram/callback"   # expect 503 (no token) or 401
```

Stop the server afterwards. Clean up any rows created by manual smoke testing.

- [ ] **Step 3: Update `CHANGELOG.md`** — add under `[Unreleased]` (create the section if missing):

```markdown
## [Unreleased]
### Fixed
- Staff and Manager PINs are now checked by the server; admin API routes require the manager PIN.
- Loyalty points now move only when an order is paid (ABA webhook) or completed (cash) — never for abandoned orders.
- Order totals are calculated on the server from the real menu prices; client prices are ignored.
- Account tab loads correctly (was calling a missing endpoint).
- Telegram Login Widget now works: the server verifies the login and signs the user in for browser use.
- Manager reward catalog: add and activate/deactivate rewards actually work.
- Loyalty point rates are configurable by managers (points per $1 discount, points earned per $1).
- Checkout lets customers choose exactly how many points to spend.
```

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for prd v2 review fixes"
```

---

## Out of scope (noted, not planned)

- **M3** — real ABA PayWay sandbox credentials: user fills `apps/api/.env` (`.env.example` already prepared).
- Signed browser sessions / server-side `initData` validation (documented limitation in Task 9).
- Auth on staff order-status and sold-out routes (pre-existing, not part of the reviewed diff).
- The pre-existing `exhaustive-deps` lint warning in `apps/menu/src/App.tsx:143`.
