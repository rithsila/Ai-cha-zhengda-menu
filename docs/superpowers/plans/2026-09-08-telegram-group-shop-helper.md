# Telegram Group Shop Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:subagent-driven-development only if delegation is requested. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Telegram bot a useful group entry point for the mini app, with every availability claim following the settings saved in the staff portal.

**Architecture:** Keep `apps/staff` and its existing system configuration as the operational source of truth. The bot reads the same API configuration helpers for each command; the mini app refreshes settings on entry and checkout; the order API remains the final authority. Use group-safe Telegram links for browsing and private bot chat for reports and personal information.

**Tech Stack:** Existing Telegraf 4, Express, Prisma/SQLite, React/Vite, Telegram Mini App SDK, Vitest and Supertest. No new external services or AI model.

**Spec:** The approved recommendation in the conversation of 2026-09-08, with the user's additional requirement to follow delivery enable/disable and other staff settings. The behavior contract below is the self-contained design baseline; there is no separate spec document for this request.

**Status:** Planning only. No application code, Telegram settings, or production configuration has been changed.

## Global constraints

- Reuse the existing bot and staff portal. Do not add a second delivery toggle or a bot-only copy of opening hours.
- A saved setting affects the next bot request without a bot restart. Unsaved staff drafts do not affect customers.
- Keep `/delivery` visible when delivery is disabled; explain the current state instead of silently removing help.
- Public messages contain no phone numbers, delivery rooms, balances, order details, or customer complaints.
- Browsing is available when the shop is closed; placing orders follows server rules.
- Use existing Asia/Phnom_Penh schedule evaluation, including overnight schedules and manual overrides.
- Do not expose staff commands or modify manager permissions. Command scopes are discoverability, not authorization.
- Do not claim production readiness from this document alone. Complete automated checks and real Telegram checks below.
- Preserve unrelated work, including `docs/AI_CHA_ZHENGDA_ABA_PAYWAY_UI_FLOW.md`, which was untracked during planning.

## Verified repository context

| Existing file | Responsibility and relevant finding |
| --- | --- |
| `apps/api/src/bot.ts` | Registers only report/feedback; start requires a stored phone before displaying menu; inline `web_app` buttons and contact requests assume private chat; creates its own Prisma client. |
| `apps/api/src/db.ts` | Exports the shared configured Prisma client; use it from bot code. |
| `apps/api/src/store-config.ts` | Exports `StoreStatus`, `getStoreStatus(prisma, now?)`, `getConfigNumber`, `CONFIG_DEFAULTS`; evaluates manual and scheduled opening; includes pickup/delivery/payment flags, shop address, delivery note, menu tabs and social links. |
| `apps/staff/src/components/StoreSettings.tsx` | Saves changed keys through separate parallel `PUT /api/config` calls. Successful saving reloads configuration. This is not an atomic multi-key update. |
| `apps/api/src/app.ts` | Manager-only config writes; order creation checks availability and prices delivery from `deliveryFee`; cash also depends on customer tier and `allowCashForStandard`. Payment availability considers `getAbaClient()`, which is currently local to `createApp`. |
| `apps/menu/src/utils/storeStatus.ts` | Cached status with 15-second refresh deduplication; refresh supports a force flag; failures retain last-known status. |
| `apps/menu/src/components/CheckoutModal.tsx` | Already disables fulfillment methods, switches valid selections and checks availability. Fee and cash eligibility come from separate config/profile data. |
| `apps/menu/src/App.tsx` | Owns menu/orders/rewards/account tabs; entry links need a small allowlisted start parameter adapter. |
| `apps/api/src/app.ts` order status route | Supports pending/preparing/ready/completed/cancelled/paid; currently sends cancellation notifications but no ready notification in this handler. |

## Customer behavior contract

### Commands and entry points

