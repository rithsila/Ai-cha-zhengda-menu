# Dated source register and evidence limits

**Next action: recheck a provider's pricing page before using its price in a sales comparison.**

Research/access date for every entry: **9 September 2026**, Cambodia local date. “Undated” means no reliable publication/update date was established on the relevant page; a crawl date or copyright year is not a publication date. Prices/features are paraphrased in the competitor report. No full copyrighted pages are reproduced.

## Method

Inspected this repository and prior coalition research, searched current Cambodian QR-menu/POS offerings and official infrastructure documentation, opened relevant provider pages, and used official Cambodian business resources plus a dated professional privacy guide. Prioritized operator price pages over comparison blogs. Search-index-only evidence and failed opens are explicitly marked. No outreach, vendor login, contract quote, actual merchant deployment test or legal consultation occurred.

Source reliability is claim-specific: an official price page is strong evidence of the advertised price, not proof of uptime, paying-user count or fit for a Cambodian merchant. This is a practical shortlist, not an exhaustive market census.

## Core merchant-software sources

| ID | Source / direct URL | Published/updated | Retrieval and use |
|---|---|---|---|
| C01 | [Tenh Ey](https://www.tenhey.store/) | Undated | Opened readable operator page. Menu/order tiers, product limits and Cambodia positioning |
| C02 | [Menuy](https://menuy.app/) | Undated | Opened readable operator page, including price section. Browser/Telegram offering and tier limits; no independent traction verification |
| C03 | [khmer.menu](https://khmer.menu/) | Undated | Opened readable operator page. Menu versus ordering packages; marketing performance claims not adopted |
| C04 | [Point hub](https://pointhub.io/) | Undated | Opened readable operator page and pricing section. Annual billing, POS/menu/membership overlap; package entitlements need quote |
| C05 | [OXOCO pricing](https://app.oxoco.com/pricing) | Undated | Opened readable operator page. Per-location software price, advertised feature coverage and Cambodia contact |

| ID | Source / direct URL | Published/updated | Retrieval and use |
|---|---|---|---|
| C06 | [POS KH](https://www.poskh.net/) | Undated | Opened readable operator page. Monthly/annual prices, unlimited-store claim; annual panel additionally advertises one extra month free, eligibility/renewal effect unverified |
| C07 | [Loyverse global pricing](https://loyverse.com/pricing) | Undated | Opened readable operator page. Free core and regional currency/unit differences preserved |
| C08 | [Loyverse US pricing](https://loyverse.com/en-us/pricing) | Undated | Detailed official search extract. Conflicts with global employee-management billing unit; used to flag uncertainty, not quote Cambodian card rates |
| C09 | [POSFlow support](https://posflowkh.com/our-services/sla-support) | Undated | Opened readable operator page. Support-only pricing, not complete POS cost |
| C10 | [MPOS pricing](https://www.m-pos.cc/en/pricing) | Undated | Official page located; direct open had no readable content. No numerical price accepted |

## Watchlist and payment sources

| ID | Source / direct URL | Published/updated | Retrieval and use |
|---|---|---|---|
| W01 | [Khmer Digital PRO](https://khmer-digital.web.app/pricing) | Undated | Search extract contained price claims; direct open failed. Watchlist only, not a core verified comparison |
| W02 | [BROWN card](https://www.browncoffee.com.kh/page/Brown_Card/) | Undated | Prior pack reference; attempted direct open failed. No prior earning rate promoted to freshly verified evidence |
| P01 | [ABA PayWay official product site](https://www.payway.com.kh/km/) | Undated | Official indexed content identifies payment products. No app-specific fee or provider agreement verified |
| P02 | [ABA PayWay Shopify page](https://www.payway.com.kh/km/shopify/) | Undated | Official search extract showed product-specific promotion; direct open empty. Used only to explain why rates cannot be generalized |
| P03 | [ABA developer exchange-rate overview](https://www.payway.com.kh/developers/exchange-rate/) | Undated | Official indexed overview located; direct open empty. Context only; no live exchange rate obtained or used |

Do not infer absence of a competitor's fee from absence of published details. Obtain taxes, setup, hardware, locations, minimum term, customer support, bank charges, data export and cancellation in a dated quote. Page contents and promotions may change after this access date.

## Technical and cost sources

| ID | Source / direct URL | Published/updated | Retrieval and use |
|---|---|---|---|
| T01 | [Railway pricing](https://railway.com/pricing) | Undated | Opened operator page. Minimum plan charges and included credits; cost allowances in this report are independent assumptions |
| T02 | [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) | Page says **7 August 2026** | Opened/read pricing and allowance sections. Standard storage/operations/egress; excludes surrounding services |
| T03 | [PostgreSQL row-security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Version 18 documentation; publication date not established | Opened official documentation. Database policy behavior and bypass-role caveat |
| T04 | [Appropriate uses for SQLite](https://www.sqlite.org/whentouse.html) | Undated | Opened official documentation. Single-writer constraint and workload-dependent suitability |
| T05 | [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) | Update date not established | Opened official documentation for context. No Workers-specific numerical tariff used in the model |

## Business, consumer and privacy sources

| ID | Source / direct URL | Published/updated | Retrieval and use |
|---|---|---|---|
| L01 | [KHMERSME business licenses](https://www.khmersme.gov.kh/en/laws-and-regulations/business-licenses/) | Undated | Opened official resource index; includes e-commerce and registration instruments. Does not classify this proposed SaaS |
| L02 | [Cambodia business registration portal](https://registrationservices.gov.kh/) | Dynamic portal; publication date not established | Official search content retrieved. English variant supplied indexed guidance but later direct open errored. No exact fee/time claim used |
| L03 | [CCF](https://www.ccfdg.gov.kh/) | Undated | Official indexed authority page. Starting point for consumer-protection questions; no specific legal exemption asserted |
| L04 | [DLA Piper Cambodia privacy guide](https://www.dlapiperdataprotection.com/guide.pdf?c=KH) | **13 February 2026**, shown in PDF | Opened nine-page professional guide. Existing privacy/e-commerce context; February draft-law status explicitly not treated as current September enactment status |

Professional confirmation still needed: actual entity/tax classification, invoice requirements, current privacy law and cross-border data rules, product-specific promotion obligations, and bank agreement permissions. No exact tax rate or legal exemption is assumed.

## Repository evidence

Initial source snapshot: HEAD `9115067cffaea8e33327f9ed5e4c4d5fc116a39e`. Final targeted recheck: `ffb944d565798a69c9953d8bd35f75d465aebd77`. Other work advanced the checkout during the interrupted research; this task did not make those application changes. Paths refer to the current working tree. Static inspection only. The detailed [code assessment](04-code-assessment.md) gives original observations, approximate initial line references and the final translation update.

| Group | Files reviewed | Use |
|---|---|---|
| Project context | [CLAUDE.md](../CLAUDE.md), [root package](../package.json), [API package](../apps/api/package.json), [INFRA.md](../INFRA.md) | Intended stack, commands and documentation drift; not production proof |
| Data/authorization/payment | [schema](../apps/api/prisma/schema.prisma), [API app](../apps/api/src/app.ts), [auth](../apps/api/src/auth.ts), [database](../apps/api/src/db.ts), [loyalty](../apps/api/src/loyalty.ts), [R2](../apps/api/src/r2.ts) | Merchant gaps, real payment implementation, global state, storage and concurrency architecture |
| Customer/staff surfaces | [menu App](../apps/menu/src/App.tsx), [catalog hook](../apps/menu/src/hooks/useCatalog.ts), [staff App](../apps/staff/src/App.tsx), related component/test file inventory | Dynamic catalog/fallback, branding and polling; no browser execution |
| Existing SaaS direction | [8 September 2026 menu/stock/profit design](../docs/superpowers/specs/2026-09-08-menu-stock-profit-saas-design.md) | Proposed KotStock reuse and scope conflict. Companion code not independently inspected |
| Newer checkout additions | [translation routes](../apps/api/src/translations/routes.ts), [operations runbook](../docs/multilingual-menu-operations.md), schema/catalog-hook diffs and translation file inventory | Locale/review/revision foundations now present; tenant isolation still missing; tests not run |

## Previous coalition research reviewed

| Files | What carries forward | What does not |
|---|---|---|
| [Overview](source-snapshots/coalition-2026-09-09/README.md.txt), [canvas](source-snapshots/coalition-2026-09-09/01-business-model-canvas.md.txt), [market](source-snapshots/coalition-2026-09-09/02-cambodia-market-and-competitors.md.txt) | Merchant interviews and competing software matter | Shared-neighborhood reward proposition |
| [Economics](source-snapshots/coalition-2026-09-09/03-economics-and-pricing.md.txt), [operating model](source-snapshots/coalition-2026-09-09/04-program-operating-model.md.txt) | Label assumptions and distinguish food money from revenue | Funding spreads, shared wallet, settlement, top-ups and prize budgets |
| [Regulatory review](source-snapshots/coalition-2026-09-09/05-feasibility-and-regulatory-review.md.txt), [validation](source-snapshots/coalition-2026-09-09/06-validation-and-launch-plan.md.txt) | Exact-flow local advice and measurable pilot gates | Coalition legal conclusions or cross-shop success metrics |
| [Project readiness](source-snapshots/coalition-2026-09-09/07-current-project-readiness.md.txt), [sources](source-snapshots/coalition-2026-09-09/08-sources.md.txt), [new-direction prompt](source-snapshots/coalition-2026-09-09/09-menu-saas-research-prompt.md.txt) | Tenant gap and explicit narrower software scope | Assumption that old README/payment descriptions still reflect source |

The old pack is dated 9 September 2026. Its folder was removed by the newer repository history. Links in the table above point to **exact plain-text snapshots from the initial SHA**, saved inside this research folder so the previously reviewed evidence remains available. Embedded links inside those historical text files are preserved as original text, not updated navigation. Its cited pages are not automatically freshly verified here; only the current-source entries above have this pass's retrieval status. No shared-funds or prize requirement was imported into the MVP.

## Evidence still missing

1. Actual merchant willingness to pay and two monthly renewal cohorts.
2. Staff/customer usability on real devices and connections.
3. Executed tenant-isolation, payment and restore tests for the future SaaS implementation.
4. Written provider/accounting/legal quotes and approvals where applicable.
5. Actual support minutes, acquisition cost, churn and production infrastructure bills.

**Next: add the date to the first competitor quote you obtain.**
