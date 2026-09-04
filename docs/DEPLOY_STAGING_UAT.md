# Staging / UAT Deployment Guide

How to stand up a **staging environment for UAT testing** that mirrors production but
touches none of it: separate API, separate database, separate Telegram bot, sandbox
payments.

Target hosts:

| App | Staging URL |
| --- | --- |
| Customer menu (`apps/menu`) | `https://staging-menu.aichazhengdaarakawa.com` |
| Staff portal (`apps/staff`) | `https://staging-staff.aichazhengdaarakawa.com` |
| Backend API (`apps/api`) | `https://staging-api.aichazhengdaarakawa.com` |

Everything deploys from the **`staging`** git branch.

---

## Why hyphens, not `staging.menu.…`

Cloudflare's free Universal SSL certificate covers `aichazhengdaarakawa.com` and
`*.aichazhengdaarakawa.com` — **one level of subdomain only**.

`staging.menu.aichazhengdaarakawa.com` is two levels deep, so it has no valid
certificate and every browser fails the TLS handshake before the page loads.
Covering it needs Cloudflare **Advanced Certificate Manager** (~$10/month).

`staging-menu.aichazhengdaarakawa.com` is a single label and is covered for free.
Use the hyphen form.

---

## Architecture: production vs staging

| Piece | Production (live today) | Staging (this guide) |
| --- | --- | --- |
| Menu frontend | Worker `ai-cha-zhengda-menu` → `menu.…` | Worker `ai-cha-zhengda-menu-staging` |
| Staff frontend | Worker `ai-cha-zhengda-staff` → `staff.…` | Worker `ai-cha-zhengda-staff-staging` |
| API | Railway `ai-cha-zhengda-menu-production.up.railway.app` | Railway **`staging` environment**, same project |
| Database | SQLite on Railway volume `/data/production.db` | SQLite on its **own** volume `/data/staging.db` |
| Git branch | `main` | `staging` |
| Telegram bot | production bot | **separate staging bot** |
| ABA PayWay | production endpoint | sandbox endpoint |

> Note: `api.aichazhengdaarakawa.com` was added to the production Railway service on
> 2026-09-02 (CNAME → `gi2a57ze.up.railway.app`, DNS only, Let's Encrypt cert valid to
> 2026-12-01). The deployed frontend bundles still call the raw `*.up.railway.app`
> host until they are rebuilt with `VITE_API_URL` pointing at the new name.

---

## Phase 0 — What must be true before you start

- You can log in to Cloudflare (DNS + Pages) for `aichazhengdaarakawa.com`.
- You can log in to Railway and see the existing project.
- The `staging` branch is pushed to `origin`.
- Your ABA PayWay **sandbox** merchant ID and API key are on hand.
- Your Plasgate SMS keys are on hand (staging sends real OTP texts).

No code changes are required. CORS already accepts any
`*.aichazhengdaarakawa.com` origin (`apps/api/src/app.ts:64`), and every frontend
API call already routes through `VITE_API_URL`.

---

## Phase 1 — Create the staging Telegram bot

**This step is mandatory. Do not reuse the production bot token.**

The API runs the bot with long polling (`bot.launch()`, `apps/api/src/bot.ts:155`).
Two servers polling the same token fight each other — Telegram answers with HTTP 409
and drops updates at random. Pointing staging at the production token **would break
the live bot for real customers.**

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Name: `Aicha ZhengDa Arakawa`.
3. Username: `AichaArakawastaging_bot` (must end in `bot`).
4. Copy the token — this is `TELEGRAM_BOT_TOKEN` for staging.

Leave the domain and menu button for **Phase 6**, once the URLs exist.

---

## Phase 2 — Railway: create the staging API environment

1. Open the existing Railway project.
2. Click the **environment selector** (top left, currently `production`) →
   **New Environment**.
3. Choose **Duplicate `production`** — this copies the service definition and
   variables, but **not** volume data, so staging starts with an empty database.
   Name it `staging`.
4. Switch into the `staging` environment and select the API service.
5. **Settings → Source →** change the deployment branch from `main` to **`staging`**.
6. **Volumes →** confirm a volume is mounted at `/data`. If the duplicate did not
   create one, add one with mount path `/data`.
7. **Variables → Raw Editor →** replace the copied production values with:

