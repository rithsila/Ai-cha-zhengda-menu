# Menu, stock, and profit SaaS — product and architecture specification

- Date: 2026-09-08
- Status: Proposed design for owner review; implementation is not authorized by this document.
- Scope: Profit tracking in the staff experience, connected to KotStock, with a path to independent daily shop operation.
- Primary project: `Ai Cha Menu/staging`
- Companion project: `/Users/rithsila/orca/workspaces/ai-cha stock bot/staging`

## 1. Product direction

Give a shop owner one connected workflow: record a sale, account for the stock used, and understand the money earned. The product must support businesses beyond Ai-Cha and Zhengda through configuration rather than customer-specific forks.

The owner should be able to answer:

- How much does each item cost, and what margin does its selling price leave?
- Which items contribute the most profit after actual discounts?
- What were this calendar month's sales, product costs, expenses, and estimated operating profit?
- How much cash came in and went out, and what remains unpaid?
- Which missing records or cost changes make these numbers incomplete?

The user's franchise controls RestoSuite report exports and integrations. The user can print POS reports and view reports on mobile. This release must not depend on RestoSuite access. Future customers may use an external POS, or buy this menu and inventory product to operate independently.

### Recommended decisions for review

1. Support manual item costs first, with optional recipe and stock costing per item.
2. Use KotStock's existing organization, shop, membership, module, and entitlement model for the SaaS destination.
3. Put profit capabilities inside the `commerce` domain initially. Do not introduce a second billing system or a new paid finance module as a prerequisite.
4. Reuse the staff experience for authorized owner reporting. Keep normal staff operations simple and restrict financial data at the server.
5. Launch a limited profit pilot before a complete cashier product. Require the cashier milestone before claiming that the bundle can replace a shop's daily sales system.
6. Keep POS connectors optional and provider-neutral. A connector is a source of commerce records, not the definition of commerce.
7. Call monthly results **estimated operating profit**. This scope is a management report, not a general ledger, tax filing system, or calculation of after-tax net income.

These are explicit proposed defaults, not decisions already approved by the user. They make this document reviewable without requiring another question first.

## 2. Project evidence and compatibility

### Inspected baseline

| Area | Existing evidence | Design consequence |
|---|---|---|
| Menu architecture | `apps/menu`, `apps/staff`, Express API; SQLite in `apps/api/prisma/schema.prisma` | Preserve the functioning menu and order board during staged migration |
| Sales data | `Order`, `OrderItem`, modifiers, discounts, delivery fees, cash/KHQR | Build on real sale lines; do not infer sales from stock-out alone |
| Current reporting | `apps/staff/src/components/SalesAnalytics.tsx`; `/api/analytics/sales` in `apps/api/src/app.ts` | Extend the reporting surface, replace its financial calculation source |
| Reporting semantics | Endpoint filters current status to `paid` or `completed`, groups by creation timestamp; UI uses rolling 30 days | Payment and fulfillment must be independent; add true calendar months and explicit financial dates |
| Current status updates | `PUT /api/orders/:id/status` validates known strings but updates status directly | Financial posting needs guarded transitions and transactional idempotency, not a side effect of arbitrary status updates |
| Authentication | `apps/api/src/auth.ts` uses in-memory sessions containing role and expiry | SaaS sessions require verified actor identity and tenant/shop access; a role-only session cannot scope financial records |
| Configuration | `apps/api/src/store-config.ts`, `SystemConfig`, brand fields, category names | Existing configurability helps, but global settings and uniqueness must become shop-scoped |
| Inventory | KotStock `items`, append-only `stock_movements`, warehouse/lot/reservation support | Inventory stays authoritative for physical balances |
| Inventory cost reports | `20260903150000_inventory_report_server_filter_paging.sql` and `20260903141000_inventory_report_totals.sql` | Current report multiplies effective stock-out by current item unit cost; do not reuse that as historical sales COGS |
| SaaS foundations | KotStock `docs/SaaS Upgrade plan/DECISIONS.md`, `_shared/auth`, `_shared/modules`, `_shared/idempotency` | Reuse platform boundaries and conventions, while verifying each helper meets the new transaction requirements |
| Commerce foundations | `20260829240000_traceability_and_commerce_modules.sql`; platform-api commerce order listing | Existing customers, listings, orders, lines, and lot allocations must be extended, not duplicated |
| Cost precision | Menu monetary fields are `Float`; stock has `unit_cost_usd` and lot `unit_cost_minor` | Introduce exact financial arithmetic and granular ingredient-cost precision |

