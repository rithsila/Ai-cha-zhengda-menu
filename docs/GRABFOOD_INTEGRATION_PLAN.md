# GrabFood POS Integration Research and Plan

## Decision and scope

Integrate this repository as the source-of-truth POS for the existing Ai-Cha & Zhengda outlet. The first release should support one GrabFood outlet, menu/availability synchronization, inbound GrabFood orders, staff preparation, ready notification, cancellation, and reconciliation. It must not replace the Telegram Mini App checkout or merge Grab customer accounts with Telegram accounts.

This is a **GrabFood Partner API (POS) integration**, not a public merchant API that can be enabled with a generic API key. Grab must approve the partner application, create a staging project, issue OAuth client credentials, and configure the partner webhook URLs. The official rollout is staging validation, a low-traffic production pilot, then a phased rollout. Cambodia is one of the supported countries.

## Current-project assessment

| Existing capability | Current owner | GrabFood implication |
| --- | --- | --- |
| Mutable catalog, modifiers, prices, images, active/sold-out state | `MenuItem`, `ModifierGroup`, `ModifierOption` in Prisma; staff catalog routes in `apps/api/src/app.ts` | Suitable canonical catalog, but it has no immutable external IDs or Grab-specific selling-time/stock data. |
| One physical outlet | `Branch`, seeded as `branch-arakawa` | Map this to one `partnerMerchantID`; store Grab's `merchantID` separately. |
| Kitchen workflow | Staff dashboard polls `GET /api/orders`; staff changes `pending → preparing → ready → completed/cancelled` | Reuse it, but add channel-aware transitions. Marking an order ready must call Grab once. |
| Customer payments and delivery | Telegram/guest checkout with Cash or KHQR; local delivery address fields | Grab owns GrabFood payment, consumer identity, and driver delivery. Keep Grab PII separate from Telegram user data. |
| Money | `Float` values in dollars | Grab menu/order amounts use minor units. Grab's Cambodia table specifies KHR with exponent 2, so the apparent USD-like local prices cannot be forwarded unchanged; define the merchant currency, tax and rounding policy before mapping. |

The integration needs to close four gaps: external merchant and menu identifiers, authenticated and idempotent webhooks, a platform-order state model, and an outbound operation/retry ledger.

## Official GrabFood contract

