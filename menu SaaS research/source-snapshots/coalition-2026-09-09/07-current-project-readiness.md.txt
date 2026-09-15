# Current project readiness

Read-only sample review on 9 September 2026. This is not a full code audit, security review, deployment assessment, or implementation plan. No application code was changed or runtime behavior tested.

## What was inspected

- [Repository README](../README.md): describes a Telegram customer menu, staff dashboard, Express API, Prisma/SQLite, and mock KHQR behavior. Documentation may lag implementation; this report does not assume every payment route is still mocked.
- [Prisma schema](../apps/api/prisma/schema.prisma): contains users, branches, menus, orders, rewards, staff, and system configuration. The inspected model set has no tenant entity or tenant identifier. A branch relationship is not itself merchant data isolation.
- [Loyalty settlement](../apps/api/src/loyalty.ts): contains transactional point settlement/refunds, paid-order-count-based Gold qualification, and lucky ticket issuance controlled by configuration. This is source observation, not proof of production correctness.

## Relevant existing foundation

The project already has the basic customer menu and staff surfaces described in the README. The schema includes a user coin/point balance, tier, lucky tickets, order earning/redemption fields, and a reward point cost. This makes the product vision related to the current project rather than a completely separate app.

However, a balance field and order flag do not by themselves supply an auditable multi-merchant financial ledger. Likewise, existing prize logic does not establish legal permission for a public promotion.

## Gaps before unrelated merchants use the service

| Area | Business requirement |
|---|---|
| Tenant isolation | Separate merchant-owned catalogs, staff permissions, orders, configuration, media, reports, and exports. Verify unauthorized cross-tenant reads and writes fail. |
| Merchant onboarding | Business identity, branch ownership, subscription, network opt-in, agreement version, payout details, and eligible products. |
| Shared customer identity | One network account with clear recovery and deduplication; shops see only authorized local information. |
| Rewards ledger | Durable entries for issuance, redemption, reversal, expiry if allowed, and corrections, with funding source and rule snapshots. |
| Financial records | Merchant deposits, coin coverage, service fees, payable settlements, payouts, and daily reconciliation. |
| Payment confirmation | Verify actual provider integration or controlled paid-receipt flow; prevent awards from QR generation, screenshots, or order creation alone. |
| Concurrency and abuse | Prevent double redemption, duplicate payment callbacks, replayed receipts, staff misuse, and unfunded awards. |
| Money precision | The inspected schema uses floating-point money fields. Define safe exact money representation and migration before financial settlement. |
| Gold policy | Existing code uses order counts; proposed business uses eligible spend and possibly top-ups. Do not silently reinterpret historical status. Separate trust from loyalty. |
| Governance | Merchant/customer terms, complaints, data access, rate changes, refunds, closures, backups, recovery, and operational ownership. |
| Business reporting | Costs and returns per merchant, funded obligations, cross-shop behavior, cohort retention, and settlement accuracy. |

## Suggested implementation order after business validation

1. Define tenants, branches, permissions, and data migration boundaries.
2. Make menu subscriptions and merchant onboarding usable independently of the rewards network.
3. Confirm purchase verification and provider responsibilities.
4. Design and implement funded ledger and settlement flows with explicit invariants.
5. Add merchant reward rules, customer history, and reports for the controlled pilot.
6. Validate refunds, concurrent claims, tenant isolation, merchant exit, and daily funds coverage.
7. Add Gold, consumer top-ups, or prize campaigns only when their separate business and regulatory decisions are resolved.

Existing customer balances and Gold status need a documented migration rule: who funds them, whether they transfer to the network, and how customers are informed. Never convert unbacked legacy points into externally redeemable obligations without funding.

The next engineering deliverable should be a scoped architecture/design after merchant interviews and payment/legal decisions. This research pack does not authorize a database migration, production rollout, or blanket rewrite.
