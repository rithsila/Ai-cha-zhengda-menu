# Existing project: useful product, missing SaaS boundaries

**Next action: read the five launch blockers below before promising a pilot date — 5 minutes.**

Read-only source assessment on **9 September 2026**. Initial HEAD: `9115067cffaea8e33327f9ed5e4c4d5fc116a39e`; final recheck: `ffb944d565798a69c9953d8bd35f75d465aebd77`. The checkout advanced through other work while this research was interrupted. This task changed only the research folder. No runtime tests, bank transactions, production inspection, security scan, deployment or database mutation were performed. “Present” means observed in source, not proven working in production. Approximate line references below describe the initial snapshot unless identified as final.

## Final-check update: menu translations now have reusable foundations

The newer checkout adds `LocalizedText` and `LocalizedTextValue` models with locale, review and revision fields; manager-only translation list/edit/draft routes; a staff language editor; localized customer menu fields; and additional translation tests. See [translation routes](../apps/api/src/translations/routes.ts), [language UI](../apps/staff/src/components/languages/LanguageManagement.tsx) and the [operations runbook](../docs/multilingual-menu-operations.md). Configuration supports optional AI drafting; no provider call was made here. **Reuse this work instead of estimating bilingual menu editing as a fresh feature.** Scope translations to the merchant too: the new records and routes still lack merchant ownership.

The final check reconfirmed the original core gaps: no tenant/subscription schema, global staff roles and cache key, Ai-Cha catalog fallback, and unscoped order list/status operations. In the final API, order listing is around line 1691, status update 1805 and ABA confirmation 1895. The API test script now additionally removes its test database before setup; it was not executed. New test files are evidence of test coverage work, not passing test results from this research.

The prior coalition folder was removed in the newer history. Its ten reviewed documents are preserved as exact plain-text Git snapshots under [source-snapshots/coalition-2026-09-09](source-snapshots/coalition-2026-09-09), from the initial SHA. Their shared-wallet/prize proposals remain historical background, not current scope.

## Five launch blockers

1. **Merchant isolation is absent.** The schema has branches but no merchant/tenant model or ownership fields.
2. **Staff roles are business-global.** Current sessions/authorization cannot represent merchant and branch membership adequately.
3. **Shared defaults can display the original shop.** Empty catalog fallback, branding, cache keys and global settings need merchant context.
4. **Payment and preparation states overlap.** Staff status changes can trigger loyalty; future reporting must distinguish verified payment from completion.
5. **Subscription and recovery operations need implementation/proof.** No subscription model appears in the current schema; production backups and restore readiness were not established.

## What can be reused

| Capability | Source evidence | Assessment |
|---|---|---|
| Customer React/Vite app | [App.tsx](../apps/menu/src/App.tsx), [checkout](../apps/menu/src/components/CheckoutModal.tsx), [i18n](../apps/menu/src/i18n/config.ts) | Menu/cart/modifiers and multilingual interface foundation. Do not infer that every merchant-entered item has translations |
| Dynamic catalog | [useCatalog.ts](../apps/menu/src/hooks/useCatalog.ts), App.tsx around line 324, [API](../apps/api/src/app.ts) routes around lines 636–1007 | Database catalog is consumed; manager create/edit/delete and category endpoints exist, staff sold-out control exists. Current implementation is more capable than the old static-only CLAUDE.md note |
| Staff queue and editing | [staff App.tsx](../apps/staff/src/App.tsx), [MenuManagement](../apps/staff/src/components/MenuManagement.tsx), [OrderCard](../apps/staff/src/components/OrderCard.tsx) | Five-second polling and operational UI exist. Runtime alert delivery and device sleep behavior not tested |
| Orders and identity | API `POST /api/orders` around line 1042; [telegram-initdata.ts](../apps/api/src/telegram-initdata.ts), [auth.ts](../apps/api/src/auth.ts) | Customer identity is resolved server-side; guest ordering path exists. Telegram/phone staff authentication code is present, but needs tenant-aware membership and session lifecycle |
| Media, tests and loyalty | [r2.ts](../apps/api/src/r2.ts), [tests](../apps/api/tests), [loyalty.ts](../apps/api/src/loyalty.ts) | Reusable integration and regression-test assets. Existing points logic is coupled to global user records and lucky-ticket rules; do not enable it unchanged for SaaS |

## Payment reality: not a mock

The [API](../apps/api/src/app.ts) imports `aba-payway-sdk-unofficial`. `getAbaClient` around line 52 reads one environment-level merchant ID/key. Payment creation around line 1721 calls the provider purchase API with KHQR/deeplink options. Missing credentials return 503; this is not a fake-success fallback.

The status path calls `confirmAbaPayment` around line 1594, which queries ABA, handles pending/late approval, validates the returned amount against the stored total with a one-cent tolerance, and rejects a non-USD currency when one is provided. It does **not** require a nonempty returned currency in that check. The callback route around line 1892 invokes signature verification and then server-side confirmation. This is meaningful integration code, but no live credential validity, bank approval, SDK correctness or successful production payment was established here.