Observed menu HEAD at final inspection: `ba266f3b4275e19d2d1902f214443c22081ccfd6`. Observed KotStock HEAD: `0d8a73189971dbe1a6faad016455f69e646eb899`. These identify inspected checkouts, not deployed production state. Revalidate touched runtime paths before implementation.

The older menu spec `2026-07-15-prd-v2-design.md` describes earlier intentions, including PIN access. Current source is the baseline for behavior; do not reintroduce an obsolete authentication design from that document.

### Authority and architectural fit

KotStock's binding decisions remain authoritative for platform architecture: D-001 organization tenancy, D-003 modular monolith, D-004 row-based isolation, D-010 preserved history, and D-011 inventory ownership. This proposal does not supersede those decisions.

The SaaS destination is first-party commerce and inventory in the existing KotStock modular monolith, using one PostgreSQL database and its platform identity. Port the customer-menu and staff experiences into public and authenticated routes of the shared frontend deployment to preserve D-003. Current separate menu/staff/API deployments may remain during the compatibility period. Keeping separate deployments permanently would require a documented change to D-003 before implementation.

No cross-repository code migration is part of writing this spec. A later implementation plan must reconcile and update KotStock's higher-authority data/API documents, preserve its traceability paths, and identify the exact modules to port. SaaS subscription `billing_orders` and PayWay billing fulfillment are platform billing, not customer food orders or shop income.

## 3. Customers, packaging, and scope

Initial audience: cafés, drink shops, takeaway food shops, and simple packaged-goods sellers. Do not attempt table-service restaurant management, manufacturing, payroll, or enterprise accounting in the initial release.

| Purchase/use mode | Supported behavior |
|---|---|
| Menu/commerce only | Menu, orders, manual cost estimates, expenses, profit on recorded sales; cashier after its release milestone |
| Stock only | Existing KotStock stock workflows; no claim of sales profit without sales records |
| Menu plus stock | Recipes or direct stock links, automated consumption, purchase costing, waste, and connected reporting |
| External POS plus this product | Later file/API adapters; same reporting model and duplicate controls |

Feature entitlements use the existing platform model. Manual costing must not require installing inventory. Recipe-linked mutations require both commerce and inventory access. Exact subscription prices are outside this design.

### Release boundaries

- **Profit pilot:** current menu sales, manual costs, expenses, honest completeness indicators. Suitable for learning; not whole-shop reporting if other sales are missing.
- **Connected operations:** tenant-safe commerce, stock costing, recipes, reliable event lifecycle, and reconciled reporting.
- **Standalone bundle:** connected operations plus staff cashier, receipts, refunds, and cash-shift reconciliation.
- **Optional extensions:** external POS connectors, receipt recognition, advanced forecasting, multi-level production recipes, and full accounting exports.

## 4. Owner and staff experience

### Setup

1. Select business/shop, timezone, reporting currency, language, and enabled channels.
2. Configure menu categories, variants, modifier groups, images, prices, and branding. Offer Ai-Cha/Zhengda as templates only.
3. For each sellable configuration, choose `manual`, `stock_item`, or `recipe` costing. Start with the owner's most important items and show remaining coverage.
4. Manual mode asks for direct product cost per sale unit. Explain that rent and general wages belong in expenses. A genuine zero cost requires explicit confirmation.
5. Stock mode maps a sale quantity to an existing stock item and unit. Recipe mode adds ingredients, packaging, quantities, and modifier effects.
6. Add recurring expense drafts and identify sales channels not yet captured.

Allow saving incomplete setup. Missing data must remain visible and must not become zero cost automatically.

### Navigation

Within the authenticated staff/owner experience, use existing navigation patterns:

- **Orders:** existing preparation board; future cashier entry is a separate action.
- **Menu → Cost & recipe:** current price/cost preview, published recipe, draft changes, and history.
- **Reports → Profit:** calendar month, custom dates, shop, channel, category/item filters; item breakdown and reconciled totals.
- **Expenses:** recurring drafts, one-off entries, paid/unpaid status, receipt attachment, and correction history.
- **Stock:** reuse inventory functions; avoid maintaining a second inventory editor or balance.

