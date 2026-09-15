# PostgreSQL Migration and Replica Readiness Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document is a proposed migration plan, not authorization to cut over production.

**Goal:** Move all existing production SQLite data to PostgreSQL with verified preservation, then support multiple API instances and database replication safely.

**Architecture:** Keep Express and Prisma 6.19.3. Use PostgreSQL in development, tests, staging, and production; perform a rehearsed, write-frozen transfer into an empty target. Launch one API instance first, then move process-local state into PostgreSQL and separate singleton background work before scaling.

**Tech stack:** npm workspaces, Express 5, Prisma 6.19.3, TypeScript/tsx, Vitest, React/Vite, Telegraf, ABA PayWay, Cloudflare R2. Production is documented as Railway; live infrastructure has not been inspected.

**Spec:** User request: analyze the existing project and plan a full SQLite-to-PostgreSQL migration for easy replication without losing production data. This document contains the proposed design and implementation sequence.

## 1. Scope, assumptions, and decisions

- This analysis did not connect to production, copy production data, change application code, or run migrations.
- The user confirmed that a short maintenance window with ordering temporarily paused is acceptable. Actual source location/size/schema, PostgreSQL hosting, and required failover recovery targets still require verification.
- Use the write-frozen snapshot transfer. Measure backup, import, verification, and recovery durations in rehearsal before scheduling the short maintenance window; no specific duration or production cutover date has been approved.
- The user confirmed replica readiness includes both multiple API instances and PostgreSQL standby/read replicas. Both are required outcomes, with separate readiness gates.
- Preserve all historical IDs, timestamps, money values, relations, statuses, settings, translations, and audit records. No reseeding, cleansing, renumbering, or business-schema redesign during transfer.
- Keep Prisma at the locked 6.19.3 release for this migration; do not combine an ORM major upgrade with it. Verify commands with the installed CLI, since current Prisma documentation also describes newer major versions.
- Zero missing rows is a migration acceptance condition. It is not an unconditional promise against future infrastructure failure.

### Approaches considered

| Approach | Benefit | Cost/risk | Decision |
| --- | --- | --- | --- |
| Write freeze, consistent snapshot, explicit import and comparison | One authoritative dataset; clear rollback boundary | Temporary interruption, duration depends on rehearsal | Recommended |
| Online initial copy plus durable change capture | Shorter final interruption | Must capture every insert/update/delete, payment event, ordering and retry semantics | Only if uninterrupted writes are required |
| Dual-write SQLite and PostgreSQL directly from requests | Superficially simple gradual rollout | Partial commits and disagreement between databases | Reject for this project |

## 2. What the project currently does

Customer menu and staff dashboard call one Express API. Prisma manages catalog, orders, customers, loyalty, prizes, translations, settings, and audit logs. Payments use real ABA PayWay calls. Telegram long polling and unpaid-payment reconciliation run inside the API process. Images use R2, with local static/upload paths also served.

Repository documentation is inconsistent: `INFRA.md` and parts of `README.md` describe older mock-payment/hosting assumptions. `docs/DEPLOY_STAGING_UAT.md` documents production SQLite at `/data/production.db` on Railway and separate staging SQLite. These are leads to verify against the deployed service, not proof of live state.

### Evidence and migration implications

