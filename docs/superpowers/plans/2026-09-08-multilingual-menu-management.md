# Multilingual Menu Management Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking. This document authorizes no implementation, deployment, paid AI calls, or parallel agent execution by itself.

**Goal:** Owners can enter menu content in English, Khmer, or Chinese, automatically generate the other languages, and correct translations in Settings without rebuilding or redeploying the menu.

**Architecture:** Persist localized content in SQLite through the existing Prisma API. Generate AI drafts on the server and save owner-approved changes atomically; customers read saved translations through existing catalog requests. Keep bundled i18next resources for interface labels and legacy fallback, never rewrite application source during an owner save.

**Tech Stack:** Existing Express, Prisma/SQLite, TypeScript, React/Vite, i18next, SWR, Vitest, and Testing Library. A server-only translation provider adapter is selected through the quality evaluation in Task 1.

**Spec:** The agreed requirements and proposed implementation decisions are recorded below in this document, based on the September 8, 2026 planning conversation. No separate approved feature spec exists.

## Requirements and scope

- Accept English (`en`), Khmer (`km`), and Chinese (`zh`) as the original language. Retain the current Chinese script convention from the bundled dictionary.
- Automatically prepare translations after the owner finishes entering content; display the detected source language and allow correction.
- Preserve original wording. Never require English input first.
- Provide Settings → Languages with English, Khmer, and Chinese columns, editable cells, and a customer-style item preview.
- Save menu text and translations to the database. Normal content edits require no deployment after the initial feature rollout.
- Cover item names/descriptions, category names, modifier group names, and option/topping names in this release.
- Leave interface buttons, reward/prize content, staff interface localization, and configurable brand-tab labels outside this release. Existing interface translations remain in `apps/menu/src/i18n/config.ts`.
- Keep prices, identifiers, quantities, and order calculations independent of display language.
- Preserve owner-reviewed translations; source changes flag them as needing review rather than overwriting them automatically.
- Persist source content even when AI is unavailable, with an explicit “Save original only” action and retry. Never show a failed translation as successful.
- Do not choose a model based solely on claims of multilingual support. Task 1 establishes Khmer menu quality before enabling the feature.

## Current implementation facts

- `apps/staff/src/components/MenuItemEditModal.tsx` has one `name` and one `description`, submitting to manager-protected catalog CRUD in `apps/api/src/app.ts`.
- `apps/api/prisma/schema.prisma` uses SQLite. There are no localized content fields or translation service integrations.
- Customer components currently call `t(item.name)` and `t(item.description)`, matching literal text in the bundled dictionary. New text has no automatic translations.
- `apps/menu/src/hooks/useCatalog.ts` polls catalog/categories every 60 seconds and disables revalidation on focus.
- Category membership currently uses `MenuItem.category`, a category-name string; do not substitute its localized display label into this field.
- Catalog updates currently delete/recreate modifier rows. Stable group/option `key` values exist and must preserve translation identity across these writes.
- The API test script resets a dedicated SQLite test database; never run it with a production database URL. The API startup script currently runs `prisma db push`.
- The customer menu currently has no test script. Add a minimal Vitest setup as part of the customer-localization task.

## Data and publication contract

Use a small generic text store, keyed by stable content identity. This avoids adding three language columns to every domain table and prevents modifier row recreation from losing translations.

```ts
type Locale = 'en' | 'km' | 'zh';
type TextOwner = 'item' | 'category' | 'modifierGroup' | 'modifierOption';
type TextField = 'name' | 'description';
type TranslationOrigin = 'original' | 'ai' | 'manual' | 'legacy';
type LocalizedCell = {
  locale: Locale;
  text: string;
  origin: TranslationOrigin;
  reviewed: boolean;
  basedOnSourceRevision: number;
};
type LocalizedText = {
  id: string;
  ownerType: TextOwner;
  ownerKey: string;
  field: TextField;
  sourceLocale: Locale | null;
  sourceText: string;
  sourceRevision: number;
  revision: number;
  cells: LocalizedCell[];
};
```