Owner mobile view prioritizes sales, gross profit, operating expenses, estimated operating profit, and records needing attention. Drill-down must explain every total. Show comparison to an equal elapsed period when comparing an unfinished month.

All new customer-facing SaaS UI supports English and Khmer, including validation, exports, and empty states. Reuse KotStock's `dashboard/src/i18n.ts`, `useLanguage()`, and Khmer typography when porting the UI. Financial tables remain usable on phones; labels must not rely on color alone.

### Access

- Owner: all financial functions within their organization and permitted shops.
- Organization admin/manager: financial access only through explicitly assigned permissions.
- Staff: orders, cash collection, permitted stock operations, and optionally expense drafts; no costs, margin, or profit by default.
- Viewer: only explicitly granted views; ordinary inventory visibility does not imply financial visibility.
- Platform support: follow existing audited support-session policy.

Suggested permission names are `profit.read`, `cost.manage`, `expense.submit`, `expense.approve`, `refund.issue`, and `cash_shift.close`. Map these to the existing permission infrastructure rather than creating a parallel role system.

## 5. Financial definitions and completeness

### Report basis

Store immutable business events. Report recognized sales when goods are handed over/fulfilled, using `recognized_at`; report payments by their own `paid_at`. Preparation, payment confirmation, and handover are different events.

An advance payment is cash received but not yet a fulfilled sale. A fulfilled but unpaid order is an outstanding amount and an exception; normal cashier flow requires payment before handover, while delivery settlement may legitimately arrive later. The payment state must never make a sale disappear when preparation status changes.

| Metric | Definition |
|---|---|
| Product gross sales | Recognized quantity × snapshotted pre-discount unit price, excluding collected tax |
| Product net sales | Product gross sales − allocated merchant discounts − posted product sales refunds |
| Product COGS | Posted cost of fulfilled goods, adjusted only by explicit eligible cost-return/correction events |
| Product gross profit | Product net sales − product COGS |
| Product gross margin | Product gross profit ÷ product net sales × 100, only when net sales is positive |
| Contribution after channel fees | Product gross profit − explicitly allocated selling/payment fees; show separately from gross profit |
| Estimated operating profit | Product gross profit + net merchant delivery/service revenue − channel/payment fees − operating expenses − separately recognized waste/stock losses |
| Operating cash movement | Actual operating receipts − actual operating payments, classified by purpose |

Tax collected for remittance, employee tips, loans, owner contributions, and owner withdrawals are not product sales. Equipment purchases are cash outflows, not automatically ordinary operating expenses. Initial reporting excludes depreciation, interest, income tax, and formal payroll accruals; disclose the basis in report help/export metadata. No automatic claim of tax or accounting compliance is made.

Stock purchases create inventory value when received. Supplier payments affect cash when paid. Consumed stock costs move to prepared-order cost or COGS as applicable. Do not deduct both the purchase amount and the same goods' COGS from operating profit. This separation is informed by IAS 2's distinction between inventory cost and expense recognition when related revenue is recognized. [IAS 2 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)

Delivery-platform payouts must reconcile gross merchant sales, discounts/subsidies, commission, other fees, refunds, and net settlement. A net payout is not gross revenue. Actual fees supersede linked estimates through an adjustment, not an additional duplicate expense. Merchant-owned delivery revenue is separate from money merely passed through to a carrier.

### Completeness contract

Reports carry independent statuses for sales-source coverage, cost coverage, expense review, and integration freshness. No single green badge may conceal one incomplete dimension.

- Show recognized sales for all recorded lines, plus separately the sales and profit of cost-covered lines.
- If any included line lacks cost, whole-period gross profit and operating profit display **incomplete**, with known-cost subtotals. Never subtract partial costs from all sales and label the result total profit.
- Show cost-covered fulfilled units / all fulfilled units, plus cost-covered positive sales / all positive sales; display refund coverage separately. Zero-sales periods use `N/A` for revenue coverage.
- Owner confirmation that expenses are reviewed does not prove that all business sales were captured. Display the selected channels and missing-source notice.
- Historical manual cost estimates and reconstructed costs remain labeled as estimates.
- On a fully refunded or zero-revenue item, margin percentage is `N/A`; its cost and loss remain visible.
- Monthly margin is calculated from summed profit and summed net sales, never an average of item percentages.

Calendar reports use an IANA shop timezone and half-open ranges `[month start, next month start)`, converted to UTC for queries. Default to `Asia/Phnom_Penh` for the current shop. Keep the current rolling 30-day filter only as a separately labeled option. Shop timezone changes are effective-dated; existing recognized business dates remain stable.

