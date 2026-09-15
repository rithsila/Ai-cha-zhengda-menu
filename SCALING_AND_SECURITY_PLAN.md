# Master Scaling & Security Plan

This plan unifies your infrastructure upgrades (Redis, PostgreSQL, Cloudflare Tunnel) with the necessary security and code changes to safely run multiple API replicas on your Proxmox/Railway setup.

## Phase 1: Provision Infrastructure
*Set up the new services shown in your canvas.*

- [x] **Cloudflare Tunnel**: Deploy the tunnel service. Provide the required token variable. Route your public domain directly to the internal API port through Cloudflare.
- [x] **Redis**: Deploy the Redis service with a persistent volume (`redis-volume`). Note the internal connection URL.
- [x] **PostgreSQL**: Deploy the Postgres service with a persistent volume (`postgres-volume`). Note the internal connection URL.

## Phase 2: Code Refactoring for Redis & Replicas
*Remove in-memory state so multiple API instances can work together without logging users out.*

- [x] **Migrate Auth State to Redis**: In `src/auth.ts` and `src/telegram-initdata.ts`, replace the in-memory `Map` objects (sessions, OTPs, login attempts) with Redis (`ioredis` or standard `redis` package).
- [x] **Migrate Rate Limits to Redis**: Update `orderRateLimit` and `loginRateLimit` to use Redis-backed counters.
- [x] **Switch Telegram Bot to Webhooks**: In `src/bot.ts`, replace `bot.launch()` (long-polling) with `bot.createWebhook()`. Long-polling on multiple replicas will cause Telegram API conflicts and crash the bots.

## Phase 3: PostgreSQL Database Migration
*Execute the migration as detailed in your existing `2026-09-15-postgresql-migration.md` plan.*

- [x] **Update Prisma**: Change `provider = "sqlite"` to `provider = "postgresql"` in `schema.prisma`.
- [x] **Generate Migrations**: Run `prisma migrate dev` against an empty local Postgres instance to generate the initial SQL migration files.
- [x] **Write Transfer Script**: Create a script to read rows from the production `dev.db` (SQLite) and write them into Postgres using Prisma. (See the existing plan for strict ordering and constraint handling).
- [x] **Test Locally**: Rehearse the SQLite -> Postgres transfer locally to ensure zero data loss.

## Phase 4: Security Hardening & App Updates
*Patch immediate vulnerabilities before exposing the new tunnel.*

- [x] **Global Error Handler**: Add a fallback error handler at the end of `src/app.ts` to prevent HTML stack traces from leaking on crashes:
  ```typescript
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  ```
- [x] **Payload Limits**: Change `app.use(express.json())` to `app.use(express.json({ limit: '100kb' }))` in `app.ts` to prevent memory exhaustion attacks.
- [x] **Fix Image Uploads**: Change `multer.memoryStorage()` to write to disk (`/tmp`) before pushing to R2, preventing Out of Memory (OOM) crashes on large concurrent uploads.
- [x] **Add Zod Validation**: Install `zod` and validate `req.body` on critical endpoints like `POST /api/orders` to ensure data structure integrity.

## Phase 5: Production Cutover
*The final sequence to go live with the new architecture.*

1. **Maintenance Mode**: Stop new traffic/orders to the live SQLite API.
2. **Snapshot & Migrate**: Pull the final SQLite database, run your transfer script to populate the new PostgreSQL database.
3. **Deploy**: Push the updated code (Redis integration, Postgres provider, Security patches).
4. **Scale**: Increase the `Ai-cha-zhengda-API` service to 2+ replicas.
5. **Lock Down Ingress**: Point Cloudflare Tunnel to the API. **Delete the public Railway/Proxmox domain** so all traffic is forced through Cloudflare's WAF.