- Item/category owner keys are their database IDs. Modifier group keys are `JSON.stringify([menuItemId, group.key])`; option keys are `JSON.stringify([menuItemId, group.key, option.key])`. Avoid delimiter-based key collisions.
- One source locale per text field allows a Chinese name with an English description. Null source locale is allowed only for unclassified legacy content or an explicit original-only save awaiting language confirmation.
- Add Prisma `LocalizedText` with the scalar fields above, `updatedAt`, and `@@unique([ownerType, ownerKey, field])`. Add `LocalizedTextValue` with `textId`, the cell fields above, a cascading relation to `LocalizedText`, and `@@unique([textId, locale])`. SQLite string values are validated against the TypeScript unions in API code.
- `revision` increments on every saved modification; `sourceRevision` increments only when source text or source language changes. A non-source cell needs review when `basedOnSourceRevision !== sourceRevision`.
- Original domain `name`/`description` fields remain populated with source text for compatibility. Saving an edit to a source-language cell updates those fields in the same transaction. Editing a translated cell does not change the source language.
- Generate drafts without publishing. Save publishes the original and chosen translations in one transaction. AI-generated, unreviewed cells may be published when the owner saves; review status remains visible.
- Source changes preserve reviewed cells and mark them stale. Automatically regenerate unreviewed target cells only. Explicit “Regenerate” produces a preview even for reviewed cells; replacing their text requires the owner's selection before save.
- Empty descriptions are legitimate; clearing a source description clears its translations atomically, with a visible indication in the editor. Names cannot be blank.
- Public fallback: current selected-language cell → original source text → legacy raw field. Do not display a stale translation as current; retain it in Settings for correction. Use the old dictionary only for records not yet backfilled.
- Generic ownership has no domain foreign key. Catalog/category deletion handlers must remove owned text rows transactionally, including modifier keys removed by edits. Backfill reports orphan rows; it does not silently delete unknown content.

## API and AI interfaces

```ts
type TranslationDraftRequest = {
  requestId: string;
  entries: Array<{
    clientKey: string;
    text: string;
    sourceLocale: Locale | 'auto';
    targetLocales: Locale[];
    context: { field: TextField; category?: string; itemName?: string };
  }>;
};
type TranslationDraftResult = {
  requestId: string;
  entries: Array<{
    clientKey: string;
    sourceLocale: Locale | null;
    needsLanguageConfirmation: boolean;
    translations: Partial<Record<Locale, string>>;
  }>;
};
interface TranslationProvider {
  translate(input: TranslationDraftRequest): Promise<TranslationDraftResult>;
}
```

- `POST /api/translations/draft`: manager-only; accepts the draft request and returns validated drafts. No database content writes. Restrict to 20 entries, 200 characters per name, 2,000 per description, and 12,000 characters overall. Target locales must be supported and exclude a confirmed source locale.
- `GET /api/translations?ownerType=item&cursor=...&limit=50&q=...&status=...`: manager-only, paginated. Return localized records with owner labels and a next cursor. Support owner types above and `missing`, `unreviewed`, `needs-review`, or no status filter. Search all three languages.
- `PATCH /api/translations`: manager-only; `{ edits: Array<{ id, expectedRevision, sourceLocale?, cells: Array<{locale,text,reviewed}> }> }`. Maximum 50 records; atomic all-or-nothing save. Return updated records. Return `409` on any stale revision and retain unsaved edits in the client.
- Existing catalog create/update accepts an additive `localization` object for name/description and nested modifier text, using client keys for unsaved modifiers. Server assigns stable identities and saves all content transactionally. Existing clients without this object still work; changed legacy text invalidates corresponding target cells.
- Catalog/category GET responses gain additive `localized` text maps. Preserve raw fields and all existing ordering/price contracts. Do not expose provider configuration or internal prompts publicly.
- Validate the owner exists and the field is supported (`description` only for items). Validate all locale values, duplicate entries, lengths, revisions, and source/value consistency server-side.
- AI credentials stay in API environment variables; no browser keys. Set a 20-second timeout, at most one retry on transient failure, and a manager quota of 10 requests/minute plus a deployment-wide concurrency limit of two. Document the in-process limiter's single-instance assumption; use shared quota storage before scaling replicas.
- Treat menu text as data in the prompt. Require structured output with exactly the requested client keys/locales; reject invented keys, empty required translations, malformed output, and oversized responses. Render text through React text nodes.
- Prompt: translate menu wording naturally; preserve brand names, numbers, sizes, and ingredient meaning; never invent ingredients, dietary claims, or allergens; use approved glossary entries. Uncertain language returns confirmation-needed, not a forced guess.
- Only send entered menu content and its menu context to the AI service. Record request duration, model ID, token usage where available, and outcome without logging credentials.