## 6. Costing rules

### Cost methods

- **Manual:** effective-dated direct unit-cost versions, optionally with cost deltas for modifiers. Price preview is an estimate, and historical posted cost uses the applicable version.
- **Direct stock item:** quantity conversion from one sold item to one inventory item, including packaged resale products.
- **Recipe:** one level of ingredient and packaging components, each with a base unit and quantity; modifiers can add, remove, or replace quantities.

One sale line has exactly one costing method. Publishing a recipe replaces manual costing for future preparation; never add both costs together. Any explicit fallback uses manual method with provenance and an estimate label. Missing recipe costs do not silently select an arbitrary fallback.

### Recipes and modifiers

- Recipe version is pinned when an order is accepted; cost allocation is captured when preparation consumes ingredients. Store both version identifiers and component snapshots.
- Preserve existing stable modifier keys from `ModifierGroup.key` and `ModifierOption.key`. Names are display snapshots, not integration identifiers.
- Treat size as a recipe configuration, not an assumed uniform multiplier. A larger cup can change packaging independently of liquid.
- Zero-price sugar/ice selections may change consumption; explicitly map their effects or mark them cost-neutral. Do not infer ingredient quantities from labels like “50%”.
- Validate that combined removals/replacements cannot yield negative component quantities. Unmapped cost-relevant modifiers make costing incomplete.
- Use recipe yield to represent normal preparation loss once. Record exceptional spills/spoilage separately; do not apply a second blanket waste percentage to the same loss.
- For combos, snapshot component quantities and cost once. Allocate revenue/discounts proportionally by standalone selling values for component analysis, using deterministic remainder allocation; zero-value bundles require configured allocation weights. Parent and component report views must not both contribute to grand totals.
- Nested recipes and production batches are deferred. Initial recipes are flattened; batch production later needs explicit input/output movements to avoid double deduction.

### Units, purchase prices, and precision

Use exact decimal arithmetic. PostgreSQL posted money uses integer currency minor units consistent with existing commerce fields; quantities and unit costs use fixed-precision decimals sufficient for fractions of a cent per gram/ml. Proposed domains are `numeric(20,6)` for quantity and `numeric(24,12)` for unit-cost calculations, subject to validated bounds. Carry precision through components and round only at financial posting boundaries. APIs serialize decimals and large integers as strings.

Purchase packs have explicit conversions: for example, 1 carton = 12 bottles, 1 bottle = 1,000 ml. Convert kg↔g and L↔ml within their dimensions. Never convert mass↔volume without an item-specific factor. Changing a pack conversion creates a new version rather than reinterpreting history.

Initial base reporting currency is USD for the current shop; new shops choose a currency at onboarding. Support KHR cash tender by storing original amount/currency and the shop's snapshotted transaction exchange rate when the cashier milestone is implemented. Never add USD and KHR directly. Multi-currency purchasing and consolidated reports across different base currencies are deferred; separate-currency reports remain available.

Recommended non-lot valuation is moving weighted average within a shop/item valuation pool: `(remaining value + new receipt value) / (remaining quantity + received quantity)`. Warehouse transfers within that pool carry value and create no profit. Cross-shop transfers carry source value into destination valuation, without treating the transfer as a sale.

For tracked lots, allocate eligible lots using the existing FEFO policy and snapshot their recorded costs. FEFO selects stock physically; it does not itself define an accounting valuation method. Cost policy is explicit per item and effective-dated. Unknown opening/receipt costs remain unknown; a later known receipt cannot erase unvalued remaining stock. Existing lot `unit_cost_minor = 0` defaults are not evidence of a confirmed zero cost.

Historical sale costs do not change when a supplier price, recipe, or item master cost is edited. Authorized corrections create linked adjustments with actor, reason, original date, posting date, and provenance. Lock reviewed months; reopening requires an authorized audited action. Default late adjustments post in the current open period with the original sale linked, rather than silently restating a closed month.

## 7. Order, inventory, and refund lifecycle