| Scope | Command | Response |
| --- | --- | --- |
| Group and private | `/menu` | Shop name, concise live availability, Open Menu URL button. |
| Group and private | `/hours` | Current open/closed state, scheduled hours labeled Cambodia time, manual override explanation when relevant. |
| Group and private | `/delivery` | Delivery enabled/paused/closed state, current configured fee when enabled, eligible pickup alternative and Open Menu button. |
| Group and private | `/location` | Saved address; map button only for an enabled, valid configured maps link. |
| Group and private | `/help` | Ordering steps and Contact support privately button. |
| Private suggestions | `/orders` | Open My Orders button; never print history in a group. |
| Private suggestions | `/rewards` | Open My Rewards button; preserve existing rewards and lucky-wheel visibility rules. |
| Private suggestions | `/report`, `/feedback` | Existing report workflow, stored and delivered to authorized managers. |
| Any received scope | `/start` | Group: menu/help entry. Private: show menu immediately, even without a stored phone. Recognize support deep-link payload. |

If someone manually sends orders/rewards/report/feedback in a group, return only a private-chat or personal Mini App entry button. Do not persist or forward report text from the group. Do not quote it back. Previously posted text is already public: this behavior does not remove the user's message.

Register default/private/group scopes deliberately so the old default report/feedback list does not leak into the group suggestion list. Support `/menu@bot_username`. Keep privacy mode enabled; no administrator role is required for ordinary command replies. The group owner manually pins the welcome message.

### Staff settings compatibility matrix

| Saved state | Bot behavior | Mini app / API behavior |
| --- | --- | --- |
| Open, delivery on, pickup on | Both methods described as available. | Both selectable subject to payment eligibility. |
| Delivery off, pickup on | “Delivery is temporarily unavailable. Pickup is available.” | Delivery disabled; existing delivery selection replaced only with valid pickup. |
| Delivery on, pickup off | Delivery available; no pickup suggestion. | Pickup disabled. |
| Both methods off | “Online ordering is temporarily unavailable. You can still browse.” | Checkout disabled, including direct API requests using omitted or invalid order type. |
| Closed, delivery flag on | “Shop is closed now. Delivery ordering is unavailable.” | Browsing works; new orders rejected. Do not promise scheduled preorders. |
| Manual closed during scheduled hours | Explain temporary closure; display regular hours separately. | Follow manual override. |
| Manual open outside regular hours | Open now; regular hours remain informational. | Follow manual override. |
| Delivery fee changes | Read numeric fee using the same helper/default as order creation. Zero displays Free; nonzero displays USD amount. | Checkout and server totals use saved fee. |
| Cash disabled or restricted by tier | Do not promise cash to every group member. Help says “Available payment options appear at checkout.” | Preserve cash switch plus gold/standard eligibility. |
| KHQR enabled but ABA unavailable | Do not claim online payment is operational based on the switch alone. | Use existing payment availability endpoint and current provider checks. |
| All usable payments unavailable | Generic group copy does not promise immediate checkout. | Explain no payment option for this customer; do not submit an invalid order. |
| Address/social maps link edited | Next location command uses saved values. | Existing shop information updates normally. |
| Brand/tab disabled or item unavailable | Bot links to general menu; no static brand/product listing. | Existing catalog and staff visibility rules remain authoritative. |
| Lucky draw disabled | Rewards shortcut still opens existing rewards view; no spin promotion. | Respect `luckyDrawEnabled`; do not bypass disabled features. |

Delivery note is descriptive text, not pricing authority. The current default note says delivery is free and can conflict with an edited fee. Public bot replies should show authoritative numeric pricing and a neutral area statement (“Check delivery address eligibility in the menu”), without repeating `shopDeliveryNote`. Keep the note editable for the existing app; label it in staff settings as descriptive copy that must agree with the fee. Do not invent delivery radiuses or ETAs.

Previously sent bot messages are snapshots. Include “Availability checked now; checkout confirms current options.” in dynamic availability replies. The pinned welcome message must contain no volatile fee/hours/open-status claims. Old Open Menu links always load current app data. No job edits every historical group message.

## File map

