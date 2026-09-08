# Multilingual Menu Management Operations Runbook

This guide covers operational procedures, rollout, backfill, error recovery, configuration, and rollback for the multilingual menu system.

---

## 1. Architecture Summary

- **Supported Locales:** English (`en`), Khmer (`km`), Chinese (`zh`).
- **Database Storage:** Translations are stored in `LocalizedText` and `LocalizedTextValue` tables (SQLite via Prisma).
- **Zero Frontend Bundle Rewrites:** Menu edits and translations never modify `apps/menu/src/i18n/config.ts` or require frontend redeployment after rollout.
- **Provider Boundary:** AI draft translations are mockable and controlled via environment variables. Public customer menu reads generate zero AI calls.
- **Commerce Integrity:** Item IDs, modifier option keys, pricing, cart logic, and order creation remain 100% stable regardless of active language.

---

## 2. Environment Variables & Configuration

Configure in `apps/api/.env`:

| Variable | Type | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `TRANSLATION_ENABLED` | boolean | `false` | Enable/disable automatic AI translation drafts. Set to `false` for zero paid calls or during maintenance. |
| `GEMINI_API_KEY` | string | `""` | Google Gemini API key for live provider. When empty or disabled, draft calls safely return HTTP 503 unavailable. |
| `TRANSLATION_MODEL` | string | `gemini-1.5-flash` | Gemini model name for translations. |
| `TRANSLATION_RATE_LIMIT` | number | `30` | Max requests per minute per IP for draft endpoint. |

---

## 3. Legacy Backfill Runbook

The backfill utility imports existing translations from `apps/menu/src/i18n/resources.ts` into SQLite. It is strictly idempotent and never overwrites manual owner edits.

### Step 1: Dry-Run (Inspect Planned Changes)

```bash
npm --prefix apps/api run translations:backfill -- --dry-run
```

Outputs counts of:
- Items scanned
- Localized records to create
- Localized records skipped (already in DB)
- Dictionary matches found

### Step 2: Apply to Database

```bash
npm --prefix apps/api run translations:backfill -- --apply
```

### Safety Rules:
- Rerunning the command creates zero duplicate rows.
- Existing database translations (manual owner edits or AI drafts) are never replaced.
- Items without dictionary matches remain with their source language intact without calling AI.

---

## 4. Staged Rollout Procedure

Follow these steps for initial deployment:

1. **Backup SQLite Database:**
   ```bash
   sqlite3 apps/api/prisma/dev.db ".backup 'apps/api/prisma/backup-$(date +%Y%m%d%H%M%S).db'"
   ```
2. **Apply Additive Schema Migration:**
   ```bash
   npx --prefix apps/api prisma db push
   ```
   *Note: This schema change is strictly additive (`LocalizedText` and `LocalizedTextValue` tables).*
3. **Keep AI Disabled Initially:**
   Verify `TRANSLATION_ENABLED="false"` in staging/production `.env`.
4. **Run Backfill:**
   Run dry-run, verify counts, then apply backfill.
5. **Deploy API & Frontend Apps:**
   Deploy `apps/api`, `apps/menu`, and `apps/staff`.
6. **Verify Quality Gate & Smoke Test:**
   - Log into Staff portal -> Settings -> Languages.
   - Confirm three columns display English, Khmer, and Chinese.
   - Open Customer menu -> switch languages -> confirm names and prices resolve.
7. **Enable AI Drafting:**
   Set `TRANSLATION_ENABLED="true"` and configure `GEMINI_API_KEY`.

---

## 5. Rollback Procedure

If issues arise with AI drafts or UI display:

1. **Quick Rollback (No Data Loss):**
   - Set `TRANSLATION_ENABLED="false"` in `apps/api/.env`.
   - Restart API server.
   - Staff can continue entering and editing translations manually without AI errors.
2. **Frontend Rollback:**
   - Roll back customer menu build to previous commit if display issues occur.
   - **DO NOT** drop `LocalizedText` tables or restore old database backups over live transactions. New customer orders and loyalty points would be lost.
3. **Database Restore (Disaster Recovery Only):**
   - Only use if database corruption occurs.
   - Reconcile customer orders placed since the backup timestamp before re-opening the store.

---

## 6. Concurrency & Conflict Handling (409)

When two managers edit the same item concurrently:
- Each translation record has an atomic `revision` counter.
- If Manager B submits edits based on revision 1 after Manager A already saved revision 2, the API rejects Manager B with `HTTP 409 Conflict`.
- Staff UI keeps Manager B's unsaved text and displays the conflicting server version side-by-side.
- Manager B can review differences and choose to overwrite or discard.

---

## 7. Operational FAQ & Daily Workflows

- **How to add a new menu item in Khmer first?**
  1. Open Staff app -> Menu -> Add Item.
  2. Select Khmer as the source language.
  3. Type name (e.g. "តែទឹកដោះគោគុជ").
  4. Automatic drafts populate English and Chinese fields.
  5. Review and save.
- **How to edit brand glossary terms?**
  Update `apps/api/src/translations/glossary.ts` with brand names, bubble tea terms, and fixed phrases.
- **How does customer menu refresh translations?**
  `useCatalog()` polls every 60 seconds and revalidates on window focus. Language switching instantly resolves text from cached catalog data without making extra HTTP requests.