There are two SaaS consequences. First, one global merchant credential must never collect food payments for unrelated merchants. Each connected shop needs its own provider agreement/credentials and transaction mapping, or the MVP stays on counter payment. Second, callback/poll retries and refund handling require tests across payment and fulfillment states, not only the existing `paid` state.

The guest payment access helper currently permits access when an order has no Telegram owner. An opaque order UUID is not sufficient authorization for sensitive guest order/payment actions in a multi-merchant system; use a restricted receipt token. Staff access must be checked against the order's merchant.

## Specific gaps and code pointers

| Finding | Evidence | Planned correction, not performed |
|---|---|---|
| Branch filtering is not authorization | API order list around line 1390 starts with an empty filter; caller can supply branch; unassigned orders join that branch's results | Always enforce merchant/branch access from verified membership before optional query filters |
| Status mutation uses order ID directly | API around line 1504 validates status strings, updates by ID, settles points on paid/completed | Tenant-scoped object lookup, allowed transition rules, separate payment/fulfillment and audited corrections |
| Global customer and staff identity fields | [schema](../apps/api/prisma/schema.prisma): `User.telegramUserId` primary key; global loyalty balance; staff Telegram/phone unique globally | Separate identity from merchant memberships and merchant-local profiles/reward accounts |
| Global catalog/settings and floats | Schema: category name globally unique, SystemConfig key primary key, price/total fields `Float` | Merchant-scoped uniqueness/settings, exact money and currency snapshots, safe historical migration |
| Static fallback and shared cache | App.tsx line ~327 falls back to CATALOG when API items empty; useCatalog key is `store:catalog` | Valid empty tenant menu, distinct error handling, tenant-specific cache/storage keys; no original-brand fallback |

## Operations gaps

| Area | Source observation | What remains to prove |
|---|---|---|
| Sessions | auth.ts uses in-memory session/OTP maps; metadata may include identity, but authorization helpers chiefly resolve role | Durable/revocable identity + membership, recovery after restart, safe multi-instance behavior |
| Storage | r2.ts creates `menu/<timestamp>-<random>` keys without merchant ownership; local `/uploads` is served by API | Authorized uploads/deletes, tenant ownership, size/type controls, offsite backup; public menu photos versus private exports |
| Database | [db.ts](../apps/api/src/db.ts) uses SQLite/WAL, one pooled connection and lock retry | Load under multiple shops and analytics; source comments' benchmark numbers are not rerun results |
| Deployment/schema | [API package](../apps/api/package.json) runs `prisma db push` during start; root scripts contain explicit staging/prod deploy commands | Versioned reviewed migrations, staged rollout and rollback; no deploy scripts invoked in this task |
| Automated checks | API tests include access control, ABA, totals, concurrency, catalog and loyalty; staff component tests exist | Tests have not been run here. Existing tests cannot prove tenant isolation where tenants do not yet exist |

The API test command performs a test-database push with `--accept-data-loss`; it was deliberately not run during read-only research. A future implementation should run tests against an explicitly isolated database and verify the target first.

## What changes from previous research

The entire `coalition loyalty program/` pack was used as background: canvas, competitors, economics, program operations, regulatory questions, validation plan, readiness and sources. Its shared-reward funding, network customer wallet, payouts, Gold/top-up and prize proposals are **not requirements for this SaaS**. Their settlement and customer-funds cost models do not apply.

Preserve the useful lessons: software willingness to pay is unproven; competitor features must be verified; branches do not equal isolation; source evidence is stronger than stale README claims. Replace cross-shop metrics with paid renewals, order reliability and founder support time.

The [menu/stock/profit specification](../docs/superpowers/specs/2026-09-08-menu-stock-profit-saas-design.md) is a second relevant planning artifact. It proposes a broader destination than this smallest sellable MVP. Its statements about the companion KotStock repository remain document claims here, not a new external code assessment.

## Engineering acceptance evidence needed before launch

1. Two merchants with deliberately overlapping menu names/staff identities: cross-tenant catalog, orders, exports, settings, media deletion and callbacks all fail safely.
2. Staff removal and branch reassignment take effect; owner-only menu/account changes are rejected for normal staff; guest receipt cannot access another order.
3. Duplicate checkout, simultaneous status updates, callback retries and late payment do not duplicate orders or incorrectly mark payment.
4. Browser checkout, Khmer text, USD/KHR display and reconnect behavior pass on actual merchant phones; closed/sold-out shops cannot accept invalid orders.
5. Restore a backup into an isolated environment and reconcile order totals; demonstrate subscription expiry without losing existing orders or owner export.

**Next: highlight “merchant isolation” as a non-negotiable pilot gate.**
