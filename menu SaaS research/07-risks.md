# Risks and launch questions

**Next action: put “no unrelated merchants before isolation tests” on the pilot checklist — 1 minute.**

9 September 2026. Prioritized planning assessment. Likelihood is qualitative judgment, not measured incident probability. Legal questions below require a current Cambodian professional answer for the actual business, not a blanket compliance project.

## Commercial risks

| Risk | Likelihood / impact judgment | Control and stop signal |
|---|---|---|
| Owner sees no value beyond cheap menus/POS | High / high | Interview current behavior, compare competitors, require full-price renewals. Stop expansion if fewer than 2 of 3 renew |
| Support and payment chasing consume the fee | High / high | Record minutes, bound setup/support, self-service edits. Investigate over 60 minutes/month per mature shop |
| Staff duplicate everything into another POS | High / high for POS users | Observe full workflow. Reject the segment or confirm one viable integration rather than promise all POS connectors |
| Founder becomes permanently on call | Medium / high | Explicit support hours, staged onboarding, incident runbook, merchant fallback. Reduce active cohort if recovery needs exceed capacity |
| Brand/IP confusion | Medium / medium-high | Use merchant-authorized logos/photos, choose neutral SaaS branding, verify rights to reuse franchise assets/code components |

## Product and operating risks

| Risk | Likelihood / impact judgment | Control and stop signal |
|---|---|---|
| Cross-merchant data exposure | Current design is unsuitable for unrelated tenants / critical | Server membership, scoped objects/cache/media/jobs, database constraints and tests; no public merchant onboarding before proof |
| Missed orders or duplicate submission | Medium / high | Persist before acknowledgement, retry keys, stale-board warnings, device tests and paper fallback |
| Staff mark unpaid food as paid or wrong shop receives online payment | Medium / critical | Separate payment states, actor/reference log, shop-owned QR or individually approved gateway credentials; investigate every discrepancy |
| Backup exists but cannot restore | Unknown / high | Restore drill before pilot and monthly; include media/settings and single-merchant recovery procedure |
| Same-shop loyalty abuse or misunderstanding | Medium if added / medium-high | Earn only on verified eligible payment, atomic claim, refund policy, merchant label on balance, no transfer or purchased value |

## Five legal and accounting questions to resolve proportionately

### 1. Business registration and e-commerce classification

Ask: “For a Cambodia-based business charging merchants a monthly menu/order software fee, which business registration, tax registration, e-commerce permit/license and recurring filings apply? Does a public order-taking page change the classification compared with menu hosting?” Identify founder/entity status, operating address, actual activities and proposed contracts.