## File map

New API modules: `apps/api/src/translations/types.ts`, `repository.ts`, `routes.ts`, `provider.ts`, `service.ts`, `glossary.ts`, and `backfill.ts`. Keep routing registration and existing CRUD integration in `apps/api/src/app.ts`; do not restructure unrelated routes.

New staff modules: `apps/staff/src/components/languages/LanguageManagement.tsx`, `TranslationEditor.tsx`, `MenuLanguagePreview.tsx`, and `useTranslationDraft.ts`. Reuse existing inputs, buttons, toast, and modal patterns.

New customer module: `apps/menu/src/utils/localizedText.ts`. Extend existing catalog types/mapping and all relevant display surfaces rather than injecting owner strings into the global i18next dictionary.

New evidence/docs: `docs/superpowers/plans/evidence/multilingual-menu-provider-evaluation.md` and `docs/multilingual-menu-operations.md`. New fixture: `apps/api/tests/fixtures/translation-evaluation.json`.

## Task 1: Establish translation quality and provider boundary

**Files:** Create provider evaluation evidence, fixture, `types.ts`, `provider.ts`, `glossary.ts`, and `apps/api/tests/translation-provider.test.ts`; extend `apps/api/.env.example`.

**Produces:** `TranslationProvider.translate` and the request/result types above. Provider/model selection is an implementation prerequisite, not a claim that a particular model is best.

- [ ] Build 30 real menu examples: ten originals per source language, covering tea, toppings, food, descriptions, mixed brand names, sizes, and ambiguous short names. Evaluate both target languages for every example.
- [ ] Research current official provider documentation at execution time; record candidate model IDs, supported API contract, costs, and latency in the evaluation document. Obtain configured credentials before live evaluation; use mocked responses for normal tests.
- [ ] Have a fluent Khmer reviewer score Khmer outputs for meaning and naturalness (1–5), and fluent English/Chinese reviewers check their respective outputs. Require zero changed ingredients/quantities/brand identities and mean score at least 4/5 per target language. Record per-example results and select the passing candidate with the best Khmer results, then latency/cost. If none pass, leave automatic translation disabled and report the quality blocker.
- [ ] Implement a single selected server adapter behind the interface, with `TRANSLATION_ENABLED`, `TRANSLATION_MODEL`, and `TRANSLATION_API_KEY` environment configuration. Configure the endpoint in code for the selected provider; do not accept arbitrary URLs from owners.
- [ ] Write failing provider tests, then implement strict validation and timeout/retry behavior. Example invariant:

```ts
expect(result.entries[0].sourceLocale).toBe('zh');
expect(result.entries[0].translations.en).toBe('Pearl milk tea');
expect(result.entries[0].translations.zh).toBeUndefined();
```

- [ ] Verify malformed JSON, changed request IDs, unrequested locales, timeouts, and provider errors return a typed failure. No source text is silently replaced.
- [ ] Run `npm --prefix apps/api test -- tests/translation-provider.test.ts`; record mocked-test results separately from human language evaluation.

## Task 2: Persist translations with concurrency and stable identities

**Files:** Modify `apps/api/prisma/schema.prisma`; create `repository.ts` and `apps/api/tests/translation-repository.test.ts`.

**Consumes:** Localized contracts above. **Produces:** repository operations `getLocalizedTexts(ownerType, ownerKey)`, `saveLocalizedEdits(edits, tx)`, and `deleteOwnedTexts(ownerType, ownerKey, tx)`, using the existing Prisma transaction client. `edits` has the PATCH shape above; saves return `LocalizedText[]`.

- [ ] Add the two additive Prisma models and generate the client. Exercise schema changes only against an isolated SQLite database at this stage.
- [ ] Test and implement atomic revision checks; two writes with the same `expectedRevision` must produce one success and one conflict.
- [ ] Test source edits preserve reviewed target text but change its stale state:

