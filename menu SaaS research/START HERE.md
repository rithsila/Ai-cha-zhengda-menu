# Start here: test a paid menu + ordering service

**Next action: write down three shop owners you can interview. Allow 2 minutes.**

Research date: **9 September 2026 — Cambodia**. Decision draft; demand has not been validated. Research and planning only.

## The decision in 60 seconds

**Recommendation: validate a $19/month, one-location branded menu with a simple staff order queue. Offer assisted setup for $39.** These are proposed test prices, not proven willingness to pay. Start with three independent cafés, tea shops, or takeaway shops in one area you can reach easily. Use Ai-Cha & Zhengda to learn operations, but do not count your own shop as independent demand.

The strongest first promise is: **“Customers see the right menu and your staff receive clear orders on the phone they already use. Customers pay your shop directly.”**

A menu alone is a difficult subscription business. Cambodian-facing products already advertise very low prices and broader packages; see the [current competitor comparison](02-competitors.md). Your proposed advantage is quick onboarding, drink modifiers, understandable Khmer/English screens, and a dependable daily workflow. That advantage must be demonstrated in a busy shop; it is not established by this research.

**Do not begin with loyalty.** Add optional merchant-only stamps or points after merchants renew for the core software. No shared coins, customer top-ups, wallet, cash-out, merchant settlement, or prize draws. One merchant may eventually allow its own branches to share rewards; unrelated businesses never share balances.

## What the repository tells us

There is substantial reusable product code: editable catalogs, modifiers, guest orders, a staff board, an actual ABA PayWay integration, and menu-translation functionality added in the newer checkout. It is still a single-business system. A branch selector does not isolate unrelated merchants. Staff authorization, customer records, settings, payment credentials, translations, and loyalty need explicit merchant boundaries. See [code assessment](04-code-assessment.md).

An earlier local design proposes joining KotStock. This research recommends the same broad destination—shared PostgreSQL with merchant boundaries—but does not assume KotStock's external code is ready. Make that reuse decision before implementation; avoid building a second identity and subscription system if its existing one is suitable. See [architecture](03-mvp-and-architecture.md).

## Read only what you need now

| Need | Open | Estimated reading time |
|---|---|---:|
| Decide who pays and why | [Business model canvas](01-business-model.md) | 5 minutes |
| Check actual advertised alternatives | [Competitors](02-competitors.md) | 6 minutes |
| Decide what to build and reuse | [MVP and architecture](03-mvp-and-architecture.md), [code evidence](04-code-assessment.md) | 18 minutes |
| Check affordability | [Costs and break-even](05-economics.md) | 7 minutes |
| Start validation | [Interviews and 90-day plan](06-validation.md), [risks](07-risks.md), [dated sources](08-sources.md) | 20 minutes; sources optional |

## Can this support a solo developer?

**Possibly, but five or ten shops are validation, not a living.** Under the base assumptions, a $19 subscription contributes $12.17 after variable cash costs and time spent serving each shop. It takes about **95 paying shops** to cover $150 fixed monthly cash costs plus $1,000 for founder work/living beyond that service time. At $29, the comparable threshold is **52 shops**. These figures exclude tax, acquisition/churn costs and initial development recovery; the [economics report](05-economics.md) shows the arithmetic and support sensitivity.

The biggest constraint is likely support and sales time, not image storage. Do not sell unlimited customization, 24/7 personal support, or a full POS replacement at the pilot price.

## Your first five actions this week

1. **List 10 nearby prospects — 30 minutes.** Choose shops with an owner present and frequent menu changes or order mistakes.
2. **Arrange five 25-minute interviews — 45 minutes of outreach.** Use the script in [validation](06-validation.md). No messages were sent during this research.
3. **Observe two busy periods — 45 minutes each.** Count repeated questions, re-entry of orders, and corrections before showing a demo.
4. **Compare two competitor demos — 30 minutes each.** Ask owners to compare the same drink-modifier and sold-out scenario. Record all quoted fees.
5. **Present the $19 + $39 pilot offer to three qualified owners — 20 minutes each.** Seek conditional written commitments with an explicit launch-readiness condition. Do not promise a launch date or take money for unavailable service.

## How to read the evidence

**Fact:** observed code or a provider's published page. **Inference:** our interpretation. **Assumption:** a proposed input or target. **Unknown:** needs an interview, test, quote, or professional answer. A published product claim is evidence of advertising, not verified adoption or reliability.

**Next: write the first three owner names in a note.**
