# Category Management (Option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete category management system (Add, Edit, Delete, Reorder) for Ai-Cha and Zhengda across API, Staff Portal, and Customer Menu.

**Architecture:**
- Backend: SQLite `Category` table with Prisma ORM. REST API for category CRUD, reordering, and item sync.
- Staff Portal: Category Management Modal (list, reorder with up/down buttons, inline edit, safe delete) and updated Menu Item modal with a dynamic category dropdown + quick-add.
- Customer App: Category tabs ordered by manager-defined sort order.

**Tech Stack:** TypeScript, Node.js, Express, Prisma, SQLite, React, Vite, Tailwind CSS, Lucide icons, Vitest, Supertest.

**Spec:** Option B Category Management (Dedicated Category Management).

---

## Global Constraints

- Never break existing `MenuItem.category` strings in orders or receipts.
- Categories are scoped per brand (`ai-cha` or `zhengda`).
- Prevent deletion of categories that have active menu items.
- Maintain manager-only authorization (`requireManager`) for create/edit/delete/reorder.

---

### Task 1: Database Model & Seed Migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma:37-52`
- Modify: `apps/api/src/seed.ts:1-50`
- Test: `apps/api/tests/category-db.test.ts`

**Interfaces:**
- Produces: `Category` model in Prisma:
  ```prisma
  model Category {
    id        String   @id @default(uuid())
    brand     String   // "ai-cha" | "zhengda"
    name      String
    sortOrder Int      @default(0)
    isActive  Boolean  @default(true)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    @@unique([brand, name])
  }
  ```

- [ ] **Step 1: Write failing database test**

Create `apps/api/tests/category-db.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db';

describe('Category Database Model', () => {
  beforeEach(async () => {
    await prisma.category.deleteMany();
  });

  it('creates and reads a category with brand and sortOrder', async () => {
    const created = await prisma.category.create({
      data: {
        brand: 'ai-cha',
        name: 'Milk Tea',
        sortOrder: 1,
      },
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Milk Tea');
    expect(created.brand).toBe('ai-cha');
    expect(created.sortOrder).toBe(1);
  });

  it('enforces unique brand and name combination', async () => {
    await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 0 },
    });

    await expect(
      prisma.category.create({
        data: { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 1 },
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && DATABASE_URL=file:./test.db npx vitest run tests/category-db.test.ts`
Expected: FAIL (`prisma.category` is undefined).

- [ ] **Step 3: Update schema.prisma and seed defaults**

Add to `apps/api/prisma/schema.prisma`:
```prisma
model Category {
  id        String   @id @default(uuid())
  brand     String
  name      String
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([brand, name])
}
```

Run push:
```bash
cd apps/api && npx prisma db push
```

Update `apps/api/src/seed.ts` to insert initial categories if table is empty:
- Ai-Cha: `Cones`, `Milk Tea`, `Frappe`, `Fruit Tea`, `Ice Cream`
- Zhengda: `Signature`, `Combos`, `Rice Bowls`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && DATABASE_URL=file:./test.db npx vitest run tests/category-db.test.ts`
Expected: PASS (2 tests pass).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/src/seed.ts apps/api/tests/category-db.test.ts
git commit -m "feat(api): add Category model and initial seed"
```

---

### Task 2: Category API Endpoints & Unit Tests

**Files:**
- Create: `apps/api/tests/category-management.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces:
  - `GET /api/categories`: returns list of categories ordered by `sortOrder ASC`. Optional `?brand=ai-cha|zhengda`.
  - `POST /api/categories`: `{ brand: string, name: string, sortOrder?: number }` (manager only).
  - `PUT /api/categories/:id`: `{ name?: string, sortOrder?: number, isActive?: boolean }` (manager only). Renames `MenuItem.category` if `name` changed.
  - `PUT /api/categories/reorder`: `{ items: Array<{ id: string, sortOrder: number }> }` (manager only).
  - `DELETE /api/categories/:id`: Deletes category (manager only). Fails if any active `MenuItem` is assigned to it.

- [ ] **Step 1: Write failing API unit tests**

Create `apps/api/tests/category-management.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { issueToken } from '../src/auth';