Create:
- `apps/api/src/bot-shop.ts`: live shop read model and pure public reply rendering.
- `apps/api/src/bot-links.ts`: validated Telegram launch/private-chat URLs.
- `apps/api/src/bot-commands.ts`: scoped registration and injectable command handlers.
- `apps/api/tests/bot-shop.test.ts`, `bot-links.test.ts`, `bot-commands.test.ts`: focused bot contract tests.
- `apps/api/tests/bot-staff-settings.test.ts`: saved staff configuration → bot/API integration tests.
- `apps/menu/src/utils/telegramStartParam.ts`: allowlisted destination parsing.
- `apps/api/src/order-ready-notification.ts`, `apps/api/tests/order-ready-notification.test.ts`: transition wording and notification tests.
- `docs/telegram-group-launch.md`: setup, staging checks, pinned copy and rollback instructions.

Modify:
- `apps/api/src/bot.ts`, `apps/api/src/index.ts`: compose bot, shared client, startup and notification result handling.
- `apps/api/src/app.ts`: close demonstrated normalization gaps and integrate ready notification.
- `apps/menu/src/App.tsx`, `apps/menu/src/utils/storeStatus.ts`, `apps/menu/src/components/CheckoutModal.tsx`, `apps/menu/src/i18n/config.ts`: entry routing, current settings and customer explanations.
- `apps/staff/src/components/StoreSettings.tsx`, `StoreSettings.test.tsx`: copy explaining bot synchronization and partial-save reload behavior.
- `apps/api/tests/store-config.test.ts`: order boundary regressions.
- `README.md`: link launch runbook and new nonsecret environment variable names.

## Task 1: Build the live shop reply contract

**Interfaces:** `loadBotShop(prisma: PrismaClient): Promise<BotShop>`; `BotShop = { status: StoreStatus; deliveryFee: number }`; `renderShopCommand(command: 'menu' | 'hours' | 'delivery' | 'location' | 'help', shop: BotShop): string`. Replies are plain text; URL buttons are composed separately.

- [ ] Add table-driven tests covering every fulfillment/open-state row in the compatibility matrix. Use fixed dates with `getStoreStatus` for schedule boundaries, including 21:00 closing and an overnight 18:00–02:00 schedule.
- [ ] Include this concrete behavioral regression:

```ts
it('never advertises disabled delivery', async () => {
  await prisma.systemConfig.upsert({
    where: { key: 'enableDelivery' },
    update: { value: '0' },
    create: { key: 'enableDelivery', value: '0' },
  });
  const shop = await loadBotShop(prisma);
  expect(shop.status.enableDelivery).toBe(false);
  expect(renderShopCommand('delivery', shop)).toContain('Delivery is temporarily unavailable');
});
```

- [ ] Run `npm test --workspace=api -- bot-shop.test.ts` against the test database; confirm the missing module/test fails before implementation.
- [ ] Implement the read model using the existing helpers, with no persistent bot cache:

```ts
export async function loadBotShop(prisma: PrismaClient): Promise<BotShop> {
  const status = await getStoreStatus(prisma);
  const deliveryFee = await getConfigNumber(prisma, 'deliveryFee', Number(CONFIG_DEFAULTS.deliveryFee));
  return { status, deliveryFee };
}
```

- [ ] Render closure first, then fulfillment flags. For database errors, handler returns “We cannot check shop availability right now. Please try again shortly.” and the generic menu link; never fall back to “Open” or “Free delivery.”
- [ ] Test zero/nonzero fee, stale free-delivery note, missing maps link and shop names with HTML characters. Plain-text rendering must not enable HTML parsing.
- [ ] Re-run focused tests; review and commit this deliverable.

## Task 2: Register group commands and fix onboarding/support boundaries

**Interfaces:** `buildMiniAppLink(base: string, destination: 'menu' | 'orders' | 'rewards'): string`; `buildPrivateBotLink(username: string, payload: 'support'): string`; `registerShopCommands(bot: Telegraf, dependencies: { loadShop: () => Promise<BotShop>; miniAppBase: string; botUsername: string }): void`.