```env
DATABASE_URL="file:/data/staging.db"
PORT="4000"
NODE_ENV="production"

# Staging bot from Phase 1 — NOT the production token
TELEGRAM_BOT_TOKEN="your_staging_bot_token"

WEBAPP_URL="https://staging-menu.aichazhengdaarakawa.com"
STAFF_APP_URL="https://staging-staff.aichazhengdaarakawa.com"
CORS_ORIGINS="https://staging-menu.aichazhengdaarakawa.com,https://staging-staff.aichazhengdaarakawa.com"

# Whoever is doing UAT needs their Telegram user id here
MANAGER_TELEGRAM_IDS="your_telegram_user_id"
STAFF_TELEGRAM_IDS=""

# Staff/manager phone OTP login
ADMIN_PHONE_NUMBERS="+85589433443,089433443"
PLASGATE_PRIVATE_KEY="your_plasgate_private_key"
PLASGATE_SECRET_KEY="your_plasgate_secret_key"
PLASGATE_SENDER_NAME="SMS Info"

# ABA PayWay — SANDBOX only on staging
ABA_MERCHANT_ID="your_sandbox_merchant_id"
ABA_API_KEY="your_sandbox_api_key"
ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"

# Cloudflare R2 — use a SEPARATE bucket so test uploads never reach production
R2_ACCOUNT_ID="your_r2_account_id"
R2_ACCESS_KEY_ID="your_r2_access_key"
R2_SECRET_ACCESS_KEY="your_r2_secret_key"
R2_BUCKET_NAME="aicha-menu-images-staging"
R2_PUBLIC_URL="https://pub-xxxx.r2.dev"
```

**Never set `ALLOW_UNVERIFIED_TELEGRAM` here.** It makes the API trust a plain
`X-Telegram-User-Id` header, letting any caller act as any customer. It is present in
local `apps/api/.env` for development only.

8. Deploy. On first boot, `npm start` runs `prisma db push` to create the schema, and
   `autoSeedIfEmpty` (`apps/api/src/index.ts`) populates the 48-item catalog
   automatically. No manual seed step.
9. **Settings → Networking → Custom Domain →** enter
   `staging-api.aichazhengdaarakawa.com`. Railway shows a CNAME target such as
   `abc123.up.railway.app` — copy it for Phase 3.

---

## Phase 3 — Cloudflare DNS for the API

In Cloudflare → `aichazhengdaarakawa.com` → **DNS**:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `staging-api` | the Railway target from Phase 2.9 | **DNS only (grey cloud)** |

Keep it grey. Railway issues and renews its own certificate; putting Cloudflare's
proxy in front adds a second TLS layer that causes redirect loops unless the zone's
SSL/TLS mode is **Full (strict)**. Grey cloud avoids the whole problem, and the API
does not need Cloudflare caching.

Wait for Railway to report the domain as verified, then confirm:

```bash
curl https://staging-api.aichazhengdaarakawa.com
# {"status":"ok","message":"Ai-Cha & Zhengda API is running"}
```

---

## Phase 4 — Deploy the staging menu Worker

Both frontends are **Cloudflare Workers with static assets**, not Pages, and they are
deployed by running `wrangler deploy` locally — not from a Git trigger. The committed
configs are `apps/menu/wrangler.json` and `apps/staff/wrangler.json`.

Add a `staging` environment to `apps/menu/wrangler.json`:

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-cha-zhengda-menu",
  "compatibility_date": "2024-09-23",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  },
  "env": {
    "staging": {
      "name": "ai-cha-zhengda-menu-staging",
      "routes": [
        { "pattern": "staging-menu.aichazhengdaarakawa.com", "custom_domain": true }
      ]
    }
  }
}
```

The `custom_domain` route makes Cloudflare create the DNS record itself — no manual
CNAME for this host.

Vite bakes `VITE_API_URL` in **at build time**, so the variable belongs on the build
command, not on the Worker:

```bash
cd apps/menu
VITE_API_URL=https://staging-api.aichazhengdaarakawa.com \
VITE_BOT_NAME=AichaArakawastaging_bot \
npm run build

npx wrangler deploy --env staging
```

Deploying with `--env staging` never touches `ai-cha-zhengda-menu`, which keeps
serving production.

---

## Phase 5 — Deploy the staging staff Worker

Identical, against `apps/staff/wrangler.json`:

```json
  "env": {
    "staging": {
      "name": "ai-cha-zhengda-staff-staging",
      "routes": [
        { "pattern": "staging-staff.aichazhengdaarakawa.com", "custom_domain": true }
      ]
    }
  }
```

```bash
cd apps/staff
VITE_API_URL=https://staging-api.aichazhengdaarakawa.com \
VITE_BOT_NAME=AichaArakawastaging_bot \
npm run build

npx wrangler deploy --env staging
```

---

## Phase 6 — Wire the staging bot to the staging URLs

Back in [@BotFather](https://t.me/BotFather), with the **staging** bot selected:

1. `/setdomain` → `staging-menu.aichazhengdaarakawa.com`
2. `/setmenubutton` → URL `https://staging-menu.aichazhengdaarakawa.com`,
   button text `Order Now (UAT)` — label it so testers never confuse it with the
   live bot.

**Known limitation:** BotFather accepts only **one** login-widget domain per bot, and
both the menu and the staff portal use that widget. Point it at the menu domain
(customer flow) and have staff sign in on staging with the **phone OTP** path
(`/api/auth/staff/send-otp`) instead — that path does not depend on the widget
domain, and real SMS is enabled on staging.

---

## Phase 7 — ABA PayWay sandbox