```ts
expect(after.sourceRevision).toBe(before.sourceRevision + 1);
expect(after.cells.find(c => c.locale === 'km')?.text).toBe(ownerCorrection);
expect(after.cells.find(c => c.locale === 'km')?.basedOnSourceRevision)
  .toBe(before.sourceRevision);
```

- [ ] Implement source synchronization, description clearing, unique locale enforcement, transactional deletion, and stable modifier owner keys. Test item rename does not change translation identity and modifier row recreation preserves translations with unchanged keys.
- [ ] Run `npm --prefix apps/api test -- tests/translation-repository.test.ts` and `npm --prefix apps/api run build`.

## Task 3: Import existing translations without losing edits

**Files:** Create `backfill.ts` and `apps/api/tests/translation-backfill.test.ts`; extract the existing resource object into new `apps/menu/src/i18n/resources.ts`; modify `apps/menu/src/i18n/config.ts` to import it; add a backfill script to `apps/api/package.json`.

**Consumes:** Existing dictionary values and repository contracts. **Produces:** idempotent dry-run/apply import of menu-owned texts; runtime never imports frontend resources into API routes.

- [ ] Extract the dictionary mechanically without changing any values or initialization behavior. The CLI may load the standalone data module via `tsx`; avoid importing the React/i18next initializer.
- [ ] Implement `npm --prefix apps/api run translations:backfill -- --dry-run` and explicit `--apply`. Print counts of new records, existing records skipped, unmatched text, and orphan records; never replace existing localized records.
- [ ] Match literal raw names/descriptions to dictionary entries for all three locales. Mark imported translations `legacy` and unreviewed. Mark source as English only when supported by a matching English dictionary entry; preserve unrecognized text as unclassified source without calling AI.
- [ ] Test rerunning the importer produces zero changes, identical wording on two items keeps separate identities, and manual corrections survive reruns.
- [ ] Run `npm --prefix apps/api test -- tests/translation-backfill.test.ts` and `npm --prefix apps/menu run build`.

## Task 4: Expose translation endpoints and integrate catalog writes

**Files:** Create `routes.ts`, `service.ts`, `apps/api/tests/translations.test.ts`; modify `app.ts`, `apps/api/tests/catalog-management.test.ts`, and `apps/api/tests/category-management.test.ts`.

**Consumes:** Repository and provider. **Produces:** the endpoints and additive catalog payload contract defined above.

- [ ] Register translation routes with existing `requireManager`; inject a fake provider in tests without relying on live credentials.
- [ ] Test unauthorized calls and ordinary staff calls fail before provider invocation, and missing/disabled AI configuration returns a clear unavailable error.
- [ ] Implement paginated list/search, atomic PATCH, bounded draft generation, rate limits, and optimistic conflict responses. Test unsupported locales, excessive text, duplicate cells, missing owners, and stale revisions.
- [ ] Integrate localization into item/category CRUD transactions. Preserve original field compatibility and stable modifier keys; reject duplicate keys instead of attaching translations ambiguously.
- [ ] When a category's source name changes, update matching `MenuItem.category` values transactionally under the existing category semantics. A translated label correction must not change membership.
- [ ] Return localized maps with catalog/category data. Test price-only/photo-only updates preserve all translation revisions and never invoke AI.
- [ ] Verify a Chinese-source create round trip:

```ts
expect(created.name).toBe('珍珠奶茶');
expect(created.localized.name.sourceLocale).toBe('zh');
expect(created.localized.name.cells.find(c => c.locale === 'en')?.text)
  .toBe('Pearl milk tea');
```

- [ ] Run `npm --prefix apps/api test -- tests/translations.test.ts tests/catalog-management.test.ts tests/category-management.test.ts`.

## Task 5: Add automatic drafts to owner content entry

**Files:** Create `TranslationEditor.tsx`, `useTranslationDraft.ts`, and `apps/staff/src/components/languages/TranslationEditor.test.tsx`; modify `MenuItemEditModal.tsx`, its test, and `CategoryManagementModal.tsx` and its test.

**Consumes:** Draft endpoint and additive catalog payload. **Produces:** editable, unpublished drafts submitted with normal item/category saves.

