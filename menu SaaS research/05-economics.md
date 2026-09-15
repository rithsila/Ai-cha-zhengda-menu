# Pricing, costs and break-even

**Next action: replace the $1,000 founder-income target with your own monthly requirement — 2 minutes.**

9 September 2026. All figures are USD unless stated. **Model assumptions are not quotes, actual bills, market salaries or forecasts.** Results are before tax. Food payments and merchant reward costs are outside platform revenue.

## Offer to test

| Experiment | Proposed charge | Boundaries and decision |
|---|---:|---|
| Initial paid pilot | **$19/month/location + $39 setup** | One branded menu, up to 100 items, three staff accounts, pickup/counter workflow; assisted initial upload and one training session, capped at two hours |
| Higher-value test | **$29/month/location + $39 setup** | Test with a comparable later cohort after evidence of value. Record objections and actual renewals; do not pretend a small cohort is a statistically strong price experiment |
| Menu-only fallback | **$9/month**, optional separately priced setup | Test only if ordering adds too much work; ongoing owner edits must be self-service |
| Optional later loyalty | **+$5/month/merchant** | Same-merchant stamps/points; reward fulfillment paid by merchant. Price and incremental support cost unproven |
| Later extra branch | Test **+$10–$15/month** within same merchant | Not included in pilot economics. Each branch adds training/support; do not sell unlimited outlets at the initial price |

Provide a written service scope and cancellation policy. Do not use perpetual discounts to conceal a price merchants reject. Skip annual prepayment until two monthly renewals establish demand; annual cash collected would still need to fund future service.

For interview price cards only, an **assumed** 4,000 KHR per USD makes $19 = 76,000 KHR and $39 = 156,000 KHR. This is arithmetic, not the current exchange rate or a required merchant conversion policy.

## Published infrastructure anchors

