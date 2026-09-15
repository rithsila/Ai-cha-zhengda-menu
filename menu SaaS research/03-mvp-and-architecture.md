# Smallest sellable MVP and architecture choices

**Next action: use the five MVP boundaries below to evaluate pilot commitments — 15 minutes.**

9 September 2026. Proposed design, not implementation instructions or a deployment approval. A “tenant” means one merchant business; a branch is one location belonging to that business.

## Five MVP boundaries

1. **One branded merchant menu.** Stable browser URL and QR, merchant logo/colors/contact/hours, categories, images, sizes/toppings, sold-out switch, Khmer/English interface and merchant-entered translations. No customer login for browsing. Use one configurable template. Missing translations fall back clearly; never show Ai-Cha demo products in an empty merchant menu.
2. **One location and a simple order queue.** Pickup/counter ordering with visible acceptance, modifiers, pickup reference, staff accept/reject, preparing, ready and completed. Owner/manager and staff accounts with separate permissions; proposed package supports three staff logins. No printer or replacement-POS promise.
3. **Customer pays the shop.** MVP accepts cash or the shop's existing QR at the counter. Staff verify payment in the merchant's own bank app, record method/reference and actor. A QR image or customer screenshot is not automatic proof. Remote prepaid ordering is optional only after merchant-specific provider setup is validated.
4. **Owner control and basic records.** Owner edits the menu, controls staff access, sees recorded paid sales/cancellations, and exports their own orders. Show USD/KHR labels explicitly. One authoritative order currency and a stored merchant-set conversion rate/rounding rule prevent differing checkout totals. Do not label the illustrative 4,000 KHR/USD conversion used in economics as a live exchange rate.
5. **The service behind the screens.** Merchant isolation, safe guest order access, backup/restore, duplicate-order protection, assisted onboarding, monthly invoice/paid-through date, reminder/grace policy, and a tested outage fallback. These are launch requirements, even if merchants never see a settings screen for them.

## A concrete successful order

Customer scans a merchant QR → selects an iced drink with low sugar → sends order → server returns an order reference → staff acknowledge it → customer pays the shop → staff record payment verification → drink becomes ready → staff complete pickup. The customer sees “waiting for shop acceptance” before acceptance. Payment and preparation are separate states: a prepared drink is not proof of payment.

Minimum states: fulfillment = submitted/accepted/preparing/ready/completed/cancelled; payment = unpaid/verified/refund-needed/refunded. Staff cannot invent a bank-confirmed state. Manager-controlled corrections keep an actor, reason and time. Refunds happen through the shop's original method; recording a refund does not execute a bank refund.

Start with short-range, counter/pickup use. For remote unpaid orders, require shop acceptance and a clear pickup window; pause remote acceptance if no-show/spam handling consumes the benefit. Table identifiers can follow if pilot shops demonstrate demand. Split bills, seating plans and room charging are a different product scope.

## Cambodia-first reliability

| Situation | Proposed MVP response |
|---|---|
| Customer has no Telegram | Browser menu and guest ordering work; retain Telegram as an optional entry/notification channel |
| Weak connection | Compress photos, lazy-load images, show last refresh/connection state; cache public menu only where freshness is explicit |
| Request times out after order creation | Retry using the same unique submission key; retrieve the existing order instead of creating another |
| Device loses connection | Never show “order accepted” without server confirmation. Staff switch to paper/counter workflow; pending unknown requests are checked before resubmission |
| Staff phone sleeps or audio is blocked | Explicit enable-alert step, visible stale-board warning and foreground test; notifications are a backup to the persisted queue, not the sole record |

Proposed tests: initial usable menu within 3 seconds on a representative Cambodian mobile connection, new orders visible on the staff board within 10 seconds while connected. These are acceptance targets, not measured current performance. An offline menu cache is not an offline POS. Do not accept offline payments, final stock promises, or reward redemption in v1.

## Architecture comparison

These are engineering judgments for this repository, not vendor performance benchmarks. Monthly figures are planning allowances for a small deployment; see [economics](05-economics.md) for the chosen model.

