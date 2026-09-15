# Interviews and a 90-day validation plan

**Next action: put three merchant names in the prospect template below — 2 minutes.**

9 September 2026. A proposed founder-led experiment. No interviews, outreach, merchant agreements or payments were completed during research. Targets below are management choices, not established benchmarks.

## Days 1–14: prove a recurring problem

Allocate **8–12 hours total** for ten owner interviews, two busy-period observations, notes and travel. Choose nearby single-outlet businesses; include owners who use competing tools and owners who still use paper. Your own shop is an operational test site, not independent proof of demand.

Show the product only after understanding the current workflow. Ask for recent examples, not guesses about whether software sounds useful. Record permission before retaining photos, recordings or transaction evidence; anonymized counts are enough.

### Owner questions: current behavior — 25-minute interview

1. “Walk me through the last order from customer request to pickup. Where is it written, and who sees it?”
2. “What was the last wrong or missed order? What happened, and what did correcting it cost?”
3. “When did you last change a price or mark something sold out? Show me every place you updated.”
4. “What software, printing, messaging or hardware do you pay for now? Who decides whether to replace it?”
5. “When the internet fails or your cashier is absent, how does the shop keep taking orders?”

### Owner questions: proposed offer — final 10 minutes

1. “Which step would this remove? Would staff still need to copy the order into your current POS?”
2. “Who would maintain menu photos, prices and Khmer/English text each week?”
3. “Compare this $19/month + $39 setup offer with your current tool. Which would you choose today, and why?”
4. “What would stop you renewing after one month? Which result would justify the fee?”
5. “If the stated launch checks pass, would you agree in writing to a paid pilot on these terms? Who else must approve?”

Do not negotiate against yourself immediately after an objection. Record whether the issue is price, missing functionality, no problem, mistrust or support burden. A conditional signature is stronger than praise, but it is still weaker than a renewal payment.

### Staff observation — 45 minutes per shop

1. Count a sample of 20 order attempts: repeated questions, modifier corrections, re-entry steps and missed alerts.
2. Ask a staff member to change one availability flag without coaching; record seconds and help needed.
3. Demonstrate submitted versus accepted versus paid with a paper order example; ask staff to explain each.
4. Check phone sharing, device sleep, charging, sound restrictions and backup connectivity.
5. Ask which new screen or extra step would make them stop using the tool during a rush.

### Customer questions — five minutes each, ten customers

1. “How did you find this shop's menu today, and was anything unclear?”
2. “Scan this example menu in your normal browser. Find one item and its final price.”
3. “Choose a size and topping. What do you expect to happen after pressing order?”
4. “How would you know the shop accepted it and whether you have paid?”
5. “Would you order without Telegram or an account? If you join this shop's rewards later, where do you expect to redeem them?”

Do not force loyalty into initial ordering tests. If tested later, show two different merchant names and ask the customer to explain why balances cannot be spent at the other business.

## Days 15–30: validate the offer and prepare engineering

Allow **10–15 founder hours** for competitor comparisons, pilot terms and training-flow tests, plus up to one engineering day to evaluate KotStock reuse. This phase does not require modifying production code.

| Deliverable | Proposed gate |
|---|---|
| Problem evidence | At least 5 of 10 owners show a recurring problem; at least 3 can describe an operational benefit worth testing |
| Conditional paid commitments | Three unrelated merchants accept the written $19/month + $39 setup scope, subject to readiness; do not count free trials or your own shop |
| Staff prototype | Three staff can complete an order/sold-out exercise with no critical misunderstanding; record where help was needed |
| Architecture decision | One selected merchant-isolation route; verified reuse decision; explicit engineering budget and exclusions |
| Operating readiness plan | Named payment responsibilities, reviewed business/tax questions, backup design, support hours, cancellation and data handling terms |

**If fewer than three commit:** revise the segment or offer once and interview five more owners. If the problem remains weak, stop the SaaS rebuild. A setup/maintenance service using an existing product is a valid alternative to owning a platform.

## Days 31–60: build only after demand gates pass

This is **future work**, not work executed by this research. At 30 focused engineering hours/week, this window supplies roughly 129 hours, so the 140–240-hour estimate can extend beyond day 60. Reuse and scope determine the actual launch date.

1. Implement the chosen merchant identity/data boundaries and neutral configurable menu.
2. Make order acceptance/payment recording reliable on real devices; add manual subscription administration.
3. Prove the isolation, retry, staff revocation and restore scenarios in the code-assessment report.
4. Train one merchant for 30–45 minutes and observe its first real session only after readiness passes.
5. Add the other two merchants gradually; keep a daily incident log and a weekly 15-minute review per shop initially.