| Event | Sales/payment effect | Stock/cost effect |
|---|---|---|
| Draft/cart | None | None |
| Order accepted | Snapshot item/price/modifiers/recipe; no recognized sale yet | Optional reservation; physical stock unchanged |
| Payment verified / cash collected | Append payment; does not itself fulfill goods | No duplicate stock deduction |
| Preparation starts | No recognized sale yet | Consume ingredients once; hold their cost against prepared order |
| Handover / fulfillment | Recognize sale and transfer prepared cost to COGS | Direct resale items consume here if not already consumed |
| Cancel before preparation | Void unfulfilled sale; payment refund is a separate workflow | Release reservations; no consumption |
| Cancel after preparation | No sale if never fulfilled; refund payment when appropriate | Prepared food remains consumed; classify prepared cost as waste once |
| Refund after fulfillment | Post sales refund linked to original lines; track payment refund success independently | Keep COGS unless an approved physical return restores saleable inventory |
| Saleable packaged return | Linked sales refund | Return original quantity/value and credit original COGS once |
| Stock count correction | No sale | Append variance movement and classify loss/gain with audit |

Prepared-order cost remains identifiable across midnight/month end; do not expense it as sold before handover. Stale prepared orders appear in a daily reconciliation queue. Partial fulfillment/refund allocations must never exceed remaining line quantities or refundable amounts.

Refunding a drink does not recreate milk, sugar, or packaging. A completed sale's non-returnable cost remains COGS even if revenue is refunded; do not also post that same cost as waste. An unfulfilled prepared cancellation becomes waste instead of COGS. Loyalty gifts consume stock with zero net sales and visible cost; existing points/prize settlement must retain its own idempotency.

### Reliability and stock availability

Within the SaaS shared database, domain transitions, inventory movements, financial postings, and an outbox record commit transactionally through owning domain functions. The frontend must not orchestrate separate writes. Lock affected inventory/valuation rows in deterministic order; use expected state/version checks for competing order transitions.

Unique business-event keys prevent repeat preparation, fulfillment, refund, receipt, and import actions permanently. A short-lived HTTP idempotency cache alone is insufficient: concurrent requests can pass a read-before-write check, and expired cache records must not permit an old sale to post again. Same key/same payload returns the prior outcome; same key/different payload is a conflict.

Existing lot nonnegative constraints remain authoritative. Default insufficient stock behavior is to stop the inventory-backed preparation/fulfillment transition and ask for a stock correction, not fabricate a negative lot. Manual-cost menu-only sales do not require inventory. Available quantity considers reservations; do not promise real-time availability from daily imports or stale integration data.

During any approved temporary two-database bridge, use an outbox written with the originating transaction, durable inbox deduplication, schema-versioned events, bounded retry with backoff, and a reconciliation queue. Display pending/failed synchronization; never claim a distributed atomic commit. Preserve event ordering per order and reject/defer events missing prerequisites. No browser-held service credentials or direct cross-app database writes.

### Telegram coexistence

Every stock movement has a source and purpose: receipt, recipe consumption, waste, transfer, count correction, or other approved adjustment. Once automatic consumption is enabled for a recipe/shop from a recorded cutover time, staff stop entering routine sale consumption again in Telegram. Show linked sales consumption in the existing timeline. Manual negative adjustments require a reason; suspected duplicates are flagged for review, not silently discarded.

On disabling/suspending inventory, stop its mutations according to existing module gates. Do not erase history or silently switch recipes to manual costing. Owner may explicitly configure manual costing for future orders where commerce remains active; unresolved prior consumption stays in reconciliation. Historical report access follows existing lifecycle/retention permissions.

## 8. Data ownership and proposed contracts

This is a logical extension model, not executable DDL. A phase-specific technical spec must map these entities onto the latest migrations and existing APIs before coding.

| Domain | Existing foundation | Proposed extension |
|---|---|---|
| Platform | Organizations, shops, memberships, modules, entitlements | Shop reporting settings; financial permissions through existing access model |
| Commerce catalog | `catalog_listings`, menu categories/modifiers | Independent sellable products/configurations, recipe/manual-cost versions, stable external mappings |
| Commerce sales | `orders`, `order_lines`, existing menu order data | Separate payment/fulfillment states, financial dates, immutable price/discount/tax snapshots, source references |
| Payments | Menu provider references; commerce design contracts | Shop-sale payment/refund/settlement records, independent from platform `billing_orders` |
| Inventory | `items`, movements, warehouses, lots, reservations | Purchase receipts/values, valuation events, prepared-order consumption links, effective-dated costing policy |
| Profit within commerce | New capability | Cost allocations/snapshots, sale/cost adjustments, expense records, recurring templates, period review/lock records |
| Integration | Platform integrations/outbox conventions | Source-specific mappings, event inbox/outbox, permanent business-key uniqueness, import batches/reconciliation |