| Official source, checked 9 September 2026 | Observed price | Meaning for this model |
|---|---|---|
| [Railway](https://railway.com/pricing) | Hobby $5 minimum with $5 usage credit; Pro $20 minimum with $20 usage credit, excess usage charged | These are minimums, not an all-inclusive API/database bill. The $50 API/database allowance below is a planning input, not a Railway package |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | Standard storage $0.015/GB-month; Class A $4.50/million and Class B $0.36/million; no Internet egress charge. Monthly free allowance: 10 GB, 1m A and 10m B operations | Images need storage and request estimates. Free storage does not make all surrounding compute, image transforms or backups free |

Example workload assumption: 50 merchants × 100 photos × 200 KB = roughly **1 GB** of optimized images before originals/backups. Fifty staff boards polling every five seconds for 12 hours/day produce about **12.96 million order-list requests/month**. These are API calls, not R2 reads. Query size, concurrent checkouts and retries matter more than merchant count alone. Use cache headers for public content, bounded order queries and paused/less frequent polling when appropriate; test before budgeting for 100 shops.

For an implementation, choose a database service with demonstrated recovery features and verify its actual price. A PostgreSQL process hosted on an application platform is not automatically a fully managed database service. Provider availability targets do not become your service guarantee.

## Monthly fixed cash budget — assumed base

| Cost group | Assumed monthly amount | Included / excluded |
|---|---:|---|
| API/database, frontend/media headroom | **$60** | $50 API/database + $10 frontend/media allowance; not a purchased bundle |
| Backup and monitoring | **$20** | $10 independent backup + $10 monitoring/error allowance; restore labor separate |
| Domain, email and basic operating tools | **$20** | $2 domain amortization + $8 email + $10 tools; no paid ads |
| Accounting/admin reserve | **$50** | Placeholder; obtain local scope/quote. Setup advice and actual taxes separate |
| **Total fixed cash F** | **$150** | No founder salary, acquisition campaign, office, hardware or development recovery |

Budget range: roughly **$80–$250/month** in fixed cash for a modest shared deployment, depending on provider recovery, administrative needs and actual usage. Use $150 for consistent comparisons, not a claim it supports every workload. At 100 merchants, remeasure costs instead of extrapolating blindly.

## Per-merchant monthly assumptions

| Input | Base assumption | How to replace it |
|---|---:|---|
| Subscription P | **$19** | Actual collected subscription excluding applicable tax/discounts |
| Variable cash V | **$1** | Incremental usage/messaging/collection allowance; no routine customer SMS and no platform food-payment processing |
| Service time T | **35 minutes** | 25 support/menu-help minutes + 10 billing/collection minutes; measure all messages and payment chasing |
| Service labor value W | **$10/hour** | Founder opportunity-cost assumption, not a Cambodian salary benchmark |
| Extra founder budget D | **$1,000/month** | For remaining product/sales/admin work and living needs, beyond separately valued service labor |

The time value is an economic cost even if you do the work yourself and no salary is paid. The extra founder budget is separate to avoid silently assuming unlimited unpaid engineering. If you instead use one all-inclusive founder salary, remove the separate service labor cost before recalculating; do not count the same time twice.

## Formulas

Let N = paying locations. In the one-location pilot, locations and merchants are equal.

`cash contribution per location = P − V`

`contribution after service time C = P − V − (T / 60 × W)`

`monthly result before founder budget = N × C − F`

`founder-budget result = N × C − F − D`

`break-even locations = round UP((F + D) / C)`

At the base inputs, C = 19 − 1 − (35/60 × 10) = **$12.1667**, displayed as $12.17. Use the unrounded value for thresholds. Setup revenue, acquisition/churn and taxes are excluded here and treated separately below.

## Three meanings of break-even

| Threshold | $9 subscription | $19 subscription | $29 subscription |
|---|---:|---:|---:|
| Cover $150 fixed cash only, ignoring founder time | 19 locations | **9 locations** | 6 locations |
| Also value 35 minutes of service/location | 70 | **13** | 7 |
| Also allow $1,000/month extra founder budget | 531 | **95** | **52** |

Same service assumptions are deliberately held constant to expose price sensitivity; a true $9 self-service menu would need materially less support. Nine customers covering cash bills does not mean the business supports you.

## Monthly scale scenarios at $19

| Paying locations | Subscription revenue | Cash result after V and F | Result after service labor and F | Result after additional $1,000 founder budget |
|---|---:|---:|---:|---:|
| 3 | $57 | −$96 | −$113.50 | −$1,113.50 |
| 20 | $380 | $210 | $93.33 | −$906.67 |
| 50 | $950 | $750 | $458.33 | −$541.67 |
| 100 | $1,900 | $1,650 | $1,066.67 | $66.67 |

These are steady-state arithmetic scenarios, **not a 90-day acquisition forecast**. They exclude the cost of finding/replacing merchants. At 100 locations, service alone is about 58.3 hours/month before selling, maintenance, new onboarding and incident response.

## Support, churn and acquisition can change the result

| Sensitivity, all other base inputs unchanged | Result |
|---|---|
| 15 minutes service/location/month | C = $15.50; founder-budget break-even **75** locations |
| 60 minutes service/location/month | C = $8; break-even **144** locations |
| 90 minutes service/location/month | C = $3; break-even **384** locations; this workload is impractical solo |
| Fixed cash rises from $150 to $250 | Base service contribution unchanged; break-even **103** locations |
| 5% monthly merchant churn, $85 acquisition cost to replace each lost merchant | Replacement allowance $4.25/location/month; C falls to $7.9167; break-even **146** locations before setup contribution |

“Churn” means a paying merchant stops paying. Five percent is a stress-test assumption, not an industry benchmark. At 100 locations it means replacing five merchants monthly just to stay level.

**Acquisition example:** six hours of prospecting/demos per won merchant × $10 plus $25 travel = **$85 acquisition cost**. Separately, two hours setup × $10 plus $10 signage/materials = **$30 onboarding cost**. A $39 setup fee leaves $9 toward acquisition. Net unrecovered launch cost is $76, taking **6.25 months** at C = $12.1667 to recover, assuming the merchant stays. Without the setup contribution, $85/C = **6.99 months**. Cash-only acquisition looks cheaper because your hours are not a bill; track both.

A crude lifetime contribution at 5% churn is C/0.05 = $243.33, before fixed costs, tax and development. This assumes stable churn and margin indefinitely; a three-shop pilot cannot validate it. At 10% churn, replacement cost becomes $8.50/location/month and the business is much harder to sustain. Never use this rough lifetime figure to justify large ad spending.

## Merchant payback example — assumption

At an assumed $1 contribution per additional drink sold, the $19 fee needs 19 genuinely additional monthly drinks to pay for itself. Alternatively, 10 minutes saved/day × 26 days × an assumed $2/hour labor value is only **$8.67/month**. Time saved is not automatically cash saved if staffing does not change. Avoid claiming the software pays for itself from either hypothetical alone; compare actual waste, error reduction and staff time.

For later loyalty, reward food cost belongs to the merchant. An assumed $0.80-cost reward every ten $2 paid drinks is $0.80 cost per $20 qualifying sales, or 4% before labor and cannibalized full-price purchases. That is a merchant promotion cost, not your revenue or a required default program.

## First 90-day spending and engineering

| Cash item | Assumed envelope |
|---|---:|
| One-off local accounting/legal/setup advice | $500–$1,000 |
| Discovery travel, pilot signage and training materials | $100–$200 |
| Three months fixed operating cash at $150 | $450 |
| Contingency, 20% of above subtotal | $210–$330 |
| **Total cash envelope** | **$1,260–$1,980** |

The one-off advice scope is separate from the monthly admin reserve; remove overlap in actual quotes. The travel/signage envelope covers early pilot acquisition/onboarding cash—do not add those same costs again from the unit example. This is a gross funding envelope before pilot receipts, not the projected net loss.

Excluded: founder living costs (add $3,000 if your cash need is $1,000/month), government/tax charges not yet quoted, new devices, independent specialist audit, and ongoing acquisition beyond the pilot. Borrow existing merchant phones and do not promise hardware. An additional $1,000 reserve may be needed if external security/payment expertise is required; obtain scope before committing.

**Engineering assumption: 140–240 focused hours** after discovery for merchant boundaries/auth, configurable branding/catalog, guarded order workflow, billing operations, migrations, tests and restore proof. That is roughly **5–8 weeks at 30 hours/week**, or **7–12 weeks at 20 hours/week**. It excludes loyalty, inventory, custom integrations and native apps. Reuse the newer checkout's translation editor; do not budget a duplicate editor. AI translation-provider charges are excluded: keep AI drafting disabled for the base offer, or meter and price it separately after obtaining a current provider quote. Existing KotStock reuse may reduce the estimate; hidden access/payment issues may increase it. This is a planning estimate from source review, not a delivery quote.

At the illustrative $10/hour value, initial development is $1,400–$2,400 of opportunity cost. Recovering it over 12 months adds $116.67–$200 monthly to the model. The base $19 founder-budget threshold then becomes **105–111 locations**, still excluding churn/tax. Limited founder time can push the pilot beyond 90 days; reduce scope or move the dates rather than skipping isolation checks.

**Next: write your monthly personal cash requirement beside the $1,000 assumption.**