During the pilot, proposed staffed support hours are **08:00–18:00 Cambodia time, Monday–Saturday**, with best-effort response during those hours and no 24/7 promise. Choose shops whose operating hours fit or agree a different bounded window before signing. The app may be available outside those hours, but the founder is not continuously available. A paper fallback remains necessary.

Early pilot reviews exceed the mature 35-minute/month service assumption. Record that separately: the model becomes credible only if routine support drops after onboarding. Cap new onboarding at two shops per week until actual time supports more.

## Days 61–90: measure use and ask for renewal

Run the pilot only as long as readiness allows. To observe **two monthly renewals** by day 90, a shop must start around day 30; that is not realistic for a full rebuild begun on day 31. If launch is day 60, day 90 can show only the **first renewal**. Keep the second-renewal gate open until day 120; do not claim it passed early.

### Commercial and support scorecard

| Metric | Exact denominator | Proposed continuation target |
|---|---|---|
| Activation | Signed pilots whose menu is published and staff independently complete a real order | All 3; diagnose any failed activation before adding shops |
| First paid renewal | Merchants paying the next full-price invoice / merchants whose renewal has become due | At least 2 of 3; record count and reason for the third |
| Second renewal | Merchants paying their second renewal / merchants eligible by elapsed time | At least 2 of original 3; may fall after day 90 |
| Routine service time | All support + collection minutes, excluding initial setup, per merchant-month | At most 35 after first month; any shop over 60 needs investigation/repricing |
| Meaningful use | Active pilot shops recording orders on at least 4 trading days in each of the last 2 weeks | At least 2 of 3, unless shop trades fewer days; define that exception before pilot |

### Product and safety scorecard

| Metric | Measurement | Proposed gate |
|---|---|---|
| Order delivery | Persisted accepted submissions that appear on connected staff board within 10 seconds | At least 99%; investigate every missed order; small samples cannot establish high reliability |
| Correctness | Duplicate charges/orders, cross-merchant reads/writes, unexplained payment-state errors | Zero unresolved critical incidents; pause expansion immediately if any occur |
| Daily benefit | Same shop before/after: modifier corrections, menu-update time, staff re-entry | At least 2 shops show a concrete improvement they value; do not claim causal sales uplift |
| Onboarding | Founder menu import, account setup, QR preparation and training time | No more than 2 hours typical once template stabilizes |
| Recoverability | Restore with orders, settings and media references reconciled | Demonstrated before launch; repeat monthly against stated recovery targets |

Record total scanned sessions, attempted submissions, persisted orders, staff acknowledgements, completed orders and confirmed payments separately. This reveals whether “low conversion” is customer choice, a broken submit, or staff ignoring the board. Avoid invasive visitor tracking; aggregate counts are enough for the pilot.

Compare matched trading days before/after and note promotions, closures and holidays. Loyal customers may self-select into ordering; higher spending among users is not proof the app caused it. Merchant explanations plus renewal are more useful than a dashboard with large unqualified numbers.

## The day-90 decision

| Result | Action |
|---|---|
| At least two full-price renewals, useful daily workflow, support nearing target, launch gates maintained | Continue cautiously to 5–10 paying merchants; test $29 with new prospects; wait for second-renewal evidence |
| Owners want browsing but staff reject another queue | Test $9 self-service menu or an assisted setup service; do not quietly build a full POS |
| Owners demand existing-POS sync before paying | Investigate one concrete provider/export route with permission and cost; decline unsupported custom integrations |
| Fewer than two renewals or persistent support above sustainable cost | Stop expansion, interview cancellations, revise once; do not add loyalty to conceal weak core demand |
| Critical data/payment incident or failed restore | Pause affected ordering/onboarding, recover and fix before resuming regardless of revenue |

## Lightweight record templates

### Prospect note — duplicate once per shop

| Field | Fill in |
|---|---|
| Shop, area, owner/decision maker, contact permission | |
| Current tool and complete known monthly/yearly cost | |
| Last specific problem and observed frequency | |
| $19 + $39 offer reaction; competitor preference | |
| Next agreed step/date; commitment status | |

### Weekly founder review — 20 minutes each Friday

1. Count interviews, qualified prospects, active shops and actual collected subscriptions.
2. Review missed/duplicate orders, payment discrepancies, backup status and support minutes.
3. Record hours spent selling, onboarding, maintaining and collecting payment.
4. Compare cash runway and contribution with the assumptions in economics.
5. Choose one next-week improvement supported by evidence; postpone unrelated feature requests.

### Interview invitation draft — not sent

“I'm researching a simple digital menu and order board for nearby cafés and takeaway shops. Could I spend 25 minutes understanding how you update menus and handle orders today? I would like to learn about your current process before showing an offer. Customers would continue paying your shop directly.”

Use a fluent Khmer review before sending a Khmer translation. This invitation makes no sales or revenue guarantee.

**Next: enter the first merchant name in the prospect note.**