The official [KHMERSME business-license page](https://www.khmersme.gov.kh/en/laws-and-regulations/business-licenses/) links business registration and the e-commerce law/permit framework. It is a starting point, not a determination that one particular permit covers this SaaS. No registration fee or approval duration is assumed here.

### 2. Tax and invoice treatment

Ask a local accountant to confirm the business's taxpayer classification, VAT treatment if applicable, tax-inclusive versus exclusive advertised pricing, monthly/annual filings, patent tax, withholding exposure on relevant expenses, foreign hosting treatment, and required invoice fields/currency. Also ask how to book setup fees and prepaid subscriptions.

The [official business registration portal](https://registrationservices.gov.kh/) connects registration processes; detailed applicability and current rates remain unverified in this report. Do not infer that low revenue means no registration or filing duty. The economic model is before tax and treats $19 as retained subscription revenue; if an applicable tax must be absorbed within $19, recalculate from net revenue.

### 3. Consumer terms, ordering and responsibility

Ask who is the food seller and who provides the software; confirm required Khmer disclosures, price/fee display, order acceptance, cancellation/refund terms, complaint contacts and receipt obligations. Confirm that merchants authorize their menu descriptions/photos and remain responsible for food fulfillment and accuracy, without inventing a contract that removes all platform duties.

The [Consumer Protection and Competition Directorate-General](https://www.ccfdg.gov.kh/) is the official consumer-protection authority starting point. Have local counsel review the actual short merchant agreement and customer notices. Do not claim guaranteed sales gains, instant bank verification or complete offline service.

### 4. Customer data and overseas hosting

Ask what current laws apply to names, phone numbers, Telegram IDs, order histories, cookies/logs, marketing consent, minors, retention/deletion, overseas hosting and incident notifications. Specify where hosting/backup providers store data. Require merchant-specific purposes and permission for marketing; do not create a cross-shop CRM or sell identifiable customer data.

[DLA Piper's Cambodia guide](https://www.dlapiperdataprotection.com/guide.pdf?c=KH), last modified **13 February 2026**, describes the comprehensive data law as not enacted at that date and explains existing e-commerce data-security obligations. **That February status does not establish September 2026 enactment status.** This research did not verify a later authoritative enactment instrument. Ask counsel to check the current position before launch; do not use “no comprehensive law” as permission to collect everything.

Practical product default: guest browsing, minimum order contact information, merchant-local history, restricted exports, role-based access, encrypted backups, a contact for access/deletion requests, and retention agreed before collection. Backups may retain deleted records temporarily under a disclosed policy; financial retention and personal-data deletion need a reconciled rule.

### 5. Direct payment integration and optional rewards

For a manual counter-payment MVP, confirm permitted display/use of each shop's own payment QR and honest labeling of staff verification. For automated payments, ask the shop's bank/provider about third-party integration, merchant-specific credentials, webhook verification, credentials storage, fees and refund responsibilities. Food payments must go to that shop under its agreement; do not route them through the software operator's merchant account.

Official [ABA PayWay](https://www.payway.com.kh/km/) product information distinguishes payment products, but bank acceptance and this app's fees are not established. An indexed [Shopify offer](https://www.payway.com.kh/km/shopify/) displayed 0.7% with possible extra card/wallet charges; the page did not yield readable content on direct open. **Do not use that as a verified fee for this custom SaaS integration.** Obtain a written merchant-specific quote if integrating. Do not confuse the unrelated `payway.com` with Cambodia's `payway.com.kh`.

For optional merchant-only stamps, confirm reward terms, promotion restrictions for the actual products, expiry, refund adjustments and merchant closure handling. Reward obligations belong to the issuing merchant, but avoiding a wallet does not automatically remove consumer, advertising, tax or data duties. The earlier coalition pack's legal discussion is background, not a current legal opinion for this narrower product. No prize mechanic, top-up or settlement feature is necessary.

## Minimum agreements and operating records

| Record | Keep it simple and explicit |
|---|---|
| Merchant service agreement | Business identity, locations, fee/tax treatment, setup scope, support hours, cancellation, data export, retention and responsibility for food/payments |
| Customer notice | Merchant identity, final price/currency, acceptance and payment status, complaints/refunds, minimal privacy information |
| Payment connection record, if enabled | Merchant ownership, provider approval/configuration, secret access, test evidence, fees and refund operator |
| Incident and recovery record | Who acted, affected merchant/orders, corrective action, restore reconciliation and notification decisions |
| Later reward rules | Issuing merchant, eligible purchases, earn/redeem/reversal rules, expiry, fulfillment, closure treatment; no unrelated-merchant redemption |

## Prioritized roadmap by evidence

1. **Discovery:** learn the recurring problem and obtain conditional paid commitments.
2. **Readiness:** resolve merchant isolation, selected architecture, basic terms and recovery.
3. **Sellable pilot:** branded browser menu, order acceptance, staff-confirmed direct payment, monthly billing.
4. **Retention:** improve the measured source of support/missed orders, test full-price renewal and sustainable price.
5. **Optional extension:** add same-merchant loyalty or another branch only when owners request it and core renewals already work.

**Next: add the isolation gate to your pilot note.**