- [GrabFood Partner API guide](https://developer.grab.com/docs/grabfood/api/v1-1-3/) defines the required partner endpoints: OAuth token, onboarding status/menu endpoints, menu retrieval and sync state, order submission, and order-state webhook. It also lists essential Grab calls: OAuth, menu notification/update, list/edit/cancel/ready, and store pause/status.
- The partner responds to Grab's **Get Food Menu webhook** with a selling-time → category → item → modifier-group → modifier document. Stable IDs and image URLs must be retained. Selling times are required (one to twenty per outlet); service hours are local time while selling-time bounds are UTC.
- Grab requests/receives JSON over OAuth 2.0 Bearer authentication. Reuse a token until expiry (the guide says the default is seven days); never mint one per request. Webhook calls must return within ten seconds. Grab retries order-submission and order-state webhooks four times, with the first retry within 500 ms and later intervals up to five seconds.
- A sold-out change maps to the targeted update API (`availableStatus: UNAVAILABLE`, `maxStock: 0`); price/structural changes trigger the full-menu notification and Grab calls our menu webhook. Full notifications are rate-limited and protected by a distributed lock, so coalesce changes. Batch item updates allow up to 200 items; modifier batching is not supported.
- On `ready`, call `POST /partner/v1/orders/mark` exactly once with Grab's order ID and mark status `1`. On cancellation, first use the cancellability API where applicable, then submit Grab’s coded cancellation request. Grab is delivery owner for normal GrabFood orders; do not use partner-delivery state calls unless the outlet is explicitly configured as Delivered by Partner.

## Target architecture

```text
Staff catalog edit ──> catalog change outbox ──> Grab targeted/full menu sync
                                              └─> Grab GET menu webhook ──> canonical catalog projection

Grab submit-order webhook ──> authenticated idempotent ingest ──> local platform order ──> staff board
Staff status change ──> transition guard + outbox ──> Grab ready/cancel API
Grab order-state webhook ──> authenticated idempotent ingest ──> platform status/audit trail
```

`MenuItem` remains canonical. Add a channel-mapping layer rather than putting Grab IDs into user-facing item names or creating a second menu editor. Grab orders become regular kitchen orders with `source = GRABFOOD`, but retain immutable raw event payloads and Grab identifiers for support/reconciliation.

## Implementation plan

### 1. Partner access and operational decisions

1. Submit Grab's Food partner interest form; appoint product and technical contacts; obtain the developer portal staging project.
2. Confirm with Grab that this shop is onboarded as a partner-POS outlet, identify its production/sandbox `merchantID`, confirm the Cambodia KHR/exponent-2 currency configuration and whether prices are tax-inclusive, and decide manual versus automatic acceptance.
3. Provision a stable HTTPS API hostname. Configure the four production Grab source IPs if an IP allow-list is used. Store client credentials only in deployment secret storage.
4. Agree that the local catalog is authoritative after activation. Staff must not edit the same menu in GrabMerchant, because Grab warns that concurrent sources can overwrite each other.

**Exit condition:** staging credentials, one mapped outlet, final menu authority, currency, tax and acceptance decisions are recorded.

### 2. Add durable integration data

Create a Prisma migration that introduces:

- `IntegrationStore`: provider, local `branchId`, Grab `merchantId`, immutable `partnerMerchantId`, environment, active/sync status, and last successful menu revision.
- `MenuItemChannelMap` and `ModifierOptionChannelMap`: channel IDs, stable external IDs, and mapping status. Preserve mappings across edits; never regenerate IDs during a routine sync.
- Platform fields on `Order`: `source`, `externalOrderId`, `externalShortOrderNumber`, `externalMerchantId`, `externalState`, accepted/ready/cancel timestamps, and a uniqueness constraint on `(source, externalOrderId)`.
- `IntegrationEvent`: provider, event type, idempotency/dedupe key, payload hash, redacted raw payload, received/processed timestamps, result and failure detail.
- `IntegrationOutbox`: dedupe key, operation, JSON request, attempts, next attempt, terminal error, and correlation IDs. This makes webhook receipt fast and outbound delivery retryable.

Use minor-unit integer conversion in a dedicated mapper. Do not change the broader current pricing model during this integration unless the data migration is explicitly scheduled; simply ensure every Grab payload and stored external amount uses exact integer minor units.

### 3. Build a typed Grab adapter and authenticated webhooks

Under `apps/api/src/integrations/grabfood/`, add environment-aware configuration, OAuth token caching, request client, payload schemas, data mappers, and an outbox worker. Required configuration includes `GRABFOOD_ENV`, OAuth client ID/secret, callback OAuth client ID/secret, merchant/store IDs, API base URL, partner endpoint base URL, and optional Grab IP allow-list mode.

Implement these partner endpoints beneath `/api/integrations/grabfood`:

1. OAuth token endpoint for Grab to obtain a partner token; authenticate the configured client credentials.
2. Push Grab menu and integration-status webhooks for activation and support visibility.
3. Get Food Menu webhook, authorized before querying the canonical database and returning one valid full menu document for the requested mapped store.
4. Menu-sync-state webhook that records success/failure and exposes actionable staff/admin diagnostics.
5. Submit Order webhook that validates the mapped store, deduplicates on external order ID/event, creates a `GRABFOOD` order and line/modifier snapshots transactionally, queues/alerts the kitchen, and returns 2xx well below ten seconds.
6. Push Order State webhook that is idempotent and updates only permitted external states; retain message/code for diagnosis without using them as state-machine input.

Avoid routing these calls through Telegram authorization or CORS-based browser middleware. Apply server-to-server OAuth verification, request-size limits, structured audit logging with PII redaction, and an explicit replay/idempotency policy.

### 4. Synchronize catalog and availability

1. Build a deterministic full-menu projection from `MenuItem`/modifier records: stable categories, external item/modifier IDs, correct minor-unit prices, sellable state, image URLs, and one default selling-time schedule derived from the Cambodia store configuration.
2. On a manager catalog change, create an outbox entry, not an inline external call. Coalesce frequent structural changes into one full-menu notification; use targeted updates for sold-out/available, price and stock changes.
3. In the staff sold-out action, update the local database first, enqueue the Grab update second, and surface pending/failed synchronization without lying that Grab has already updated.
4. Implement an admin-only sync/retry view and a reconciliation job that traces sync results and compares mapped active local items to the last Grab acceptance result.

### 5. Integrate kitchen operations and order lifecycle

1. Extend staff order cards, filters and alerts with a clear source label and Grab short-order number. Do not show Grab consumer PII beyond the role that needs it for fulfilment.
2. Introduce an explicit transition table that separates local kitchen status from Grab external state. A staff `ready` transition must enqueue a one-time Mark Order Ready call; retry safe failures and record outcomes.
3. For cancellation, verify that the order is cancelable, collect a valid Grab cancellation reason, enqueue the API call, and await the external state webhook before declaring it externally cancelled.
4. Reconcile with the Grab List Orders API on a schedule and provide an operations screen for unmatched or terminally failed events. Do not award Telegram loyalty points or reuse ABA payment processing for GrabFood orders unless a later, separately approved loyalty integration maps Grab membership to this program.

### 6. Test, stage, pilot and operate

1. Unit-test all currency, catalog, modifier, auth, idempotency, and local/external-state mappings. Add webhook fixtures from Grab’s staging payloads, including duplicate and out-of-order delivery.
2. End-to-end test the staging sequence: activation, full menu fetch, successful menu sync, sold-out then restock, inbound order appearing on staff board, ready acknowledgement, external cancellation, and reconciliation recovery.
3. Run Grab’s portal test cases and capture request/response evidence. Use a low-traffic pilot outlet in production before enabling the full outlet.
4. Create alerts for webhook latency, non-2xx webhook processing, queued outbox age, failed menu sync, duplicate rate, and unmatched orders. Grab requires less than 1% error rate and complete order/order-state processing.

## Acceptance criteria

- A staff-managed item, modifier, price, and sold-out state have one stable Grab representation and an observable sync result.
- A valid Grab order creates exactly one kitchen order even when Grab retries the webhook; the staff dashboard visibly alerts and identifies it.
- Staff can make an eligible Grab order ready and cancellation requests are not represented as complete until the external outcome is reconciled.
- All callbacks authenticate, respond within the stated window, preserve a redacted event audit, and survive process restart through database-backed idempotency/outbox records.
- Staging evidence covers all first-release paths and a production pilot meets the agreed operational thresholds before rollout.

## Decisions needed before implementation

1. Is the desired scope standard GrabFood delivery only, or also Scan-to-Order/PayBill and Grab loyalty? The plan intentionally excludes the latter two.
2. Confirm the Cambodia merchant's KHR/exponent-2 configuration, menu price conversion from the current dollar-denominated catalog, and tax model. This is required before an exact minor-unit menu payload can be built.
3. Is Grab menu management to become fully POS-authoritative after activation, and is the outlet configured for automatic or manual order acceptance?

## Sources

- [GrabFood Partner API (POS) Integration Guide v1.1.3](https://developer.grab.com/docs/grabfood/api/v1-1-3/)
- [Official GrabFood Java SDK endpoint index](https://github.com/grab/grabfood-api-sdk-java)
- [Grab Merchant partner registration guidance](https://help.grab.com/merchant/en-sg/360044825832)