| File | Finding | Required response |
| --- | --- | --- |
| `apps/api/prisma/schema.prisma` | SQLite provider; 16 business models | Create reviewed PostgreSQL initial migration and explicit data mapping |
| `apps/api/package.json` | Start runs `prisma db push`; tests use SQLite and destructive setup | Dedicated release migration job; guarded disposable PostgreSQL tests |
| `apps/api/prisma.config.ts` | Migration directory configured, no tracked migration files found | Establish PostgreSQL migration history; no SQLite SQL replay |
| `apps/api/src/db.ts` | File URL fallback, connection_limit=1, PRAGMAs, SQLite retries | Require PostgreSQL URL; remove SQLite runtime tuning; bound pool and transaction retries |
| `apps/api/src/index.ts` | Boot starts bot, auto-seed, timer | Fail closed on invalid DB; remove production auto-seed; explicit process roles |
| `apps/api/src/seed.ts` | `seedCatalog` deletes OrderItem, Order, modifiers, MenuItem; auto-seed calls it when catalog empty | Never invoke during import/cutover; guard development seed entry point |
| `apps/api/src/app.ts:1679` | Checkout reads balances/voucher and later writes them; pickup code reads latest order | Concurrency safeguards before PostgreSQL traffic |
| `apps/api/src/loyalty.ts` | Read pointsSettled, credit/refund, then set flag | Atomic settlement claim in same transaction to prevent double credit |
| `apps/api/src/app.ts:2999` | Lucky spin reads tickets then decrements; prize creation is separate | Atomic debit and prize creation; concurrent-spend tests |
| `apps/api/src/auth.ts` | Staff sessions, OTPs, login attempts, rate limits in Maps | Shared state before API replication |
| `apps/api/src/telegram-initdata.ts:87` | Customer sessions in Map | Shared sessions; existing memory sessions cannot be recovered from SQLite |
| `apps/api/src/bot.ts:155` | Long polling via bot.launch | One bot consumer, independently deployed |
| `apps/api/src/expiry.ts` | Per-process setInterval; payment status and loyalty updates separate | One worker initially; atomic DB effects and recovery reconciliation |
| `apps/api/src/translations/provider.ts:172` | Process-local provider request quota | Shared quota enforcement before multiple API processes |
| `apps/api/src/app.ts:628` | Serves local public/uploads; new uploads use R2 | Inventory existing local files before removing API volume |
| Root `package.json` | Root test only runs staff tests | Run API tests explicitly |

Read-only local inspection found two different database files: `apps/api/dev.db` has only five tables (45,056 bytes); `apps/api/prisma/dev.db` has all 16 models (1,343,488 bytes). Both passed local `quick_check` and `foreign_key_check`. Neither is evidence about production contents. This makes resolving the exact production URL and actual schema especially important.

## 3. Data preservation contract

Import every row from these tables, including inactive, cancelled, expired, and soft-deleted business records. Parent-first order:

1. User, Branch, Category, MenuItem, Reward, SystemConfig, StaffAccount, FeedbackReport, LocalizedText, AuditLog.
2. ModifierGroup, Order, PrizeClaim, LocalizedTextValue.
3. ModifierOption, OrderItem.

Importer must enumerate source tables/columns/indexes first and stop if anything is unaccounted for. Extra production tables must be explicitly mapped or separately preserved and reviewed; they must never be silently skipped. `_prisma_migrations`, if present, is preserved as source evidence, not imported as PostgreSQL migration history.

### Mapping rules

- Keep String IDs as PostgreSQL text, including catalog IDs and `branch-arakawa`; UUID defaults do not imply historical IDs are UUIDs.
- Keep Prisma Float mapped to double precision for this transfer. Defer Decimal/integer-cents conversion. Compare actual stored numeric values as well as business totals; never round imported money.
- Keep JSON-bearing String fields as text: OrderItem.modifiers, SystemConfig.value, delivery snapshots, audit old/new/metadata, translation owner keys. Do not parse and rewrite their formatting during transfer.
- Preserve null separately from empty string, false, and zero. Reject invalid booleans and out-of-range integers rather than coercing them silently.
- Inspect actual SQLite DateTime storage types. Export UTC instants through a matching SQLite Prisma client, with raw-value checks for legacy representations. Import explicit createdAt and updatedAt; verify epoch milliseconds match. Do not apply Cambodia timezone offsets to stored timestamps.
- Preserve Khmer, Chinese, emoji, embedded newlines, and exact text values. Check source strings for PostgreSQL-incompatible NUL characters and invalid encoding before transfer; block and report, rather than strip characters.
- Preserve foreign keys and unique constraints. Category names and translation polymorphic owner keys also require application-level relationship checks because not all links are declared foreign keys.
- Existing pickup codes intentionally wrap after AI-99 and reset daily. Do not add a global uniqueness constraint or modify historical codes.