describe('Category Management API', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;
  const staffToken = issueToken('staff').token;

  beforeEach(async () => {
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
  });

  it('allows anyone to list categories sorted by sortOrder', async () => {
    await prisma.category.createMany({
      data: [
        { brand: 'ai-cha', name: 'Fruit Tea', sortOrder: 2 },
        { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 1 },
      ],
    });

    const res = await request(app).get('/api/categories?brand=ai-cha').expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].name).toBe('Milk Tea');
    expect(res.body[1].name).toBe('Fruit Tea');
  });

  it('rejects category creation by non-manager', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ brand: 'ai-cha', name: 'Snacks' })
      .expect(401);
  });

  it('allows manager to create a category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ brand: 'ai-cha', name: 'Smoothies', sortOrder: 5 })
      .expect(201);

    expect(res.body.name).toBe('Smoothies');
    expect(res.body.sortOrder).toBe(5);
  });

  it('renames category and cascades new name to MenuItem records', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Old Tea', sortOrder: 1 },
    });
    const item = await prisma.menuItem.create({
      data: { brand: 'ai-cha', category: 'Old Tea', name: 'Jasmine', basePrice: 1.5 },
    });

    await request(app)
      .put(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'New Tea' })
      .expect(200);

    const updatedItem = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(updatedItem?.category).toBe('New Tea');
  });

  it('reorders categories in batch', async () => {
    const c1 = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Cat 1', sortOrder: 1 },
    });
    const c2 = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Cat 2', sortOrder: 2 },
    });

    await request(app)
      .put('/api/categories/reorder')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        items: [
          { id: c1.id, sortOrder: 10 },
          { id: c2.id, sortOrder: 5 },
        ],
      })
      .expect(200);

    const list = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(list[0].name).toBe('Cat 2');
    expect(list[1].name).toBe('Cat 1');
  });

  it('blocks deletion of a category that still contains menu items', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Desserts', sortOrder: 1 },
    });
    await prisma.menuItem.create({
      data: { brand: 'ai-cha', category: 'Desserts', name: 'Sundae', basePrice: 1.0, isActive: true },
    });

    const res = await request(app)
      .delete(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(400);

    expect(res.body.error).toContain('Cannot delete category');
  });

  it('deletes empty category successfully', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Empty Cat', sortOrder: 1 },
    });

    await request(app)
      .delete(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const check = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(check).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && DATABASE_URL=file:./test.db npx vitest run tests/category-management.test.ts`
Expected: FAIL (404 Not Found on `/api/categories`).

- [ ] **Step 3: Implement category routes in app.ts**

Add routes in `apps/api/src/app.ts`:
- `GET /api/categories`: fetch from `prisma.category` sorted by `sortOrder asc`.
- `POST /api/categories`: validate `name` and `brand`, assign next `sortOrder` if not provided, create record.
- `PUT /api/categories/:id`: update fields; when `name` changes, run `$transaction` updating category and all `menuItem` where `brand` and `category` match.
- `PUT /api/categories/reorder`: loop or `$transaction` updating each item's `sortOrder`.
- `DELETE /api/categories/:id`: count `menuItem` matching `brand` and `category` where `isActive = true`; if > 0 return 400 error; otherwise delete category.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && DATABASE_URL=file:./test.db npx vitest run tests/category-management.test.ts`
Expected: PASS (all 7 tests pass).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/category-management.test.ts
git commit -m "feat(api): add category CRUD, reorder, and cascade rename endpoints"
```

---

### Task 3: Staff Category Management Modal & Menu View Integration

**Files:**
- Create: `apps/staff/src/components/CategoryManagementModal.tsx`
- Modify: `apps/staff/src/components/MenuManagement.tsx`
- Test: `apps/staff/src/components/CategoryManagementModal.test.tsx`

**Interfaces:**
- Props for `CategoryManagementModal`:
  ```typescript
  type CategoryManagementModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onChanged: () => void;
  };
  ```

- [ ] **Step 1: Write test for CategoryManagementModal**

Create `apps/staff/src/components/CategoryManagementModal.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategoryManagementModal } from './CategoryManagementModal';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  authHeaders: vi.fn().mockReturnValue({}),
  API_BASE: '',
}));