### Required model changes

- Existing `catalog_listings.item_id` and `order_lines.item_id` are non-null stock references. Extend commerce with an independent sellable identity and optional inventory mapping. Keep existing stocked listings valid and preserve `order_lot_allocations` for traceability. Do not require a fake stock item for a menu-only product.
- Do not create a parallel new set of SaaS orders next to existing commerce orders. Map legacy menu IDs through durable migration references and extend the existing records/contracts.
- Every shop-owned entity has organization/shop scope directly or through enforced immutable ownership references. Cross-entity links must validate the same organization and shop, including recipes, ingredients, expenses, sales, and attachments.
- Financial postings retain source ID, event type/version, amount/currency, effective time, posting time, actor/integration identity, reversal link, and cost provenance. Product names, prices, modifier selections, and recipe versions are historical snapshots.
- Cost allocations reference order line and component/lot/movement as applicable, with quantity, unrounded cost, posted allocation, method, and `known`/`estimated`/`missing` quality.
- Expense records distinguish incurred date from payment date; drafts do not affect profit. Approved expenses affect their incurred period; payments affect cash. Recurring templates generate one draft per shop/template/period for review, not repeated automatic payments.
- Receipt attachments use existing private-storage conventions. Refunds and adjustments are append-only; archive catalog definitions instead of deleting financial history.
- Queries aggregate on the server with matching filter semantics for cards, tables, and exports. Use tenant/shop/date indexes and cursor pagination for detailed events; drill-down totals must reconcile with cards.

### Domain command contracts

Use existing versioned organization/shop route conventions and domain-owned services. These names describe operations rather than prescribing a second routing framework:

| Command/query | Essential input and guarantee |
|---|---|
| Publish cost/recipe | Shop, sellable configuration, expected version, components or manual cost, effective date; validation and immutable version |
| Accept / prepare / fulfill order | Order, expected transition version, idempotency key; server recomputes authorized prices/costs and commits once |
| Issue refund / confirm return | Original payment/lines, quantities/amount, disposition, reason, key; refund and restock are distinct linked events |
| Receive purchase | Supplier/document reference, item quantities, pack conversions, costs/currency, received date; stock/value receipt once |
| Approve/pay expense | Expense version and dates; no duplicate expense or cash posting |
| Read profit report | Scope, time basis/range, filters; totals, currency, quality, coverage, freshness, and drill-down references |
| Import external sales | Source/installation, external IDs, lines/summary scope, payload version; preview, reconciliation, commit once |

Financial fields are never trusted from a public menu client. Public catalog and guest order serializers use explicit allowlists; existing spread-based order responses must not begin exposing new cost fields. Cache keys, downloads, and background jobs carry tenant/shop/permission scope.

Use RLS and explicit grants for exposed tables in addition to application authorization. Privileged functions verify access and scope; server secrets never reach browsers. Add new policies through the project's migration workflow and retain its stricter shop boundaries. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 9. External sales and standalone cashier

### Optional external sources

Design canonical channels such as customer menu, staff cashier, delivery platform, POS import, and manual summary. Source installation plus external order/line IDs identify a sale; business mappings remain distinct from display names.

If a menu order is also recorded in an external POS, designate one source as authoritative for recognition and link its mirror. Never add both. An imported daily summary and detailed orders for the same shop/channel/period require an explicit replacement/reconciliation operation; summaries are not extra sales on top of detail.

For the current franchise pilot, optional manual entry from printed reports can record daily channel totals. An aggregate-only entry may improve known revenue coverage but cannot produce item-level profit or recipe stock deductions. Item quantities and modifier detail are required for those results. Mark reconstructed data and supporting document references clearly. OCR and RestoSuite API work are deferred.

### Standalone cashier milestone

To sell the bundle as sufficient for daily operation without another POS, add:

- Staff-created anonymous walk-in orders, fast item search, modifiers, and channel selection.
- Cash amount tendered/change, confirmed payment recording, and authorized discounts.
- Browser-printable receipts; payment and sales references that remain stable after retries.
- Cash shift opening float, cash sales, refunds, cash-in/out with reasons, counted closing balance, and variance.
- Guarded cancellation/refund workflows, receipt reprint, and audit history.
- Manual entry of delivery-platform orders when no connector exists, including settlement/fee reconciliation.
- Connection failure states: do not show success until the server commits; retry safely. Initial release is online-only and must be described as such. Offline ordering, printer drivers, and cash-drawer hardware are separate milestones.