### Verification report

For each table, compare row count, complete primary-key set, and every field keyed by primary key. Produce deterministic per-table SHA-256 digests from canonical records: fixed column order, rows sorted by primary key, UTC millisecond dates, exact text, explicit null and boolean types, round-trip-safe numeric encoding. Report mismatches by table/key/column without publishing personal data.

Also compare: order totals and counts grouped by status/payment method/day, sum of order item prices, each user's points/tickets/tier, every transactionId and payment expiry, all prize statuses, all SystemConfig key/value pairs, translation/revision counts, and audit counts. Aggregates supplement exact comparison; they cannot replace it. Existing anomalies must be recorded separately from migration-created differences.

## 4. Implementation work packages

### Task 1 — Inventory and restore rehearsal

**Files:** Create `docs/database/production-inventory.md`, `docs/database/migration-runbook.md`; update stale deployment instructions only after implementation is tested.

- [ ] Record production deployment SHA, actual database URL/path (redacted), volume identity, file/WAL size, SQLite version/schema, row counts, image storage paths, enabled writers, and available disk space. Compare deployed schema to this checkout before building the exporter.
- [ ] Record active ABA transactions and every writer: API requests (including GET payment status), callbacks, bot handlers, expiry sweep, translation backfill, seeds, scheduled/manual scripts, and deployment hooks.
- [ ] Create a consistent snapshot with SQLite backup API or CLI `.backup`. Never copy only a live WAL-mode `.db` file.
- [ ] Record SHA-256, capture time, source identity, and protected off-host copy. Do not put customer databases or secrets in Git/artifacts intended for public sharing.
- [ ] Restore the snapshot to an isolated location; run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Require `ok` and zero unaccounted violations.
- [ ] Use production-derived data only in restricted rehearsal environments with real Telegram, SMS, payment, and translation side effects disabled.

**Acceptance:** A restored, inspected source snapshot and evidence that the complete database and any local assets are recoverable. Live inventory is required before production execution.

