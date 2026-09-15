# Economics, pricing, and funding

All figures below are **illustrative USD planning assumptions**, not Cambodian quotes, market averages, or a financial forecast. Prices exclude any applicable taxes. Formal revenue recognition, tax treatment, and safeguarding need local professional review.

## 1. The recommended starting transaction

Assume 100 coins require $1 of merchant reimbursement. A shop awards reward value equal to 2% of eligible paid purchases. It funds the reward plus a service fee of 10% of that reward value.

For a $5 eligible purchase:

| Movement | Amount |
|---|---:|
| Customer pays the shop for food | $5.00 |
| Customer earns coins | 10 coins |
| Reward obligation funded by shop | $0.10 |
| Service fee paid by shop | $0.01 |
| Total reward program cost to shop | $0.11 |

At scale, $1,000 eligible sales produces $20 reward funding and $2 gross service income. **A 10% markup on 2% rewards yields only 0.2% of sales as operator income.** It is not 10% of merchant turnover.

The customer could later redeem 100 coins at another shop for an agreed item, and that shop would receive $1. Item retail value can differ from reimbursement, but the shop must knowingly accept that economics. For a simple MVP, show the merchant its exact payout before publishing the offer.

This funding structure is inspired by Nectar; these rates are our proposal. [Historical Nectar economics](https://corporate.sainsburys.co.uk/media/yafhro11/j-sainsbury-plc-nectar-deep-dive-event-transcript.pdf)

## 2. Three scenarios

Variables:

- N = active paying shops.
- G = monthly eligible, verified purchase value per shop; not all shop sales.
- r = 2% reward value / eligible purchase value.
- m = 10% operator markup / reward funding.
- S = $15 monthly SaaS price per shop.
- v = 0.06% blended variable-cost allowance / eligible purchase value.
- F = monthly fixed operating budget, including ongoing engineering, field support, hosting, founder labor, and administration as affordable within that budget.

The variable allowance is an unverified simplification for funding/payout charges, messages, and fraud losses. It is not a published bank rate. Replace it with quoted per-transaction, percentage, minimum, and monthly charges before making an investment decision. It could be materially too low.

Formulas:

- Eligible GMV = N × G.
- Reward principal = N × G × r; it is fully funded at 100% potential redemption.
- Gross service income = N × G × r × m.
- SaaS income = N × S.
- Variable costs = N × G × v.
- Operating result before tax = SaaS income + gross service income − variable costs − F.

| Monthly metric | Small pilot | Base case | Larger operation |
|---|---:|---:|---:|
| Active paying shops N | 20 | 100 | 300 |
| Eligible sales per shop G | $2,000 | $6,000 | $8,000 |
| Eligible GMV | $40,000 | $600,000 | $2,400,000 |
| Reward principal funded | $800 | $12,000 | $48,000 |
| Gross service income | $80 | $1,200 | $4,800 |
| SaaS income | $300 | $1,500 | $4,500 |
| Variable costs | $24 | $360 | $1,440 |
| Fixed costs F | $2,500 | $2,500 | $6,000 |
| **Operating result before tax** | **−$2,144** | **−$160** | **$1,860** |

These are independent steady-state scenarios, not month 1/2/3 growth projections. The 20-shop scenario is deliberately larger than the proposed 5–10-shop validation cohort. Initial development, acquisition outlays, legal setup, prizes, and taxes are additional unless explicitly budgeted. None of the scenarios include consumer top-up income or assumed expired-point gains.

### Break-even and sensitivity

Under base per-shop assumptions, contribution = $15 + $12 − $3.60 = **$23.40/month**. At $2,500 fixed cost, break-even is **107 shops**, rounding up. Without SaaS income, contribution is $8.40 and break-even becomes **298 shops**.

If variable costs rise to 0.15% of eligible sales, contribution becomes $18 and break-even becomes 139 shops. If reward value rises to 5% while the markup remains 10%, the shop pays 5.5% of eligible sales; higher operator revenue comes with a much harder merchant value proposition. Do not assume merchants accept that increase.

At a hypothetical $100 merchant acquisition/onboarding cost, base contribution implies 4.3 months to recover it, before churn and ramp-up. This is not a proven CAC or lifetime value.

### Test software pricing carefully

Point hub advertises $99/$159/$259 annual POS plans. Our $15/month offer equals $180/year. That is a reason to test differentiation and willingness to pay, not proof that $15 is appropriate. [Published plans](https://pointhub.io/)

## 3. Merchant return and customer usefulness

If a shop has $6,000 eligible sales, a 2.2% program cost is $132/month. Add the $15 SaaS subscription: $147. At an assumed 50% contribution margin on incremental sales before rewards, the incremental margin after a 2.2% reward cost is 47.8%. Approximately **$307.53 extra monthly sales** would cover $147 / 0.478, assuming the existing software benefit is valued at zero. That is a simplified target, not a measured uplift; capacity, cannibalization, existing promotions, and item margins matter.

Rewards must also feel attainable: at 2%, earning a $1 reward requires $50 eligible spending. At $3 a visit, that is roughly 17 visits. Interview customers about whether this is compelling. Smaller low-cost rewards and explicitly funded campaigns may help; do not quietly increase unfunded issuance.

## 4. Customer top-ups: later-stage economics

If a customer buys 5,000 coins for $50 and merchant reimbursement totals $50, gross spread is zero. With a separately agreed 2% redemption commission, merchants receive $49 and the platform has $1 before processing, refunds, support, and taxes. This is a **different pricing model** from the earned-coin base case, not an additional automatic 10% fee.

A shop must see net reimbursement before accepting purchased coins. Bonus coins also create obligations: selling 5,500 coins for $50 at $0.01 reimbursement creates $55 of reward exposure, requiring a $5 subsidy before other costs. Gold attached to a $50 top-up does not turn the customer's $50 into membership revenue.

Decide whether future customer payments buy fixed-value coins or a separate prepaid currency balance. Either design needs classification and partner review; avoid showing customers two indistinguishable balances with conflicting refund rights.

## 5. Cash available versus money owed

Maintain separate records and appropriately arranged funds coverage for:

1. Unallocated merchant prefunding.
2. Outstanding issued coins at promised reimbursement value.
3. Redeemed coins awaiting merchant payout.
4. Refund/dispute obligations not already counted above.
5. Earned operating fees and equity funding.

Example: $24,000 outstanding-coin exposure + $3,000 unpaid redemptions + $5,000 unused merchant deposits means $32,000 is committed before an additional risk buffer. Do not fund salaries or prizes from it. At redemption, value moves from outstanding coins to merchant payable; it must not be counted twice.

Monthly issuance is not the same as outstanding liability. Keep coverage for earlier cohorts too. The base plan assumes full redemption and no breakage profit. Accounting treatment may differ from this conservative management funding model.

## 6. Prize affordability

Proposed policy: only allocate money after fixed costs, tax provision, required funding coverage, and operating cash buffer. Example planning ceiling: 20% of positive distributable operating surplus. This percentage is a founder choice, not an industry standard.

Even using the larger scenario's $1,860 pre-tax result as an optimistic ceiling, 20% gives $372/month. A hypothetical **$1,500 total campaign budget** takes at least five months to fund, and longer after taxes or buffers. This is not a quote for an iPhone 17 Pro. Get a current local quote covering device, warranty, delivery, promotion administration, and taxes before choosing the prize.

Do not announce a prize dependent on future top-ups or enough ticket sales. Prize campaigns remain subject to report 05's legal review, even if fully funded.