- [ ] Add original-language Auto/English/Khmer/Chinese controls per text field, displaying detection and a confirmation control when ambiguous.
- [ ] Trigger automatic drafts on blur for changed, nonempty text. Track the input snapshot and request generation counter; discard a response if either no longer matches. Do not call during IME composition or on every keystroke.
- [ ] Populate only unreviewed/empty targets automatically. Manual target edits mark them reviewed and protect them from pending responses. Keep a per-field regenerate action for explicit replacement preview.
- [ ] Show draft loading, failure/retry, and Save original only. If save occurs while AI is pending, require completion or the explicit original-only action; do not silently drop pending changes.
- [ ] Use the same editor for description, category quick-add/full editor, group names, and option names. Translate only changed text, retaining stable modifier keys.
- [ ] Test entering each of the three source languages, detection correction, stale response rejection, manual correction during an in-flight request, and save/reopen persistence. Example visible-state assertion:

```ts
expect(screen.getByRole('textbox', { name: 'Chinese item name' }))
  .toHaveValue('珍珠奶茶');
expect(screen.getByRole('textbox', { name: 'English item name' }))
  .toHaveValue('Pearl milk tea');
```

- [ ] Run `npm --prefix apps/staff test -- src/components/MenuItemEditModal.test.tsx src/components/CategoryManagementModal.test.tsx src/components/languages/TranslationEditor.test.tsx`.

## Task 6: Build Settings → Languages and menu preview

**Files:** Create `LanguageManagement.tsx`, `MenuLanguagePreview.tsx`, and `LanguageManagement.test.tsx`; modify `SettingsManagement.tsx`, `apps/staff/src/App.tsx`, and `apps/staff/src/AppSidebar.test.tsx`.

**Consumes:** Paginated translation listing and atomic PATCH. **Produces:** manager-only translation management.

- [ ] Extend `SettingsSubTab` with `languages` and update sidebar, page headings, and settings rendering explicitly; do not let the current store/users ternary render Languages as Users.
- [ ] Build a searchable list with English/Khmer/Chinese columns and rows for the selected content type. Add missing/unreviewed/needs-review filters and original-language markers. On narrow screens stack three labeled fields per record.
- [ ] Keep edits local until Save changes. Show unsaved state and guard pagination/navigation with Save, Discard, or Keep editing. Save only changed records with expected revisions.
- [ ] On `409`, retain edits and show latest server values alongside the conflicting draft; require the owner to choose before retry. On network failure, retain all text and allow retry.
- [ ] Show an item preview with name, description, image, price, and modifier text, switchable among the three languages using the same fallback rules as the customer menu. Preview unsaved drafts and label them clearly.
- [ ] Test three-column editing, search/filter/pagination, corrections surviving reopen, preview reflecting drafts, failed saves, conflicts, and manager navigation. Test that ordinary staff cannot access endpoints even with a manually entered URL.
- [ ] Run `npm --prefix apps/staff test -- src/components/languages/LanguageManagement.test.tsx src/AppSidebar.test.tsx` and `npm --prefix apps/staff run build`.

## Task 7: Display saved language content throughout the customer menu

**Files:** Create `localizedText.ts`, `apps/menu/src/utils/localizedText.test.ts`, and `apps/menu/vitest.config.ts`; add Vitest test setup/script to `apps/menu/package.json`. Modify `types/index.ts`, `hooks/useCatalog.ts`, `App.tsx`, `components/MenuItemCard.tsx`, `ItemPreviewModal.tsx`, `ModifierModal.tsx`, `CartDrawer.tsx`, `CheckoutModal.tsx`, `OrdersView.tsx`, and `components/ui/CategoryScroller.tsx` as needed for their actual data paths.

**Consumes:** Catalog localized maps. **Produces:** `resolveLocalizedText(record: LocalizedText | undefined, locale: Locale, raw: string): string` and language-independent ordering/cart identity.