- [ ] Add failing tests for group `/menu`, `/menu@username`, private `/start` without a saved phone, group report with text, private support payload and a failure loading settings. Mock Telegram transport; do not launch polling in tests.
- [ ] Require `TELEGRAM_MINI_APP_URL` to be a validated HTTPS `t.me` main-app or named-app URL; use `URL` to set `startapp`. Obtain bot username through `getMe` at startup rather than hardcoding production identity.

```ts
const url = new URL(base);
if (url.protocol !== 'https:' || url.hostname !== 't.me') {
  throw new Error('TELEGRAM_MINI_APP_URL must be an HTTPS t.me Mini App URL');
}
url.searchParams.set('startapp', destination);
return url.toString();
```

- [ ] Configure the Main Mini App in BotFather during staging before using `https://t.me/<username>?startapp=menu`; alternatively use the configured named-app path. The runbook records the actual chosen URL. Do not use the public website URL as the Telegram authenticated entry URL.
- [ ] Register five group commands and the private additions with `setMyCommands` scopes. Explicitly replace the legacy default command list. Keep handlers checking chat type regardless of visible scope.
- [ ] Move group report/feedback guard before database writes and manager notifications. `/start support` explains the private `/report your message` flow. Do not retain public complaint payloads in a deep link.
- [ ] Show Open Menu immediately in private onboarding; retain contact-sharing handling for customers who choose it, without making it a prerequisite to browse. Keep contact requests private.
- [ ] Replace the independent Prisma client in `bot.ts` with `db.ts`'s shared client. Keep `setupBot()` callable from current startup and make registration failures observable without stopping the shop API. Missing launch URL disables group launch buttons with an actionable server log, rather than sending example.com or a broken link.
- [ ] Add a 5-second per-chat/per-user cooldown for public commands with bounded entry cleanup; private reports are not silently discarded by this limiter. Configure `bot.catch` to prevent unhandled handler exceptions.
- [ ] Run `npm test --workspace=api -- bot-links.test.ts bot-commands.test.ts bot-shop.test.ts`; build API; review and commit.

## Task 3: Ensure old links and current checkout follow staff changes

**Interfaces:** `parseTelegramDestination(value: unknown): 'menu' | 'orders' | 'rewards'`; unknown values return menu. Start parameters select UI only and never authenticate a customer.

- [ ] Add order regression cases to `store-config.test.ts`: pickup disabled with omitted order type; unknown type; both fulfillment methods disabled; cash disabled; standard-tier cash restricted; KHQR disabled. Use existing authenticated customer fixture and manager configuration helpers.
- [ ] Normalize order type before checking it, and reject unknown values. Keep the current default pickup behavior only when pickup is enabled:

```ts
const normalizedOrderType = req.body.orderType ?? 'pickup';
if (!['pickup', 'delivery'].includes(normalizedOrderType)) {
  return res.status(400).json({ error: 'Invalid order type' });
}
```

Use the normalized value for guards, delivery validation, fee calculation and persistence, not only the initial check. Do the equivalent allowed-value validation for payment methods using the existing supported cash/khqr contract.
- [ ] Add the small start-parameter parser and initialize the existing tab from Telegram SDK start data. Unknown/malicious values open menu; orders and rewards keep existing sign-in checks. Do not auto-submit a cart or auto-select a disabled service from a link.
- [ ] Force status refresh on Mini App entry, return to visibility and before checkout submission. Refresh the existing config/fee and payment-availability data as well; a status-only refresh does not update `deliveryFee` or cash eligibility. Preserve cart content when a setting changes.
- [ ] Add explicit loading/error state for checkout refresh. A failed refresh must not count retained/default “open” data as a successful current check. Keep browsing available and offer retry before submission.
- [ ] Ensure no eligible payment method disables checkout even when global cash is on but the current standard customer cannot use cash. Reuse the existing `isCashUnlocked` and `khqrOffered` predicates; do not duplicate tier policy in bot code.
- [ ] On an API rejection after a settings change, show the server explanation, refresh options and keep the cart. Server validation remains necessary because staff can save between refresh and submit.
- [ ] Run focused API regressions and `npm run build --workspace=menu`. The menu workspace has no test script: use the manual scenario matrix in Task 6 rather than claiming nonexistent frontend automated coverage.
- [ ] Review and commit.