Staging uses `ABA_BASE_URL="https://checkout-sandbox.payway.com.kh"` from Phase 2.

The purchase's `returnUrl` is derived from `WEBAPP_URL` (`apps/api/src/app.ts:1379`),
so it follows the staging domain automatically — nothing extra to configure in code.

If ABA rejects the purchase, ask ABA support to whitelist
`staging-menu.aichazhengdaarakawa.com` as a return domain on the sandbox merchant
account. See `docs/ABA_SANDBOX_TESTING.md` and `docs/ABA_SUPPORT_EMAIL.md`.

Both `/api/payment/aba/create` and `/api/payment/aba/status/:orderId` return **503**
when the credentials are missing — that is deliberate, not a bug. It keeps a config
mistake from surfacing as an unreadable "wrong hash" error.

---

## Phase 8 — UAT verification checklist

- [ ] `curl https://staging-api.aichazhengdaarakawa.com` returns the `status: ok` JSON.
- [ ] `https://staging-api.aichazhengdaarakawa.com/api/catalog` returns the 48 seeded items.
- [ ] `https://staging-menu.aichazhengdaarakawa.com` loads and shows the menu.
- [ ] Browser devtools → Network confirms the menu calls **staging-api**, not the production Railway host.
- [ ] The staging bot's `/start` opens the Mini App at the staging menu.
- [ ] A **cash** order completes and returns a 4-digit pickup code.
- [ ] The order appears on `https://staging-staff.aichazhengdaarakawa.com` within ~5s.
- [ ] Staff phone OTP login works and the SMS arrives.
- [ ] A **KHQR** order renders the ABA sandbox QR and reaches `paid` after a sandbox payment.
- [ ] Sold-out toggling in staff Menu Management shows up on the customer menu.
- [ ] Production is untouched: `https://menu.aichazhengdaarakawa.com` still loads and the production bot still answers.

---

## Ongoing workflow

Once set up, everything is automatic:

```
push to `staging`  →  Railway redeploys the staging API automatically
frontends          →  manual: rebuild + `npx wrangler deploy --env staging`
push to `main`     →  production API redeploys (unchanged)
```

Promote to production by merging `staging` into `main`.

---

## Environment variable reference

### API (Railway, staging environment)

| Variable | Staging value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `file:/data/staging.db` | Own volume. Never point at the production file. |
| `NODE_ENV` | `production` | Disables dev-only login routes. |
| `PORT` | `4000` | |
| `TELEGRAM_BOT_TOKEN` | staging bot token | **Must differ from production.** |
| `WEBAPP_URL` | `https://staging-menu.…` | Login redirect + ABA return URL. |
| `STAFF_APP_URL` | `https://staging-staff.…` | Staff login redirect. |
| `CORS_ORIGINS` | both staging origins | Belt and braces; `*.aichazhengdaarakawa.com` already passes. |
| `MANAGER_TELEGRAM_IDS` | tester Telegram ids | Grants analytics/catalog access. |
| `STAFF_TELEGRAM_IDS` | tester Telegram ids | Grants kitchen access. |
| `ADMIN_PHONE_NUMBERS` | tester phone numbers | Allowed to request staff OTP. |
| `PLASGATE_*` | production SMS keys | Real texts; costs real credits per test. |
| `ABA_BASE_URL` | `https://checkout-sandbox.payway.com.kh` | Sandbox, never the live endpoint. |
| `R2_BUCKET_NAME` | `…-staging` | Separate bucket keeps test images out of production. |
| `ALLOW_UNVERIFIED_TELEGRAM` | **unset** | Auth bypass. Local development only. |

### Frontends (build-time variables, passed to `npm run build`)

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://staging-api.aichazhengdaarakawa.com` |
| `VITE_BOT_NAME` | `AichaArakawastaging_bot` |

`.env.production` files are **gitignored** (`.gitignore` has `.env.*` with only
`!.env.example`), and static-asset Workers have no build-time variable store the way
Pages does. Pass both variables inline on the `npm run build` command, as in Phases 4
and 5, before every staging deploy.

---

## Gotchas

1. **One bot token per running API.** Long polling means a shared token breaks both bots.
2. **Two-level subdomains have no free TLS.** Hence `staging-menu`, not `staging.menu`.
3. **Railway custom domain: grey cloud.** Proxying needs SSL/TLS mode Full (strict).
4. **Vite bakes `VITE_API_URL` in at build time.** Changing it requires a rebuild, not a restart. To check what a deployed bundle points at: `curl -s <site>/assets/index-*.js | grep -o 'https://[a-z0-9.-]*'`.
5. **The catalog lives in two files.** `apps/menu/src/data/catalog.ts` and `apps/api/src/catalog-data.ts` must stay in sync, and item ids must match or checkout breaks on the `OrderItem.menuItemId` foreign key.
6. **A duplicated Railway environment copies variables, not volume data.** Re-check every variable after duplicating — production values carried over are the most likely cause of staging writing somewhere it should not.
