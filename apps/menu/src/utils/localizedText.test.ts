import { describe, it, expect, vi } from 'vitest';
import { resolveLocalizedText, resolveWithLegacyFallback, normalizeLocale } from './localizedText';
import type { LocalizedText } from '../types';

describe('resolveLocalizedText', () => {
  const chineseSourceRecord: LocalizedText = {
    sourceLocale: 'zh',
    sourceText: '珍珠奶茶',
    sourceRevision: 1,
    cells: [
      { locale: 'zh', text: '珍珠奶茶', basedOnSourceRevision: 1 },
      { locale: 'en', text: 'Pearl milk tea', basedOnSourceRevision: 1 },
      { locale: 'km', text: 'តែទឹកដោះគោគុជ', basedOnSourceRevision: 1 },
    ],
  };

  const recordWithStaleEnglish: LocalizedText = {
    sourceLocale: 'zh',
    sourceText: '珍珠奶茶',
    sourceRevision: 2,
    cells: [
      { locale: 'zh', text: '珍珠奶茶', basedOnSourceRevision: 2 },
      { locale: 'en', text: 'Old Pearl Tea', basedOnSourceRevision: 1 },
    ],
  };

  it('resolves target locale translation when available and fresh', () => {
    expect(resolveLocalizedText(chineseSourceRecord, 'en', '珍珠奶茶'))
      .toBe('Pearl milk tea');
    expect(resolveLocalizedText(chineseSourceRecord, 'km', '珍珠奶茶'))
      .toBe('តែទឹកដោះគោគុជ');
    expect(resolveLocalizedText(chineseSourceRecord, 'zh', '珍珠奶茶'))
      .toBe('珍珠奶茶');
  });

  it('falls back to source text when target translation is stale', () => {
    // English cell is based on revision 1, but sourceRevision is 2
    expect(resolveLocalizedText(recordWithStaleEnglish, 'en', '珍珠奶茶'))
      .toBe('珍珠奶茶');
  });

  it('falls back to source text when target cell is missing', () => {
    const missingKhmerRecord: LocalizedText = {
      sourceLocale: 'zh',
      sourceText: '珍珠奶茶',
      sourceRevision: 1,
      cells: [
        { locale: 'zh', text: '珍珠奶茶', basedOnSourceRevision: 1 },
        { locale: 'en', text: 'Pearl milk tea', basedOnSourceRevision: 1 },
      ],
    };
    expect(resolveLocalizedText(missingKhmerRecord, 'km', '珍珠奶茶'))
      .toBe('珍珠奶茶');
  });

  it('resolves explicitly cleared descriptions to empty string', () => {
    const clearedDescriptionRecord: LocalizedText = {
      sourceLocale: 'en',
      sourceText: '',
      sourceRevision: 2,
      cells: [],
    };
    expect(resolveLocalizedText(clearedDescriptionRecord, 'en', 'Old raw description'))
      .toBe('');
    expect(resolveLocalizedText(clearedDescriptionRecord, 'km', 'Old raw description'))
      .toBe('');
    expect(resolveLocalizedText(clearedDescriptionRecord, 'zh', 'Old raw description'))
      .toBe('');
  });

  it('returns raw text when record is undefined (legacy fallback caller branch)', () => {
    expect(resolveLocalizedText(undefined, 'en', 'Raw Legacy Text'))
      .toBe('Raw Legacy Text');
    expect(resolveLocalizedText(undefined, 'km', 'Raw Legacy Text'))
      .toBe('Raw Legacy Text');
  });

  it('normalizes locales like en-US and zh-CN', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('zh-TW')).toBe('zh');
    expect(normalizeLocale('km-KH')).toBe('km');
    expect(resolveLocalizedText(chineseSourceRecord, 'en-US', '珍珠奶茶'))
      .toBe('Pearl milk tea');
  });
});

describe('resolveWithLegacyFallback', () => {
  it('calls t(raw) only when record is undefined', () => {
    const fakeT = vi.fn((key: string, _def?: string) => `translated:${key}`);

    // When record is undefined, uses legacy t(raw)
    const legacyResult = resolveWithLegacyFallback(undefined, 'en', 'originalRaw', fakeT);
    expect(fakeT).toHaveBeenCalledWith('originalRaw', 'originalRaw');
    expect(legacyResult).toBe('translated:originalRaw');

    fakeT.mockClear();

    // When record is defined, does NOT call t() and uses database translations
    const localizedRecord: LocalizedText = {
      sourceLocale: 'km',
      sourceText: 'កាហ្វេដោះគោទឹកកក',
      sourceRevision: 1,
      cells: [
        { locale: 'en', text: 'Iced Milk Coffee', basedOnSourceRevision: 1 },
      ],
    };
    const dbResult = resolveWithLegacyFallback(localizedRecord, 'en', 'fallbackRaw', fakeT);
    expect(fakeT).not.toHaveBeenCalled();
    expect(dbResult).toBe('Iced Milk Coffee');
  });
});
