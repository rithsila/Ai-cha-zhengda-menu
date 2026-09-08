# Remove Brand Concept & Consolidate Store Branches Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely remove the Brand toggle/concept (`ai-cha` and `zhengda`) from Database, API, Staff Portal, and Customer Menu, relying purely on Store Branches.

**Architecture:**
- Database: Simplify `Category` and `MenuItem` schemas to remove `brand` column requirement.
- API: Remove `brand` parameter requirements from catalog and category endpoints.
- Staff Portal: Remove `Both / Ai-Cha / Zhengda` buttons in Menu Management, Category Modal, and Item Edit Modal.
- Customer Menu: Remove `BrandTabs` header; display all categories together.

**Tech Stack:** TypeScript, Node.js, Express, Prisma, SQLite, React, Tailwind CSS, Vitest.

---

### Task 1: Database Schema & Migration (Prisma)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/seed.ts`
- Modify: `apps/api/src/catalog-data.ts`

- [ ] **Step 1: Update schema.prisma**
  - In `Category`: remove `brand` field and change `@@unique([brand, name])` to `@@unique([name])`.
  - In `MenuItem`: remove `brand` field (or make `brand String? @default("default")` for migration safety).
- [ ] **Step 2: Update seed.ts & catalog-data.ts**
  - Remove brand grouping or simplify to a unified list.
- [ ] **Step 3: Run prisma db push**
  - Apply schema changes to SQLite.

---

### Task 2: Backend API & Tests

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/category-management.test.ts`
- Modify: `apps/api/tests/catalog-management.test.ts`
- Modify: `apps/api/tests/category-db.test.ts`
- Modify: `apps/api/tests/e2e-workflow.test.ts`

- [ ] **Step 1: Update catalog and category endpoints in app.ts**
  - `GET /api/categories`: return all active categories without requiring `brand` query param.
  - `POST /api/categories`: no longer require `brand` in body.
  - `POST /api/catalog`: no longer require `brand` in body.
  - `PUT /api/catalog/:id`: remove brand update requirement.
- [ ] **Step 2: Update and run API test suites**
  - Run `npm test` in `apps/api` to verify all 25 test files pass.

---

### Task 3: Staff Portal UI & Tests

**Files:**
- Modify: `apps/staff/src/components/MenuManagement.tsx`
- Modify: `apps/staff/src/components/CategoryManagementModal.tsx`
- Modify: `apps/staff/src/components/MenuItemEditModal.tsx`
- Modify: `apps/staff/src/components/OrderCard.tsx`
- Modify: `apps/staff/src/components/CategoryManagementModal.test.tsx`
- Modify: `apps/staff/src/components/MenuItemEditModal.test.tsx`

- [ ] **Step 1: Remove Brand toggle from MenuManagement.tsx**
  - Remove `BrandFilter` type and the `<Segmented options={[{ id: 'all', label: 'Both' }, ...]}` component.
- [ ] **Step 2: Remove Brand toggle from CategoryManagementModal.tsx**
  - Remove brand state and the brand selector `<Segmented ... />`. Load all categories together.
- [ ] **Step 3: Remove Brand selector from MenuItemEditModal.tsx**
  - Remove brand radio/segmented buttons and send payload without `brand`.
- [ ] **Step 4: Update OrderCard.tsx**
  - Remove station split `Zhengda` vs `Ai-Cha` on line items.
- [ ] **Step 5: Update and run Staff tests**
  - Run `npm test` in `apps/staff` to verify all tests pass.

---

### Task 4: Customer Menu App UI

**Files:**
- Modify: `apps/menu/src/App.tsx`
- Modify: `apps/menu/src/components/ui/BrandTabs.tsx`

- [ ] **Step 1: Remove BrandTabs from App.tsx**
  - Display unified category scroller directly.
- [ ] **Step 2: Verify Customer App build**
  - Run `npm run build` in `apps/menu`.

---

### Task 5: Final Full-System Verification

- [ ] Run full test suite across apps (`apps/api`, `apps/staff`).
- [ ] Build all web apps (`apps/staff`, `apps/menu`).
