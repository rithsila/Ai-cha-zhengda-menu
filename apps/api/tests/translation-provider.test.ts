import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectLocaleFromText,
  validateDraftRequest,
  MockTranslationProvider,
  OpenAITranslationProvider,
  TranslationLimiter,
  TranslationError,
} from '../src/translations/provider.js';
import { TranslationDraftRequest } from '../src/translations/types.js';

describe('Translation Provider & Quality Controls (Task 1)', () => {
  beforeEach(() => {
    TranslationLimiter.resetForTesting();
    vi.restoreAllMocks();
  });

  describe('Heuristic Language Detection', () => {
    it('detects Khmer script reliably', () => {
      const result = detectLocaleFromText('តែទឹកដោះគោគុជស្ករត្នោត');
      expect(result.locale).toBe('km');
      expect(result.ambiguous).toBe(false);
    });

    it('detects Chinese characters reliably', () => {
      const result = detectLocaleFromText('珍珠奶茶');
      expect(result.locale).toBe('zh');
      expect(result.ambiguous).toBe(false);
    });

    it('detects English Latin alphabet reliably', () => {
      const result = detectLocaleFromText('Brown Sugar Boba Milk');
      expect(result.locale).toBe('en');
      expect(result.ambiguous).toBe(false);
    });

    it('flags ambiguous symbols and numbers for owner confirmation', () => {
      const result = detectLocaleFromText('100% (500ml)');
      expect(result.ambiguous).toBe(true);
      expect(result.locale).toBeNull();
    });

    it('resolves dominant script in mixed brand phrases', () => {
      const result = detectLocaleFromText('Ai-Cha តែបៃតងកោណស្រួយ');
      expect(result.locale).toBe('km');
      expect(result.ambiguous).toBe(false);
    });
  });

  describe('Draft Request Validation', () => {
    it('rejects empty entries', () => {
      const invalid = { requestId: 'req-1', entries: [] } as any;
      expect(() => validateDraftRequest(invalid)).toThrow(TranslationError);
    });

    it('rejects more than 20 entries', () => {
      const entries = Array.from({ length: 21 }, (_, i) => ({
        clientKey: `key-${i}`,
        text: 'Drink',
        sourceLocale: 'auto' as const,
        targetLocales: ['km' as const],
        context: { field: 'name' as const },
      }));
      expect(() => validateDraftRequest({ requestId: 'req-21', entries })).toThrow('Maximum 20 entries');
    });

    it('rejects duplicate client keys', () => {
      const request: TranslationDraftRequest = {
        requestId: 'req-dup',
        entries: [
          { clientKey: 'k1', text: 'Item 1', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
          { clientKey: 'k1', text: 'Item 2', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
        ],
      };
      expect(() => validateDraftRequest(request)).toThrow('Duplicate clientKey');
    });

    it('rejects targetLocales containing confirmed sourceLocale', () => {
      const request: TranslationDraftRequest = {
        requestId: 'req-tgt',
        entries: [
          { clientKey: 'k1', text: 'Item 1', sourceLocale: 'en', targetLocales: ['en', 'zh'], context: { field: 'name' } },
        ],
      };
      expect(() => validateDraftRequest(request)).toThrow('Target locales must exclude confirmed sourceLocale');
    });

    it('rejects names longer than 200 chars', () => {
      const request: TranslationDraftRequest = {
        requestId: 'req-len',
        entries: [
          { clientKey: 'k1', text: 'A'.repeat(201), sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
        ],
      };
      expect(() => validateDraftRequest(request)).toThrow('name exceeds 200 characters');
    });

    it('rejects descriptions longer than 2000 chars', () => {
      const request: TranslationDraftRequest = {
        requestId: 'req-desc-len',
        entries: [
          { clientKey: 'k1', text: 'A'.repeat(2001), sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'description' } },
        ],
      };
      expect(() => validateDraftRequest(request)).toThrow('description exceeds 2000 characters');
    });
  });

  describe('Mock Translation Provider', () => {
    it('translates correctly without generating source locale translation', async () => {
      const provider = new MockTranslationProvider();
      provider.setTranslation('珍珠奶茶', {
        en: 'Pearl milk tea',
        km: 'តែទឹកដោះគោគុជ',
      });

      const result = await provider.translate({
        requestId: 'req-100',
        entries: [
          {
            clientKey: 'item-1',
            text: '珍珠奶茶',
            sourceLocale: 'zh',
            targetLocales: ['en', 'km'],
            context: { field: 'name', category: 'Milk Tea' },
          },
        ],
      });

      expect(result.requestId).toBe('req-100');
      expect(result.entries[0].sourceLocale).toBe('zh');
      expect(result.entries[0].translations.en).toBe('Pearl milk tea');
      expect(result.entries[0].translations.km).toBe('តែទឹកដោះគោគុជ');
      expect(result.entries[0].translations.zh).toBeUndefined();
    });

    it('preserves clientKey across all entries', async () => {
      const provider = new MockTranslationProvider();
      const result = await provider.translate({
        requestId: 'req-keys',
        entries: [
          { clientKey: 'key-a', text: 'Oolong Tea', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
          { clientKey: 'key-b', text: 'Passion Fruit', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
        ],
      });

      expect(result.entries.map((e) => e.clientKey)).toEqual(['key-a', 'key-b']);
    });
  });

  describe('OpenAI Translation Provider Invariants and Error Handling', () => {
    it('handles successful API response matching request IDs and requested targets', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  requestId: 'req-live-1',
                  entries: [
                    {
                      clientKey: 'item-pearl',
                      detectedSourceLocale: 'zh',
                      needsLanguageConfirmation: false,
                      translations: {
                        en: 'Pearl milk tea',
                        km: 'តែទឹកដោះគោគុជ',
                      },
                    },
                  ],
                }),
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fakeFetch);

      const provider = new OpenAITranslationProvider('test-key', 'gpt-4o-mini');
      const result = await provider.translate({
        requestId: 'req-live-1',
        entries: [
          {
            clientKey: 'item-pearl',
            text: '珍珠奶茶',
            sourceLocale: 'zh',
            targetLocales: ['en', 'km'],
            context: { field: 'name' },
          },
        ],
      });

      expect(result.entries[0].sourceLocale).toBe('zh');
      expect(result.entries[0].translations.en).toBe('Pearl milk tea');
      expect(result.entries[0].translations.zh).toBeUndefined();
    });

    it('rejects provider output if requestId was altered', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  requestId: 'altered-id',
                  entries: [],
                }),
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', fakeFetch);

      const provider = new OpenAITranslationProvider('test-key');
      await expect(
        provider.translate({
          requestId: 'original-id',
          entries: [
            { clientKey: 'k1', text: 'Tea', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
          ],
        })
      ).rejects.toThrow('Provider changed requestId');
    });

    it('rejects malformed JSON response from provider', async () => {
      const fakeFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Not valid json' } }],
        }),
      });
      vi.stubGlobal('fetch', fakeFetch);

      const provider = new OpenAITranslationProvider('test-key');
      await expect(
        provider.translate({
          requestId: 'req-bad-json',
          entries: [
            { clientKey: 'k1', text: 'Tea', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
          ],
        })
      ).rejects.toThrow('Provider returned malformed JSON');
    });

    it('retries once on transient 500 error before succeeding', async () => {
      let callCount = 0;
      const fakeFetch = vi.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: false,
            status: 503,
            text: async () => 'Service Temporarily Unavailable',
          };
        }
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    requestId: 'req-retry',
                    entries: [
                      {
                        clientKey: 'k1',
                        detectedSourceLocale: 'en',
                        translations: { zh: '奶茶' },
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        };
      });
      vi.stubGlobal('fetch', fakeFetch);

      const provider = new OpenAITranslationProvider('test-key');
      const result = await provider.translate({
        requestId: 'req-retry',
        entries: [
          { clientKey: 'k1', text: 'Milk Tea', sourceLocale: 'en', targetLocales: ['zh'], context: { field: 'name' } },
        ],
      });

      expect(callCount).toBe(2);
      expect(result.entries[0].translations.zh).toBe('奶茶');
    });
  });

  describe('Concurrency & Rate Limiting', () => {
    it('enforces maximum 2 concurrent translation requests', async () => {
      const release1 = await TranslationLimiter.acquire('manager-1');
      const release2 = await TranslationLimiter.acquire('manager-1');

      await expect(TranslationLimiter.acquire('manager-2')).rejects.toThrow(
        'Server busy: maximum concurrent translation requests reached.'
      );

      release1();
      const release3 = await TranslationLimiter.acquire('manager-2');
      expect(release3).toBeDefined();

      release2();
      release3();
    });

    it('enforces maximum 10 requests per minute per manager', async () => {
      for (let i = 0; i < 10; i++) {
        const release = await TranslationLimiter.acquire('manager-burst');
        release();
      }

      await expect(TranslationLimiter.acquire('manager-burst')).rejects.toThrow(
        'Rate limit exceeded: maximum 10 translation requests per minute'
      );
    });
  });
});