- [ ] Implement the resolution contract with pure tests for all locales, missing cells, stale cells, unknown legacy records, and explicitly cleared descriptions. Keep legacy `t(raw)` fallback in the caller only when no localized record exists.
- [ ] Preserve localization data in catalog mapping; render names/descriptions/options directly after resolution. Continue using `t()` for interface labels.
- [ ] Separate category identity from display: keep raw category string for filtering/membership and use category ID/localized map for its label.
- [ ] Carry localization references or maps into cart entries and selections. Resolve active catalog entries by stable IDs/keys at display time so language switching and refreshed corrections affect an already-open cart. Never change item IDs, modifier keys, prices, or quantities on language changes.
- [ ] Audit order-history and checkout rendering: localize available related menu content, retain saved raw labels for deleted/unavailable entries, and preserve existing order pricing/history semantics. This release does not redesign order snapshots.
- [ ] Keep the existing 60-second active-page refresh and enable revalidation on focus. New navigation/reload fetches current data; open active menus update on the next poll. Do not promise instantaneous cross-device updates or background-tab timing.
- [ ] Add integration tests proving Chinese-first item display in all locales, correction visibility after revalidation, language switching with cart contents, and unchanged totals. Example pure test:

```ts
expect(resolveLocalizedText(chineseSourceRecord, 'en', '珍珠奶茶'))
  .toBe('Pearl milk tea');
expect(resolveLocalizedText(recordWithStaleEnglish, 'en', '珍珠奶茶'))
  .toBe('珍珠奶茶');
```

- [ ] Run `npm --prefix apps/menu test` and `npm --prefix apps/menu run build`. Confirm public menu loads generate zero requests to the AI provider.

## Task 8: Verify rollout and no-deployment content updates

**Files:** Create `apps/api/tests/e2e-translations.test.ts` and `docs/multilingual-menu-operations.md`; update API test cleanup where localized rows require isolation.

- [ ] Add end-to-end API cases for create in each source language, save generated drafts, manual correction, source edit staleness, original-only save/retry, deletion cleanup, and two-manager conflict. Use a deterministic provider stub.
- [ ] Run `npm --prefix apps/api test`, `npm --prefix apps/staff test`, `npm --prefix apps/menu test`, `npm run build`, and `npm run build:frontend`. Record actual results and failures; do not claim completion from a plan checklist.
- [ ] Run browser QA: manager creates a Chinese item, checks all three columns, corrects Khmer, saves, then a separate customer session reloads and sees the correction. Repeat English-first and Khmer-first. Verify mobile fields, Khmer font rendering, IME entry, long descriptions, preview, and an existing cart.
- [ ] Record a no-deployment proof: note running frontend build ID, save a correction, observe customer output after refresh, and confirm build ID remains unchanged and no deployment command ran.
- [ ] Document staged rollout: back up SQLite using a consistent backup method, rehearse restore on a copy, apply additive schema with automatic AI disabled, run backfill dry-run then apply, deploy compatible API/frontends, and enable AI only after the quality gate passes. Verify existing catalog/order tests and actual schema contents before changing traffic.
- [ ] Document rollback: disable automatic AI to preserve manual editing; roll back display code while retaining added tables and compatibility fields. Do not drop translation data or restore an old database over orders placed since rollout. Database restore is disaster recovery requiring reconciliation, not the routine rollback path.
- [ ] Document keys/model configuration, quota assumptions, costs from evaluation, retry behavior, draft/publication rules, glossary maintenance, refresh timing, and how to backfill without overwriting owner corrections.

## Completion criteria

- Every supported original language works without entering English first.
- Owners can review and correct all in-scope menu text in Settings and preview the result.
- Renames and modifier edits preserve translation identity; reviewed text is never silently overwritten.
- AI outages and ambiguous language detection retain original input and provide a usable recovery path.
- Customer menu, item detail, options, cart, checkout, and available order labels use the selected language without altering commerce behavior.
- Existing translations survive backfill and content changes appear without redeployment after the initial rollout.
- Provider quality evidence, automated checks, and browser QA are recorded before feature completion is claimed.

## Plan self-review

- Requirement coverage: input/automatic translation → Tasks 1, 4, 5; editable three-language settings/preview → Task 6; no-deployment display → Tasks 2, 4, 7, 8; legacy preservation → Task 3; owner corrections/concurrency → Tasks 2, 4, 5, 6.
- Provider choice intentionally follows a measured prerequisite with explicit pass criteria. Availability of credentials and fluent reviewers can block enabling AI, but does not block database/editor implementation with a fake provider.
- This plan changes no source code or live data. Implementation must follow the current repository instructions and inspect any changes made since this plan was written.