| Option | Isolation and maintenance | Practical cost/effort assumption | Recommendation |
|---|---|---|---|
| **Shared app + shared PostgreSQL, merchant ID on owned rows** | One release/schema; good cost sharing. A missing authorization check can expose other merchants; require server checks, database constraints and row policies | Shared infrastructure allowance $50–$100/month initially; substantial first tenant migration | **Preferred SaaS destination** once paid demand justifies engineering |
| Shared code release, separate API + SQLite database per merchant | Smaller initial database change; physical data separation reduces accidental cross-merchant queries. Each instance still needs correct identity/secrets and routing | Assume $5–$15 infrastructure per merchant plus shared services; fleet upgrades/backups become repetitive | Temporary three-shop pilot alternative if reusable shared tenancy is unavailable; one repository, no code forks |
| Shared app + separate PostgreSQL database or schema per merchant | Easier per-merchant export/restore than shared rows; many connections, credentials and migrations; schemas alone are not an authorization guarantee | Assume $60–$150 shared base plus $1–$5/merchant resource allowance; not a provider quote | Consider only for explicit isolation contracts; too much administration for first low-price offer |
| Keep shared SQLite and add merchant IDs | One server and fewer migration changes; all tenants share its write constraints; isolation relies heavily on app logic | Low initial hosting; meaningful later migration/recovery work remains | Possible tiny prototype, not the preferred destination for a growing unrelated-merchant service |

