# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Telegram Mini App for the dual-brand **Ai-Cha** (drinks/ice cream) and **Zhengda** (chicken steak) shop. Customers browse the menu, customize items with modifiers, and check out (KHQR or cash) to get a pickup code. See `PRD.md` for the product spec and phased plan.

## Monorepo layout

npm workspaces (`apps/*`). Two apps exist:

- **`apps/menu`** — Customer-facing Telegram Mini App. React 19 + Vite + Tailwind v4 + `@twa-dev/sdk`.
- **`apps/api`** — Backend. Express 5 + Prisma + SQLite + Telegraf (Telegram bot).

- **`apps/staff`** — Staff tablet dashboard (React + Vite, dev port 5174). Live orders (5s poll, status lifecycle pending → preparing → ready → completed) and Menu Management (sold-out toggles).

## Commands

Run `npm install` once from the root (installs all workspaces).

**Menu (`apps/menu`):**
```bash
npm run dev      # Vite dev server (default port 5173)
npm run build    # tsc -b && vite build
npm run lint     # oxlint (NOT eslint)
```

**API (`apps/api`):**
```bash
npm run dev      # tsx watch src/index.ts — serves on http://localhost:4000
```
⚠️ `ts-node` is broken in this repo (installed `typescript@^7` is incompatible) — use `tsx` for any script execution.

**Database (`apps/api`, Prisma + SQLite):**
```bash
npx prisma generate
npx prisma db push          # sync schema to dev.db
npx tsx src/seed.ts         # seed menu data (wipes orders + catalog, keeps User rows)
```

**Root** `npm run dev` / `build` / `start` fan out to workspaces with `--if-present`.

## Environment

Create `apps/api/.env`:
```env
DATABASE_URL="file:./dev.db"
TELEGRAM_BOT_TOKEN="..."     # optional; bot is skipped with a warning if unset
WEBAPP_URL="https://..."     # public URL where apps/menu is hosted (for the bot's Open Menu button)
```

## Architecture notes (the non-obvious parts)

- **The menu is served from static local data; the DB catalog must mirror it.** `apps/menu/src/App.tsx` renders from `src/data/catalog.ts` (hardcoded `CATALOG`) and only uses `GET /api/catalog` for sold-out overrides, keyed by item id. `apps/api/src/catalog-data.ts` is a copy of `catalog.ts` (see its keep-in-sync header) consumed by `seed.ts`, which seeds `MenuItem` rows with the **same ids** (`a1`…, `z1`…) — `OrderItem.menuItemId` is an FK to those ids, so checkout breaks if they drift. Any menu change must touch `catalog.ts` + `catalog-data.ts` and be followed by a reseed.
- **The API base URL comes from `apps/menu/src/utils/api.ts`** (`API_BASE`, from `VITE_API_URL`, defaulting to `http://localhost:4000`). Every `fetch` in `apps/menu` goes through it — `App.tsx`, `CheckoutModal.tsx`, `OrdersView.tsx`, `AccountView.tsx`. Never hardcode the host in a component. `apps/staff/src/lib/api.ts` exports its own `API_BASE` the same way; both apps read `VITE_API_URL`.
- **ABA PayWay is real, not a mock.** Three routes in `apps/api/src/app.ts`:
  `POST /api/payment/aba/create`, `GET /api/payment/aba/status/:orderId`, and
  `POST /api/payment/aba/webhook`. All three return **503** when `ABA_MERCHANT_ID` /
  `ABA_API_KEY` are unset — the server never substitutes fake credentials, because that
  turns a config mistake into an unreadable "wrong hash" error. Two rules that are easy to
  break: the purchase request must send `payment_option=abapay_khqr` or ABA returns no QR
  data at all, and the webhook is **strict** — no secret means 503, a bad signature means
  401, and even a valid webhook is re-confirmed with `checkStatus` and an amount check
  before an order is marked paid. The checkout screen polls the **status** route, not the
  order row, because ABA's webhook cannot reach `localhost`. See
  `packages/aba-payway-sdk-unofficial/docs/ABA_KHQR_INTEGRATION.md`.
- **Telegram integration** goes through `@twa-dev/sdk` (imported defensively as `WebApp` in `App.tsx`/`main.tsx`). The app drives the Telegram `MainButton` for the cart and uses `HapticFeedback`; it falls back to an in-page floating cart button when the SDK is unavailable (e.g. plain browser).
- **Theming = Telegram sync.** `apps/menu/src/index.css` uses Tailwind v4 `@theme` to map `--color-tg-*` tokens onto Telegram's `--tg-theme-*` CSS variables, so colors follow the user's Telegram theme. Use the `tg-*` (e.g. `bg-tg-bg`, `text-tg-hint`) and `brand-*` utility classes rather than hardcoding colors.
- **i18n** (`src/i18n/config.ts`) has three languages inline: `en`, `km` (Khmer), `zh`. The header language button cycles through them.
- **Prisma models** (`apps/api/prisma/schema.prisma`): `MenuItem → ModifierGroup → ModifierOption`, and `Order → OrderItem`. Selected modifiers are stored on `OrderItem.modifiers` as a **JSON string**, not relational rows.

## Conventions

- **Immutable state updates** throughout `App.tsx` (spread/`map`/`filter`, never mutate cart in place) — follow this pattern.
- Cart line identity: each `CartItem` gets a `crypto.randomUUID()` instance id; items with identical modifiers merge via `isSameModifiers` in `App.tsx`.
- Menu UI components live in `apps/menu/src/components/` (feature modals/drawers) and `components/ui/` (reusable primitives).
- `dev.db` is committed to the repo (both `apps/api/dev.db` and `apps/api/prisma/dev.db`).