## Task 4: Verify staff portal saves and bot responses together

**Interfaces:** Existing manager `PUT /api/config` with `{ key, value }`; bot reads `loadBotShop(prisma)` after write acknowledgment. No new settings API.

- [ ] Add integration tests using `createApp`, `issueToken('manager')` and the shared Prisma client from existing API tests. Set open mode, delivery on, then change delivery off via authenticated HTTP; call the real bot read model and assert disabled copy. Turn it on again and assert availability returns without reinitializing the bot.
- [ ] Repeat for pickup, both off, manual closure, fee 0 → 1.5, address and maps link. Attempt config write as a nonmanager and assert rejection plus unchanged bot output.
- [ ] Verify a valid delivery order is rejected after delivery is disabled; verify a previously created order still appears in staff and can progress normally. Toggling fulfillment controls new orders, not cancellation of accepted orders.
- [ ] Add staff settings text: “Saved settings apply to the menu and Telegram helper. Previous Telegram messages may show older information.” Update successful-save toast to mention both surfaces.
- [ ] Cover partial save failure: existing parallel writes can partly succeed. Await all requested writes settling, then reload actual saved state even on failure. Show “Some settings may have been saved. Current settings have been reloaded.” Keep failed changes identifiable in the UI and never claim atomic success. Do not add automatic announcements during individual writes.
- [ ] Add staff tests for successful delivery toggle save and partial-failure reload. In the delivery note editor, add “Keep this description consistent with the delivery fee. Checkout uses the configured fee.”
- [ ] Run `npm test --workspace=api -- bot-staff-settings.test.ts store-config.test.ts` and `npm test --workspace=staff -- StoreSettings.test.tsx`; build staff; review and commit.

## Task 5: Add useful ready notifications from staff order actions

**Interfaces:** `renderReadyNotification(order: { orderType: string; pickupCode: string | null }): string`; `sendTelegramNotification` returns an explicit success/failure result while existing callers may ignore that result. Notifications target stored customer Telegram IDs only.

- [ ] Add tests: preparing → ready sends one message; ready → ready sends none; two concurrent ready requests produce only one winning transition; guest order sends none; delivery wording does not claim dispatched; blocked bot does not fail staff update.
- [ ] At the existing status route, perform the status comparison/update with an atomic conditional write inside the existing database conventions. Only the request that changes the status to ready schedules a send. Preserve point settlement/refunds and existing response shape. Capture persisted previous/current status rather than trusting a client-supplied previous state.
- [ ] Use these messages with an escaped pickup code if HTML parsing remains enabled:

```text
Pickup: Your order #CODE is ready for pickup. Please collect it at the counter.
Delivery: Your order #CODE is prepared. Please check My Orders for updates.
```

Omit `#CODE` cleanly when absent. Do not infer courier departure or promise an ETA.
- [ ] Validate HTTP status and Telegram JSON `ok` in the notification sender; use a bounded request timeout. Log structured failure without bot token or customer message contents. Notification failure must not undo the successful staff status update or return a false order failure.
- [ ] Keep initial delivery best-effort with no blind retry: Telegram does not provide general send-message idempotency. Record the crash window between committed status and send as a known limitation. Durable outbox/retry is a separate future enhancement, not an exactly-once claim.
- [ ] Offer a private “Enable order updates” bot-start link in the customer flow; direct Mini App entry does not guarantee permission to message the user. If write permission is requested through the SDK, respect denial and keep order tracking usable in-app.
- [ ] Run `npm test --workspace=api -- order-ready-notification.test.ts e2e-workflow.test.ts feedback.test.ts`; build API; review and commit.

## Task 6: Staging validation and production runbook

- [ ] Write `docs/telegram-group-launch.md` documenting Main Mini App URL setup, group membership, scoped commands, privacy mode, support flow, and customer messaging permission. Record actual staging bot username and group in test evidence, without secrets.
- [ ] Keep staging and production on separate bot tokens. Current code uses polling: run exactly one polling process per token, and do not run a webhook consumer simultaneously. Do not introduce webhook migration into this feature.
- [ ] Use this evergreen message for the group owner to pin:

