import type { Locale, LocalizedText } from '../types';

/**
 * Normalizes locale code (e.g. 'en-US' -> 'en', 'zh-CN' -> 'zh').
 */
export function normalizeLocale(locale: string): Locale {
  const base = (locale || 'en').split('-')[0].toLowerCase();
  if (base === 'km') return 'km';
  if (base === 'zh') return 'zh';
  return 'en';
}

/**
 * Resolves localized text according to the public menu fallback rules:
 * 1. Current selected-language cell (if not stale)
 * 2. Original source text / source cell
 * 3. Raw fallback field
 *
 * Stale cells are NOT displayed as current.
 * Explicitly cleared text (empty sourceText) resolves to empty string.
 */
export function resolveLocalizedText(
  record: LocalizedText | undefined,
  locale: Locale | string,
  raw: string
): string {
  if (!record) {
    return raw;
  }

  // If sourceText is explicitly set to empty string, description was cleared
  if (record.sourceText === '') {
    return '';
  }

  const normLocale = normalizeLocale(locale);

  // 1. Check if target cell exists
  const targetCell = record.cells?.find((c) => c.locale === normLocale);
  if (targetCell && targetCell.text !== undefined && targetCell.text !== null) {
    const text = targetCell.text.trim();
    if (text !== '') {
      // Check if stale
      const isSourceLocale = record.sourceLocale ? normLocale === record.sourceLocale : false;
      const isStale =
        !isSourceLocale &&
        typeof record.sourceRevision === 'number' &&
        typeof targetCell.basedOnSourceRevision === 'number' &&
        targetCell.basedOnSourceRevision < record.sourceRevision;

      if (!isStale) {
        return text;
      }
    }
  }

  // 2. Fallback to original source text
  if (record.sourceText !== undefined && record.sourceText !== null && record.sourceText.trim() !== '') {
    return record.sourceText.trim();
  }

  // Check cell matching sourceLocale
  if (record.sourceLocale) {
    const sourceCell = record.cells?.find((c) => c.locale === record.sourceLocale);
    if (sourceCell?.text?.trim()) {
      return sourceCell.text.trim();
    }
  }

  // 3. Fallback to raw property
  return raw;
}

/**
 * Convenience helper for UI callers that preserves legacy t(raw)
 * ONLY when no localized database record exists.
 */
export function resolveWithLegacyFallback(
  record: LocalizedText | undefined,
  locale: Locale | string,
  raw: string,
  t?: any
): string {
  if (!record) {
    return t ? String(t(raw, raw)) : raw;
  }
  return resolveLocalizedText(record, locale, raw);
}