Inventory purchases paid from the till link to the same supplier payment record; recording a cash-out must not create a duplicate expense. Digital/cash split tender can follow the first cashier release; the initial UI must reject unsupported splits explicitly.

## 10. Rollout and project work boundaries

### Phase A — Profit pilot in the current menu

Extend existing menu cost management and `SalesAnalytics.tsx`; extract financial calculations/transition services from `apps/api/src/app.ts` into focused modules. Add manual cost versions, snapshots, independent recognition/payment records, simple expense approval/payment records, and calendar reporting. Adapt legacy order states through explicit transition mapping. Do not launch a new multi-tenant service on the current global-role/global-config model.

Use exact decimal arithmetic through an explicit adapter if SQLite remains during the pilot. Only documented corrections may backfill old costs. Existing orders without reliable cost/fulfillment history remain legacy/incomplete; do not assume `createdAt` is the sale recognition date or infer prior payment from a currently cancelled order.

Exit: current checkout/loyalty/order board still work; known sales/cost calculations reconcile; missing history is visible; owner can review a month without external POS access. Pilot language explicitly states which sales are included.

### Phase B — Shared SaaS commerce foundation

Extend KotStock's existing commerce schema and port menu behavior into it. Reuse platform authentication, shop settings, module gates, billing entitlements, and frontend deployment model. Map legacy branches to real shops and global customers to scoped customer records without accidental cross-tenant linking. Change global category uniqueness and configuration keys to scoped equivalents. Preserve current brand-specific defaults as one solution package.

Plan each shop's migration with source counts, IDs, payment references, totals, and an explicit authoritative-write cutover. Rehearse snapshot import and delta catch-up, then a short write pause for final reconciliation. Avoid uncontrolled dual writes. Rollback switches routing only after reconciling post-cutover writes; never restore an old database snapshot over newly accepted orders.

Exit: at least two test organizations with overlapping product names can independently order, operate, and report; public serializers and all mutations enforce isolation; migrated current-shop totals match the documented baseline.

### Phase C — Inventory-backed costing

Add direct item links, recipe/modifier versions, units, purchases/valuation, consumption and cost allocation, waste, prepared-order reconciliation, and Telegram cutover controls. Use existing inventory domain functions/ledgers and preserve lot traceability. Do not reuse generic stock-out report totals as sales COGS.

Exit: recipe sales, cancellations, refunds, stock counts, changed purchase prices, and retries reconcile both quantities and value. Historical profit is stable after current-price edits.

### Phase D — Standalone daily operations

Deliver the cashier milestone, complete channel capture, delivery settlements, recurring expense drafts, cash reconciliation, and owner month review. Pilot real operating days with the current shop or a consenting independent shop before making replacement claims.

Exit: a shop can record all supported daily sales and costs using the bundle, close a cash shift, explain stock changes, and produce a monthly management report with explicit coverage.

### Phase E — Optional adapters and expansion

Add CSV/API connectors only against verified provider contracts and customer access. Consider advanced production recipes, multi-currency purchasing, offline support, and more detailed accounting exports after observing actual demand. No adapter is a dependency of Phases A–D.

Each phase needs its own implementation plan and focused technical contracts after this design is reviewed. This roadmap does not authorize one large rewrite.

## 11. Acceptance scenarios and verification

