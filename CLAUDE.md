# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Telegram Mini App for the dual-brand **Ai-Cha** (drinks/ice cream) and **Zhengda** (chicken steak) shop. Customers browse the menu, customize items with modifiers, and check out (KHQR or cash) to get a pickup code. See `PRD.md` for the product spec and phased plan.

## Monorepo layout

npm workspaces (`apps/*`). Two apps exist:

- **`apps/menu`** — Customer-facing Telegram Mini App. React 19 + Vite + Tailwind v4 + `@twa-dev/sdk`.
- **`apps/api`** — Backend. Express 5 + Prisma + SQLite + Telegraf (Telegram bot).

> ⚠️ The README describes an `apps/staff` tablet dashboard, but **it does not exist yet**. Staff features currently live only as API endpoints (`GET /api/orders`, `PUT /api/orders/:id/status`) with no UI.

## Commands

Run `npm install` once from the root (installs all workspaces).

**Menu (`apps/menu`):**
```bash
npm run dev      # Vite dev server (default port 5173)
npm run build    # tsc -b && vite build
npm run lint     # oxlint (NOT eslint)
```

**API (`apps/api`):** ⚠️ Has **no** `dev`/`build`/`start` npm script (only a placeholder `test` that exits 1). Run the server directly:
```bash
cd apps/api
npx ts-node-dev --respawn src/index.ts   # serves on http://localhost:4000
```

**Database (`apps/api`, Prisma + SQLite):**
```bash
npx prisma generate
npx prisma db push          # sync schema to dev.db
npx ts-node src/seed.ts     # seed menu data
```

**Root** `npm run dev` / `build` / `start` fan out to workspaces with `--if-present`. Because the API defines none of those scripts, root `npm run dev` effectively **only starts the menu app** — start the API separately.

## Environment

Create `apps/api/.env`:
```env
DATABASE_URL="file:./dev.db"
TELEGRAM_BOT_TOKEN="..."     # optional; bot is skipped with a warning if unset
WEBAPP_URL="https://..."     # public URL where apps/menu is hosted (for the bot's Open Menu button)
```

## Architecture notes (the non-obvious parts)

- **The menu is served from static local data, not the API.** `apps/menu/src/App.tsx` reads the catalog from `src/data/catalog.ts` (hardcoded `CATALOG` array). The API's `GET /api/catalog` (Prisma-backed) exists but the frontend does **not** call it. Menu changes go in `catalog.ts`; DB seed data goes in `apps/api/src/seed.ts`. Keep both in mind — they can drift.
- **The only frontend→API calls are at checkout.** `apps/menu/src/components/CheckoutModal.tsx` POSTs to `/api/payment/khqr` and `/api/orders`. The API base URL is **hardcoded** to `http://localhost:4000` there (no env/config), so it must be changed for any non-local deploy.
- **KHQR payment is a mock.** `POST /api/payment/khqr` returns a fake QR string; there is no real payment verification. Order totals are trusted from the client (`index.ts` notes this as a known gap).
- **Telegram integration** goes through `@twa-dev/sdk` (imported defensively as `WebApp` in `App.tsx`/`main.tsx`). The app drives the Telegram `MainButton` for the cart and uses `HapticFeedback`; it falls back to an in-page floating cart button when the SDK is unavailable (e.g. plain browser).
- **Theming = Telegram sync.** `apps/menu/src/index.css` uses Tailwind v4 `@theme` to map `--color-tg-*` tokens onto Telegram's `--tg-theme-*` CSS variables, so colors follow the user's Telegram theme. Use the `tg-*` (e.g. `bg-tg-bg`, `text-tg-hint`) and `brand-*` utility classes rather than hardcoding colors.
- **i18n** (`src/i18n/config.ts`) has three languages inline: `en`, `km` (Khmer), `zh`. The header language button cycles through them.
- **Prisma models** (`apps/api/prisma/schema.prisma`): `MenuItem → ModifierGroup → ModifierOption`, and `Order → OrderItem`. Selected modifiers are stored on `OrderItem.modifiers` as a **JSON string**, not relational rows.

## Conventions

- **Immutable state updates** throughout `App.tsx` (spread/`map`/`filter`, never mutate cart in place) — follow this pattern.
- Cart line identity: each `CartItem` gets a `crypto.randomUUID()` instance id; items with identical modifiers merge via `isSameModifiers` in `App.tsx`.
- Menu UI components live in `apps/menu/src/components/` (feature modals/drawers) and `components/ui/` (reusable primitives).
- `dev.db` is committed to the repo (both `apps/api/dev.db` and `apps/api/prisma/dev.db`).
