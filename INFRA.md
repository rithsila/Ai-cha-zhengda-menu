# Infrastructure & Deployment Plan (INFRA.md)

This document outlines the intended infrastructure architecture and deployment strategy for the Ai-Cha & Zhengda platform as it moves from local development to production.

## Current Local Architecture (Phase 1 MVP)

- **Frontend (Menu & Staff):** React + Vite. Currently served via local Vite dev servers.
- **Backend:** Node.js + Express. Currently running via `ts-node-dev`.
- **Database:** SQLite file (`dev.db`).
- **Telegram Bot:** Long-polling via `telegraf` within the Express app.

---

## Production Architecture (Target)

To support high traffic, secure payments, and reliable staff operations, the production infrastructure should be distributed and robust.

### 1. Frontend Hosting (Vercel / Cloudflare Pages)
- **`apps/menu`** and **`apps/staff`** should be deployed as static sites.
- **Why:** High availability, global CDN caching, and out-of-the-box SSL.
- **Configuration:** Build commands will output to `dist/`, which is then served globally. The API URL must be injected via environment variables (e.g., `VITE_API_URL`).

### 2. Backend API Hosting (AWS ECS / Render / Railway / GCP Cloud Run)
- The Node.js Express server (`apps/api`) should be deployed in a Docker container or via a PaaS (Platform as a Service) like Render/Railway for easy scaling.
- **Why:** Needs to run a long-lived Node process for the Telegram bot and handle incoming KHQR webhooks.
- **Bot Strategy:** In production, you should switch the Telegram bot from "long-polling" (`bot.launch()`) to **Webhooks** (`bot.webhookCallback()`) to improve performance and prevent dropped updates when scaling to multiple API instances.

### 3. Database (Managed PostgreSQL)
- **Migration:** SQLite must be replaced with a robust RDBMS like **PostgreSQL**.
- **Provider:** Supabase, AWS RDS, or Neon.
- **Why:** SQLite does not support concurrent write scaling well and loses data when the local container/server restarts. Prisma makes the switch to PostgreSQL trivial by changing the `provider` in `schema.prisma`.

### 4. Real-time Infrastructure (Redis / WebSockets)
- **Current state:** The Staff Dashboard polls `/api/orders` every 5 seconds.
- **Production state:** Replace polling with **Server-Sent Events (SSE)** or **WebSockets** (e.g., Socket.io).
- If running multiple instances of the API, you will need a **Redis pub/sub** adapter so that an order created on Server A triggers a WebSocket notification on Server B where the staff tablet is connected.

### 5. Payment Gateway (ABA PayWay / KHQR)
- The current `/api/payment/khqr` endpoint is a mock. 
- In production, this must be replaced with the actual ABA PayWay API, which involves:
  - Generating HMAC hashes with a secret key.
  - Exposing an internet-accessible webhook URL (e.g., `https://api.yourdomain.com/webhooks/aba`) for ABA to POST payment confirmations to.
  - Ensuring this webhook is highly secure and validates the ABA signature.

## Summary Deployment Steps

1. Create a PostgreSQL database (e.g., Supabase) and get the connection string.
2. Update `apps/api/prisma/schema.prisma` provider to `postgresql`.
3. Run `npx prisma migrate deploy` against the production DB.
4. Deploy the API to Render/Railway, providing the `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, and `WEBAPP_URL`.
5. Deploy `apps/menu` and `apps/staff` to Vercel, setting `VITE_API_URL` to point to the live Render/Railway URL.
6. Set the Telegram Webhook to point to your live API (instead of polling).