| Scenario | Required result |
|---|---|
| $2.00 item, $0.70 direct cost | $1.30 gross profit, 65% margin |
| Same item discounted to $1.50 | $0.80 gross profit, 53.33% displayed margin |
| Three such items with a $1 order discount | $5.00 net sales, $2.10 COGS, $2.90 gross profit; allocated cents sum exactly |
| $0.50 topping with $0.20 incremental cost | Added revenue and cost both appear; base recipe is not duplicated |
| Small vs large drink | Correct cup and ingredient quantities; no implicit multiplier |
| Supplier changes cost next week | Prior posted sale profit unchanged; future cost preview uses the new applicable valuation |
| 1 L ingredient costing $2, recipe uses 25 ml | $0.05 ingredient cost and 0.025 L consumption; no early cent rounding |
| 10 units at $1 then 10 at $2, no intervening use | Weighted average $1.50; consuming 4 posts $6 and leaves value $24 |
| One missing ingredient cost | Affected line is incomplete; total profit is not presented as fully known |
| Paid order moves through preparing and ready | Payment stays paid; recognized sale appears once at handover and never disappears due to board status |
| Advance payment September 30, handover October 1 | September cash receipt; October sale/COGS; prepared costs tracked between events |
| Duplicate prepare/fulfill requests, including after cache expiry | One business event and one inventory/financial effect |
| Cancel before prep / after prep | Reservation release without consumption / consumed preparation cost becomes waste once |
| Fulfilled drink refunded without return | Revenue reduction; original COGS retained; no recreated ingredients or second waste charge |
| Saleable packaged return | Original quantity/value restored and COGS reversed once |
| Partial refund | Cannot exceed original refundable quantity/amount; deterministic discount/fee allocations |
| $500 stock purchase, only $150 sold | Cash spend follows actual payment; COGS $150; unsold stock value retained |
| Rent incurred September, paid October | September operating expense; October cash payment; no duplicate expense |
| Platform sale $10, commission $2, payout $8 | Sales $10, fee $2, settlement $8; no second revenue entry |
| Manual summary overlaps imported order detail | Import requires reconciliation/replacement; never adds both blindly |
| Concurrent final-stock sales | Reservations/consumption obey availability; no negative lot or oversell hidden by retries |
| Inventory unavailable/suspended | No silent stock update or costing fallback; pending operation or explicit manual-mode workflow |
| Same ingredient usage entered in Telegram | Source/reason visible and suspected duplicate review available |
| Owner from another organization probes IDs/export | Denied with no financial or customer data disclosure |
| Staff/public customer fetches order | Cost fields absent at API boundary, not merely hidden by UI |
| Midnight Phnom Penh / leap-year month | Correct local calendar boundaries and consistent table/export totals |
| KHR tender for USD-priced sale | Stored transaction rate explains tender/change; no direct mixed-currency summation |
| Recurring job or receipt import repeats | One draft/receipt per permanent business key |
| Month locked, later correction entered | Current open-period adjustment linked to original, or authorized audited reopen |
| Existing menu migration | IDs/mappings, order amounts, payment references, loyalty outcomes, and stock history reconcile |

For the implementation phase, run focused financial-domain tests, API transition/concurrency tests, UI tests, and database tenant/ledger tests. Existing menu tests include order totals, concurrency, expiry, and pickup codes. The root menu build currently builds only the API; verify staff and menu builds explicitly when those apps change. The API test script resets its configured test database, so execute only against a verified disposable database. KotStock requires dashboard tests/build plus relevant Deno and database suites under its AGENTS.md.

Manual QA must exercise owner and staff flows in both languages, printed receipts/exports, mobile layouts, a network retry during payment/preparation, and a complete sample month. Performance targets should be measured against representative tenant-scoped datasets during each technical plan rather than inventing unsupported scale claims here.

## 12. Evidence-informed choices and later review

These references inform particular design choices; the combined architecture is a recommendation based on the two repositories, not a claim that another vendor implements this entire design.

- Shopify documents profit using costs recorded at sale time, variant-level costs, and margins affected by discounts/refunds. This supports cost snapshots and distinguishing price-preview margin from realized margin. [Shopify profit reports](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/default-reports/profit-reports)
- Square documents linking recipes to ingredient costs/stock and allowing simpler cost tracking without full stock tracking. Its documented recipe limitations are not adopted here: size and topping costs matter to this menu's existing modifier model. [Square recipe costing](https://api.squareup.com/help/us/en/article/8629-beta-track-ingredient-costs-with-square-recipes)
- IAS 2 provides the inventory expense-recognition and cost-formula context; this product remains a management estimate with the explicit simplifications in section 5. [IAS 2 overview](https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/)
- Supabase documents database-enforced row security; the project already requires this in addition to application authorization. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Sources accessed 2026-09-08. No RestoSuite API or franchise export access is assumed or required.

Owner review can focus first on the proposed manual-first costing model, whether the first commercial customers need cashier immediately, which expense categories are essential, and whether the shared KotStock SaaS destination matches the intended product packaging. Defaults are specified throughout so these are review choices rather than unresolved implementation placeholders. After review, update this document and prepare a plan for one approved phase; do not start implementation automatically.