### Task 2 — PostgreSQL runtime, migrations, and isolated tests

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts`, `apps/api/src/db.ts`, `apps/api/src/index.ts`, `apps/api/src/seed.ts`, `apps/api/package.json`, `apps/api/.env.example`; create `compose.postgres.yml`, `apps/api/prisma/migrations/20260915000100_postgresql_initial/migration.sql`, `apps/api/prisma/migrations/migration_lock.toml`, `apps/api/scripts/test-postgres.ts`, `apps/api/tests/database-startup.test.ts`.

- [ ] Provision isolated local/test/staging PostgreSQL databases. Select and pin a supported provider-compatible server version after rehearsal; use separate credentials and database names per environment.
- [ ] Change provider to `postgresql`, retain business fields/types, generate the initial SQL against an empty disposable database with the pinned Prisma CLI. Review all tables, indexes, nullability, defaults and referential actions.
- [ ] Separate runtime connection URL from the direct migration connection where a pooler requires it. Set pool size against total instance count, bot/worker connections, rollout overlap and admin reserve.
- [ ] Change `start` to `node dist/index.js`; add a release-only `prisma migrate deploy` command. Run migrations once per release before serving the new version.
- [ ] Remove file URL fallback and PRAGMAs. Require valid PostgreSQL configuration and successful connection/schema readiness before starting HTTP, bot, or timers. Add readiness that queries the DB, distinct from process liveness.
- [ ] Remove boot-time seeding in production. Guard destructive developer seeding by explicit opt-in and a disposable-database identity check; an empty production catalog must not trigger a wipe.
- [ ] Test invalid/missing URL, unreachable DB, missing schema, no automatic seed, and restart with existing records. Close Prisma, HTTP, bot and timers gracefully on shutdown.
- [ ] Replace destructive SQLite test setup with a runner that uses only a generated disposable PostgreSQL database and dedicated test role with no production privileges. Reject non-test targets before any migration/reset/cleanup. Ensure imported app dotenv cannot redirect the explicit test connection.

**Verification commands after implementation:**

```sh
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run build
npm --prefix apps/api test
```

**Acceptance:** Fresh and already-populated PostgreSQL databases survive startup/restart unchanged; the complete API suite runs on isolated PostgreSQL. No production command uses db push, reset, accept-data-loss, or seed.

### Task 3 — Correct concurrent business writes before cutover

**Files:** Modify `apps/api/src/db.ts`, `apps/api/src/app.ts`, `apps/api/src/loyalty.ts`, `apps/api/src/expiry.ts`, `apps/api/src/lucky-draw.ts`; extend `apps/api/tests/order-concurrency.test.ts`, `apps/api/tests/loyalty.test.ts`, `apps/api/tests/order-expiry.test.ts`, `apps/api/tests/customer-lucky-draw.test.ts`, `apps/api/tests/order-pickup-code.test.ts`, `apps/api/tests/aba-payment.test.ts`.

- [ ] Replace SQLite tuning tests with PostgreSQL concurrency tests using independent clients and real parallel requests.
- [ ] Use Serializable transactions with bounded P2034 retries for multi-row read/modify/write invariants. Retry whole DB transactions, with stable operation IDs. Do not blindly replay external payment/SMS/Telegram calls on pool or ambiguous connection failures.
- [ ] Atomically claim an unsettled order and credit/refund within the same transaction; zero claimed rows means another request already completed the effect. Make payment/order transitions and corresponding loyalty effects atomic or explicitly recoverable after a crash.
- [ ] Debit points/tickets conditionally (`balance >= debit`) inside the same transaction as the order/spin outcome. Validate and claim vouchers atomically across online and staff redemption routes. Review manual point/ticket adjustments for lost updates.
- [ ] Serialize pickup-code allocation across processes with a transaction-scoped PostgreSQL advisory lock before reading the latest code; establish deterministic ordering and preserve Cambodia day reset and 99-wrap behavior. Use a dedicated counter in a later migration if throughput warrants it.
- [ ] Ensure the sweep and payment callback cannot produce cancellation/refund versus paid/credit disagreement. Preserve unresolved ABA states when gateway verification is unavailable; reconcile transitions interrupted by shutdown.
- [ ] Add HTTP idempotency for order/payment creation where retries can create a second operation; stable IDs within one server retry loop alone do not cover a retried HTTP request. Persist keys/results in a separately reviewed additive migration if required.

**Required test assertions:** Two settlements give one points/ticket credit; two refunds give one refund; competing spend never makes balances negative; one voucher yields one redemption; concurrent spins cannot exceed balance and always persist awarded items with the debit; callback versus expiry leaves a valid status and one matching points effect; 30 parallel checkouts persist 30 unique order IDs and sequential codes before intentional wrap. Exercise failures between status/points operations and before/after external responses.

**Acceptance:** These tests pass with a pool larger than one and two API processes. A single PostgreSQL API process also needs these fixes because its requests can execute concurrently.

### Task 4 — Explicit importer and independent verifier

**Files:** Create `apps/api/migration/sqlite-source.prisma`, `apps/api/scripts/database/export-sqlite.ts`, `apps/api/scripts/database/import-postgres.ts`, `apps/api/scripts/database/verify-transfer.ts`, `apps/api/scripts/database/canonical-record.ts`, `apps/api/tests/database-transfer.test.ts`; add explicit script entries in `apps/api/package.json`.

- [ ] Freeze a source schema matched to the production snapshot and generate its SQLite client into a separate migration-only output. The deployed runtime remains PostgreSQL-only.
- [ ] Export from the immutable restored snapshot with pagination and all scalar fields; no relation inclusion that creates duplicate rows. Include schema/table/column manifests and source checksum.
- [ ] Import into an explicitly identified empty PostgreSQL business schema using a dedicated importer role and parameterized writes. Preserve IDs and timestamps explicitly; disable startup and external writers throughout.
- [ ] Keep constraints enabled and follow parent-first ordering. Never use skipDuplicates, upsert-overwrite, TRUNCATE, or automatic target cleanup to hide conflicts.
- [ ] For a small rehearsed dataset, use one bounded import transaction. If measurements require batches, record batch completion and require a fresh isolated target on failure; do not expose partially imported data. Do not assume the local 1.3 MB file predicts production size.
- [ ] Run a separate read-only comparison pass implementing section 3. Exit nonzero on any unknown table, type-conversion error, count/key/field mismatch, or integrity failure.
- [ ] Test representative Unicode, nulls, empty strings, non-UUID IDs, legacy timestamps, floats, every model, duplicate conflicts and orphans. Inject a mid-import failure; confirm no partial target becomes eligible for traffic. Mutate one target value without changing counts and assert the verifier rejects it.

**Acceptance:** Two independently repeated full rehearsals from the same source produce identical verified business data. Record backup/import/verification/restore durations and peak disk usage to size the maintenance window.

### Task 5 — Production cutover, with one API instance

**Files:** Complete `docs/database/migration-runbook.md` with actual verified service identifiers and tested commands; never embed credentials.

- [ ] Freeze unrelated deployments. Retain the exact SQLite release artifact, environment configuration, original volume, and independently restored backup. Provision the empty production PostgreSQL target with backup/restore facilities tested.
- [ ] Pause new checkouts and payment creation first. Let active orders/payments settle, and inventory remaining pending transaction IDs. Keep processing existing payments until the final freeze.
- [ ] Stop/drain all SQLite writers, including bot/timer/scripts and any payment-status GET route that writes. Route requests to a maintenance response. Ensure old deployments cannot auto-restart or receive traffic.
- [ ] Preserve incoming payment events durably or verify ABA retry/reconciliation coverage during the outage. Never acknowledge a callback as processed if it was discarded. Reconcile the pending-transaction inventory against ABA after switch; this coverage is a cutover gate.
- [ ] Take the final consistent SQLite backup only after write drain. Hash and copy off-host; verify integrity. This final snapshot, not an earlier rehearsal copy, is the source of truth.
- [ ] Apply reviewed PostgreSQL migrations to the empty target. Import, compare every table/field and all business summaries, and save the signed-off report. On any mismatch, remain in maintenance and use the pre-write rollback path.
- [ ] Switch only the new API to PostgreSQL. Start one instance with seeding, bot and sweeper disabled. Keep public traffic blocked; run read-only checks for catalog, order history, users, staff accounts, settings, translations and images.
- [ ] Declare the rollback boundary before enabling any PostgreSQL business writer. Reconcile pending ABA transactions, then enable the single bot/worker and reopen traffic. Controlled cash/KHQR tests after this boundary are real writes and must be retained.
- [ ] Monitor payments, points/tickets, authentication, transaction retries, DB connections, query latency and errors. Restart the API once and confirm persistence. Retain the SQLite source and backups for a proposed minimum 30-day observation period, subject to the established retention policy.

**Rollback boundary:** Before any business write to PostgreSQL, stop the new release and restore the old release against the preserved SQLite source, then reconcile payment events that occurred while paused. After any PostgreSQL business write (including reconciliation), never simply switch DATABASE_URL back to SQLite: it is now stale. Freeze writes, back up PostgreSQL, and fix forward or restore a compatible PostgreSQL application release. Returning to SQLite requires a separately rehearsed reverse transfer of every new/updated/deleted record and payment event; no reverse importer is assumed in this plan.

### Task 6 — Enable API replicas and database failover

**Files:** Modify `apps/api/src/auth.ts`, `apps/api/src/telegram-initdata.ts`, `apps/api/src/bot.ts`, `apps/api/src/index.ts`, `apps/api/src/expiry.ts`, `apps/api/src/translations/provider.ts`; create `apps/api/src/session-store.ts`, `apps/api/src/rate-limit-store.ts`, `apps/api/src/worker.ts`, `apps/api/tests/multi-instance.test.ts`; add reviewed Prisma migrations for shared state.

- [ ] Store staff/customer sessions, OTP challenges, login lockouts and rate limits in PostgreSQL with expiry indexes and cleanup. Store session token hashes and protected OTP verifiers; use atomic challenge consumption and rate-limit increments. Refactor middleware/callers for asynchronous shared-state reads.
- [ ] Treat current in-memory sessions/OTPs as ephemeral: schedule re-login and fresh OTP issuance around restart. Preserve StaffAccount/User records and staff permissions. Verify a session issued by instance A works on B and survives A restarting.
- [ ] Run long polling only in a dedicated bot worker. Ensure deployment overlap cannot start two consumers; replicas of the API never call bot.launch. Webhook conversion is a later alternative requiring secret verification and update deduplication.
- [ ] Give expiry/reconciliation one worker owner with no overlapping runs and a lease if multiple workers may start. Retain transaction-level idempotency because ownership alone does not handle crash recovery.
- [ ] Share translation provider quota counters. Verify every remaining Map is either request-local/immutable or deliberately shared.
- [ ] Confirm all historical image URLs work on every instance; move any local uploaded assets to R2 with verified object copies before removing the API volume. No frontend redesign is needed.
- [ ] Start two API instances against the primary, alternate requests between them, and repeat login, OTP, order, voucher, payment and restart tests. Budget DB connections for rolling deploy overlap.
- [ ] Choose a PostgreSQL service based on demonstrated standby/failover, backup/PITR and restoration capabilities. Do not assume a Railway PostgreSQL service automatically includes managed HA, replicas, or point-in-time recovery.
- [ ] Use one writable primary. Keep checkout, auth, balances, vouchers, payments and staff live-order reads on it. Introduce a separate read-only replica endpoint only for stale-tolerant reporting after measuring replication lag.
- [ ] If acknowledged-commit loss during a primary failure must be zero within the agreed failure model, require synchronous durable standby acknowledgement and safe promotion/fencing. Document availability impact if the standby is unavailable. Asynchronous replicas can lose the replication lag on failover.
- [ ] Configure backups and WAL retention/PITR separately from replicas; replicas also reproduce accidental deletion. Proposed operational targets: 30 days backup retention, daily backup monitoring, monthly restore drills, and a measured recovery-time target agreed before release.
- [ ] Drill primary failure and restored-backup startup in staging. Confirm old primary fencing, client reconnect, transaction retry, no double payment/loyalty effects, and preservation of acknowledged test writes according to the chosen replication mode.

**Acceptance:** API requests can move between two instances without lost authentication or duplicate effects; database failover and point-in-time restore are demonstrated with recorded recovery time and data-loss bounds.

## 5. Release gates and outstanding inputs

Production cutover is blocked until source inventory, off-host backup restore, full transfer comparisons, PostgreSQL business-concurrency tests, payment-event continuity, and measured maintenance timing all pass. Scaling is a separate gate requiring shared auth/quota state and singleton background ownership.

Still required from the live environment/operator: scheduling the short maintenance window after rehearsal; hosting/region and budget; production deployed SHA and volume access; actual data size/schema; ABA event retry/reconciliation behavior; acceptable recovery time and post-cutover infrastructure data-loss bound.

## 6. References

- [SQLite Online Backup API](https://www.sqlite.org/backup.html): consistent backup mechanism for an active SQLite database.
- [Prisma migration limitations](https://docs.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/limitations-and-known-issues): provider-specific migration SQL; switching provider requires separate migration history and data movement. Reference is for newer Prisma documentation; executable commands must be checked against this project's pinned v6 CLI.
- [PostgreSQL standby and replication documentation](https://www.postgresql.org/docs/current/warm-standby.html): asynchronous versus synchronous replication, standby behavior, and failover durability tradeoffs.

## 7. Plan review evidence

Analysis used source/schema/package scripts, deployment runbooks, read-only metadata/integrity inspection of both local SQLite files, and official database documentation. No API suite was run because this deliverable changes documentation only and existing tests initialize/destructively reset their database. No production preservation claim is made until the live backup/import/verification gates are executed.
