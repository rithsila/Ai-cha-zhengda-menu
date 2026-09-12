# Menu Item Card Image Style Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow store managers to choose between Option A (Transparent / Contain on clean white card) and Option B (Edge-to-Edge / Cover photo) in the Staff Portal Store Settings, which automatically updates customer menu item cards.

**Architecture:** Store setting `menuCardImageFit` ('contain' | 'cover') is persisted in `SystemConfig` table via `/api/config`. Staff portal displays a visual selector in Store Settings. Customer menu reads `menuCardImageFit` via `useConfig()` and switches `MenuItemCard` styling accordingly.

**Tech Stack:** TypeScript, React, Vite, Express, Prisma (SQLite), Tailwind CSS, Vitest, Testing Library.

## Global Constraints
- Supported values: `'contain'` (Option A) and `'cover'` (Option B). Default: `'contain'`.
- Option A: No gray box (`bg-tg-hint/10` replaced with clean white `bg-white` or `bg-transparent`), `object-contain p-2`.
- Option B: Edge-to-edge `object-cover`, no padding (`p-0`), overflow-hidden.
- Maintain all existing tests passing.

---

### Task 1: API Configuration Key & Validation

**Files:**
- Modify: `apps/api/src/store-config.ts`
- Test: `apps/api/tests/store-config.test.ts`

- [ ] **Step 1: Add failing test for `menuCardImageFit` validation**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Add `menuCardImageFit` to `CONFIG_DEFAULTS` and `validateConfig`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 2: Staff Portal Store Settings UI

**Files:**
- Modify: `apps/staff/src/components/StoreSettings.tsx`
- Test: `apps/staff/src/components/StoreSettings.test.tsx`

- [ ] **Step 1: Add failing test in StoreSettings.test.tsx for image fit setting**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Update `StoreConfigState`, `fetchConfig`, `getStoreConfigChanges`, and render selector in `StoreSettings.tsx`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 3: Customer Menu Card Dynamic Style

**Files:**
- Modify: `apps/menu/src/App.tsx`
- Modify: `apps/menu/src/components/MenuItemCard.tsx`
- Modify: `apps/menu/src/components/ItemPreviewModal.tsx`
- Test: `apps/menu/src/MenuItemCard.test.tsx`

- [ ] **Step 1: Write test verifying MenuItemCard renders contain vs cover classes**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Update `MenuItemCard.tsx`, `ItemPreviewModal.tsx`, and `App.tsx` to apply dynamic `imageFit`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full test suite across all 3 apps**