```text
Welcome to Ai-Cha & Zhengda Arakawa.
Browse our menu, customize your order, and check the available checkout options.
Use /hours, /delivery or /location for shop information.
For order help, use /help to contact us privately.
[Open Menu]
```

Render the saved shop name rather than hardcoding it in code. Do not automatically send or pin to the real customer group during implementation.
- [ ] Execute this real-device matrix on Telegram iOS and Android, plus one desktop client:

| Scenario | Required evidence |
| --- | --- |
| Type `/` with bot in group | Five intended commands suggested; addressed menu works with another bot present. |
| New customer, no phone | Menu opens directly; checkout collects required details at the appropriate step. |
| Staff saves delivery off/on | Next `/delivery` follows state; newly opened app agrees; no bot restart. |
| App stays open while delivery disabled | Next checkout refresh disables delivery; API rejects stale submission without losing cart. |
| Both fulfillment modes off / manually closed | Browse works; new checkout blocked with correct explanation. |
| Fee changes from 0 to 1.50 | New reply, refreshed checkout and stored order total agree. |
| Cash off / restricted standard customer / ABA unavailable | No unusable payment submission; bot does not promise cash or working KHQR. |
| Private and group support | Group reveals no bot-generated complaint detail; private report reaches existing staff feedback view and authorized manager alerts. |
| Orders/rewards links | Correct tab opens; existing authentication and disabled lucky-draw rules remain in force. |
| Staff marks pickup/delivery ready | Correct private wording; repeat click does not duplicate; denied messaging permission leaves staff action successful. |
| Staff save partly fails | Portal reloads saved values; bot reflects persisted values; no misleading success toast. |
| Status database unavailable | Bot reports inability to check; app does not treat stale status as fresh checkout permission. |

- [ ] Run API tests only against the disposable test database: the existing API test script uses `db push --accept-data-loss` with `DATABASE_URL=file:./test.db`. Never point this command at production.

```bash
npm test --workspace=api
npm test --workspace=staff
npm run build --workspace=api
npm run build --workspace=menu
npm run build --workspace=staff
```

- [ ] Record pass/fail and screenshots in the runbook. Do not label production verified unless the actual production checks were performed with authorization.
- [ ] Document rollback: deploy previous application revision; restore previous Telegram command registrations explicitly because they persist outside deployment; keep order/config data intact. Owner may unpin helper message or remove bot from group while private ordering remains supported.
- [ ] Review and commit documentation and evidence. Production deployment and posting to the customer group remain separate actions from writing or implementing this plan.

## Deferred customer features

Product-sharing cards, a staff-managed deals command, group baskets, proactive promotions, and durable notification retries can follow launch. Existing favorites/reorder/rewards already provide retention value; expose them through the mini app before adding duplicate conversational workflows. Do not delay the core staff-synchronized helper for these features.

## Acceptance checklist

- [ ] Group slash suggestions and Open Menu work on real Telegram clients.
- [ ] Every saved fulfillment/open-state change reaches the next bot reply and current checkout.
- [ ] Fees, tier restrictions and provider readiness are never contradicted by bot promises.
- [ ] No second configuration source or bot restart is required.
- [ ] Private support uses the existing staff feedback pipeline.
- [ ] Ready notifications follow staff actions without making notification delivery a prerequisite for order progress.
- [ ] Automated tests/builds and manual scenarios have recorded results.

## Telegram references

Verified during the recommendation on 2026-09-08; recheck at implementation if platform behavior changes.

- Commands and scopes: https://core.telegram.org/bots/features#commands
- Private-only inline web_app buttons: https://core.telegram.org/bots/api#inlinekeyboardbutton
- Main and direct-link Mini Apps: https://core.telegram.org/bots/webapps#direct-link-mini-apps
- Privacy mode and addressed group commands: https://core.telegram.org/bots/faq#what-messages-will-my-bot-get