describe('CategoryManagementModal', () => {
  it('renders modal with title and add input when open', () => {
    render(<CategoryManagementModal isOpen={true} onClose={() => {}} onChanged={() => {}} />);
    expect(screen.getByText('Manage Categories')).toBeDefined();
    expect(screen.getByPlaceholderText(/New category name/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/staff && npx vitest run src/components/CategoryManagementModal.test.tsx`
Expected: FAIL (`CategoryManagementModal` not found).

- [ ] **Step 3: Implement CategoryManagementModal.tsx**

Build `apps/staff/src/components/CategoryManagementModal.tsx`:
- Brand segmented switch (`Ai-Cha` / `Zhengda`).
- Add Category row: Input + "Add" button.
- Category list with:
  - Drag / Up & Down buttons to reorder categories.
  - Name display with inline "Edit / Save" state.
  - Active item count indicator.
  - Trash icon button to delete (with confirmation and error notification if items exist).
- Close button.

- [ ] **Step 4: Add "Manage Categories" button in MenuManagement.tsx**

In `apps/staff/src/components/MenuManagement.tsx`:
- Add button `<Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>Manage Categories</Button>` next to "Add Item".
- Render `<CategoryManagementModal isOpen={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} onChanged={fetchCatalog} />`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/staff && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/staff/src/components/CategoryManagementModal.tsx apps/staff/src/components/MenuManagement.tsx
git commit -m "feat(staff): add CategoryManagementModal and button in MenuManagement"
```

---

### Task 4: MenuItemEditModal Category Dropdown & Quick Add

**Files:**
- Modify: `apps/staff/src/components/MenuItemEditModal.tsx:484-497`

**Changes:**
- Replace raw `<input type="text">` with:
  1. `CustomSelect` populated with categories fetched for the selected brand.
  2. A "+ New" quick-add button next to the select:
     - Prompts or opens an inline input.
     - Calls `POST /api/categories` to create it.
     - Immediately selects the newly created category in the dropdown.
  3. When changing Brand (`Ai-Cha` <-> `Zhengda`), automatically reload brand categories and set category to the brand's first category.

- [ ] **Step 1: Update MenuItemEditModal.tsx**

Implement dynamic category loading and `CustomSelect` integration with inline quick-add.

- [ ] **Step 2: Run staff tests to verify it passes**

Run: `cd apps/staff && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/staff/src/components/MenuItemEditModal.tsx
git commit -m "feat(staff): replace text input with dynamic category select and quick-add"
```

---

### Task 5: Customer App Category Sorting

**Files:**
- Modify: `apps/menu/src/App.tsx:310-330`

**Changes:**
- In `apps/menu/src/App.tsx`:
  - Fetch `/api/categories` alongside the catalog.
  - Sort category tabs according to `sortOrder` from backend instead of random item scan order.
  - Fallback gracefully if `/api/categories` is offline.

- [ ] **Step 1: Update category sorting logic in App.tsx**

```typescript
// Fetch /api/categories and map order
const categoryOrderMap = useMemo(() => {
  const map = new Map<string, number>();
  categoriesData.forEach((c) => map.set(c.name.toLowerCase(), c.sortOrder));
  return map;
}, [categoriesData]);

// Sort categories by sortOrder
const categories = useMemo(() => {
  const unique = Array.from(new Set(brandItems.map((i) => i.category)));
  unique.sort((a, b) => {
    const orderA = categoryOrderMap.get(a.toLowerCase()) ?? 999;
    const orderB = categoryOrderMap.get(b.toLowerCase()) ?? 999;
    return orderA - orderB;
  });
  return ['All', ...unique];
}, [brandItems, categoryOrderMap]);
```

- [ ] **Step 2: Build customer app to verify TypeScript**

Run: `cd apps/menu && npm run build`
Expected: Build passes with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/menu/src/App.tsx
git commit -m "feat(menu): sort customer category tabs by manager sort order"
```

---

### Task 6: Full Verification & Sanity Check

**Files:**
- All workspace files

- [ ] **Step 1: Run all API test suites**
Run: `cd apps/api && npm test`
Expected: All 24+ test files pass.

- [ ] **Step 2: Run all Staff test suites**
Run: `cd apps/staff && npm test`
Expected: All tests pass.

- [ ] **Step 3: Verify builds for all workspaces**
```bash
cd apps/api && npm run build
cd apps/staff && npm run build
cd apps/menu && npm run build
```
Expected: All 3 builds succeed without errors.