SQLite supports many suitable workloads but only one writer per database at a time. That does not mean it fails at a particular merchant count; measure concurrent writes and recovery needs. [SQLite guidance](https://www.sqlite.org/whentouse.html)

PostgreSQL row-level security lets database policies restrict visible/modifiable rows. Owners and privileged roles can bypass it, so simply enabling it is insufficient. [PostgreSQL documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

**Avoid an infrastructure rewrite for its own sake.** Preserve React/Vite and Express/Prisma where useful. Use one backend with internal modules, not microservices. Retain current frontend hosting patterns and R2 media where appropriate; database/storage hosting does not require adopting an entirely new application framework. The final checkout also includes a menu translation editor and localized-text models: reuse them, add merchant ownership, and keep AI drafting optional. See the [final code update](04-code-assessment.md).

## Reconcile the existing KotStock proposal first

The [8 September menu/stock/profit design](../docs/superpowers/specs/2026-09-08-menu-stock-profit-saas-design.md) proposes KotStock organization/shop/membership/entitlement reuse and a shared frontend destination. It is explicitly a proposed design; its companion repository and claimed helpers were **not independently inspected in this research**.

Before implementation, spend a bounded **one engineering day** verifying whether its identity, tenant checks, migrations, backups and subscription entitlements already work for unrelated merchants. If they do, reuse them and add only menu/order capability. If they do not, choose the simpler standalone route explicitly. Do not build both. Inventory, recipes and profit costing must not become prerequisites to selling the menu pilot. This report neither edits nor silently approves the broader design.

## What “isolated merchant accounts” must mean

| Boundary | Proposed rule |
|---|---|
| Merchant and branch | A merchant owns branches. A branch cannot belong to two merchants. Start with one; provision multi-branch later without redefining the merchant |
| Staff | Global login identity may have separate merchant memberships. Each request checks active membership, role and allowed branch. Revocation must invalidate effective access promptly |
| Menu and assets | Merchant owns menu, categories, modifiers, settings and uploaded media. Slugs, category names and keys are unique within the appropriate merchant; public media access is allowed only for published menu assets |
| Orders and customer data | Merchant owns orders and merchant-local customer profile/history. Shared login never exposes cross-shop purchases. Guest receipt uses a scoped, expiring access token, not an order ID alone |
| Loyalty and billing | Reward balance belongs to merchant + customer. Subscription invoice belongs to the merchant's software account; food transactions never become platform subscription payments |

Serve public menus using a validated merchant slug/domain mapped on the server. For staff operations, a client-supplied merchant ID is only a requested context: the server verifies membership. Object access checks both object ID and merchant ownership. Branch filters only narrow an already-authorized merchant scope.

At the database layer, use required merchant ownership and compound relationships so an order cannot attach another merchant's branch or menu item. Route all normal database access through tenant-aware services. If using row policies, apply transaction-scoped tenant context with a non-owner runtime role; never let pooled connections retain a previous request's merchant. Test raw queries, background jobs and exports as well as normal API handlers. Migration/admin roles are separate from runtime access.

Tenant context must also cover frontend caches, local storage carts, search, analytics, image deletion, logs, notification recipients, rate limits and support access. A shared cache key or Telegram chat can leak data even when database filters are correct. Merchant-switching clears private state; audit deliberate founder support access.

## Monthly subscription operations

Start with manual invoices and bank-transfer verification against your own software-business account. Store merchant, plan, location count, invoice period/amount/currency, verified receipt, paid-through date and entitlement status. Restrict activation to the operator; a merchant-submitted screenshot cannot grant itself a subscription.

**Proposed policy:** reminder three days before expiry; seven-day grace; after grace stop accepting new orders while preserving existing order completion and owner export. Do not delete customer data when a subscription lapses. Show owners clear notices, not a mid-shift surprise. Define cancellation, service refunds and retention in the agreement. Automated recurring billing follows only if manual collection consumes material time; bank/provider eligibility and fees require confirmation.

## Migration and backup plan for later implementation

1. **Inventory and snapshot — 1 day assumption.** Identify actual production data location, record counts, secrets references and media manifest; create restorable backup. Never seed/reseed a live catalog to onboard a merchant.
2. **Assign legacy ownership — 1–2 days assumption.** Place current Ai-Cha/Zhengda data in one legacy merchant only if the operator confirms it is one business. Resolve branchless orders deliberately; preserve historical IDs and reward rules. Do not distribute old customers or points to new merchants.
3. **Migrate on a copy — 2–4 days assumption.** Add ownership, import to chosen database, validate totals/counts, transform float money with a documented rounding report, and quarantine ambiguous records. Store integer cents/riel plus currency/rate snapshots; preserve original values for review.
4. **Test and restore — 2–3 days assumption.** Prove tenant attacks fail, retries do not duplicate orders, and backups restore with media and settings. Test the actual runtime database role. Reconcile before/after totals.
5. **Controlled cutover — 1 day plus monitoring assumption.** Use a short write pause and reconciliation, then reopen one merchant. Define rollback before switching; once new orders exist, reconcile them rather than overwriting with an old backup.

These tasks overlap the total engineering estimate in economics; do not add them twice.

For an ordering pilot, target at most **one hour of data loss** and **four hours to restore service**. These are proposed recovery targets, not current guarantees. Use provider snapshots/continuous recovery appropriate to the database, plus encrypted independent exports and media manifests. Proposed operational retention: 7 daily and 4 weekly recovery copies, subject to legal/customer commitments. Test a restore before pilot and monthly. In a shared database, restoring one merchant requires restoring to a separate environment and extracting only that merchant, never replacing every shop's live database.

## Later loyalty: merchant-only by construction

Use a simple opt-in stamp rule before a configurable points engine. A verified paid eligible order earns once. A reward records merchant, customer, rule version, source order and claim state. Redemption checks that the earning merchant and redeeming merchant match; branches can participate only under that merchant's policy. Show the merchant name beside the balance.

Record earn/redeem/reversal entries in an append-only history; calculate or reconcile the balance from entries. Concurrent requests cannot spend the same reward twice. Refunds reverse unspent earning; already-consumed rewards require a defined manager-reviewed adjustment rather than silent deletion. Staff corrections require reasons and audit trails. Customers can browse/order without joining. No sale of points, transfers, purchased credit, financial balance, or network settlement. Merchant reward cost is separate from the SaaS bill.

## Explicitly later / excluded

| Later after paid retention | Excluded from this business scope |
|---|---|
| Second branch, branch-specific stock/availability, tenant-specific online payment integration, custom domain, simple local loyalty | Cross-merchant coins, top-up wallets, cash-out, merchant settlement, prize draws |
| POS import/export adapters after evidence, richer reports, assisted translations, printing only with clear demand | Full accounting/payroll, delivery fleet or marketplace, mandatory inventory/recipe system, native customer app |

**Next: mark the MVP boundary most likely to matter to your first owner interview.**
