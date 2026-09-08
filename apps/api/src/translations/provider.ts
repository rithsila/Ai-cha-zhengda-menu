import {
  Locale,
  SUPPORTED_LOCALES,
  TranslationDraftRequest,
  TranslationDraftResult,
  TranslationProvider,
} from './types.js';
import { getGlossaryPromptContext } from './glossary.js';

export class TranslationError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = 'TRANSLATION_ERROR') {
    super(message);
    this.name = 'TranslationError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Heuristic script detector for en, km, and zh.
 */
export function detectLocaleFromText(text: string): {
  locale: Locale | null;
  ambiguous: boolean;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { locale: null, ambiguous: true };
  }

  // Strip known brand names and common units for detection purpose
  const cleaned = trimmed
    .replace(/\b(ai-cha|zhengda|ai-scream|sund-ai)\b/gi, '')
    .replace(/\b(\d+)\s*(ml|l|oz|g|kg|cm|mm|%)\b/gi, '')
    .replace(/[\d\s.,!?:;/\\()+\-%$#@&*=[\]{}<>"'`~|^_]/g, '');

  // Count characters in each script
  const khmerMatches = cleaned.match(/[\u1780-\u17FF]/g) || [];
  const chineseMatches = cleaned.match(/[\u4E00-\u9FFF]/g) || [];
  const latinMatches = cleaned.match(/[a-zA-Z]/g) || [];

  const khmerCount = khmerMatches.length;
  const chineseCount = chineseMatches.length;
  const latinCount = latinMatches.length;

  const totalAlphabet = khmerCount + chineseCount + latinCount;

  // If no identifiable alphabet characters remaining (e.g. only numbers, symbols, units like 500ml)
  if (totalAlphabet === 0) {
    return { locale: null, ambiguous: true };
  }

  // Check pure script
  if (khmerCount > 0 && chineseCount === 0 && latinCount === 0) {
    return { locale: 'km', ambiguous: false };
  }
  if (chineseCount > 0 && khmerCount === 0 && latinCount === 0) {
    return { locale: 'zh', ambiguous: false };
  }
  if (latinCount >= 2 && khmerCount === 0 && chineseCount === 0) {
    return { locale: 'en', ambiguous: false };
  }
  if (latinCount < 2 && khmerCount === 0 && chineseCount === 0) {
    // Single isolated letter e.g. "M" or "L" can be ambiguous size code
    return { locale: null, ambiguous: true };
  }

  // Mixed scripts (e.g., "Ai-Cha តែបៃតង" or "XXL大鸡排")
  if (khmerCount / totalAlphabet >= 0.6) {
    return { locale: 'km', ambiguous: false };
  }
  if (chineseCount / totalAlphabet >= 0.6) {
    return { locale: 'zh', ambiguous: false };
  }
  if (latinCount / totalAlphabet >= 0.6) {
    return { locale: 'en', ambiguous: false };
  }

  // Truly ambiguous mixed or equal balance
  return { locale: null, ambiguous: true };
}

/**
 * Validate translation draft request payload constraints:
 * - Max 20 entries
 * - Max 200 chars per name
 * - Max 2,000 chars per description
 * - Max 12,000 chars overall
 * - Target locales must be supported and exclude confirmed source locale
 */
export function validateDraftRequest(input: TranslationDraftRequest): void {
  if (!input || !input.requestId || typeof input.requestId !== 'string') {
    throw new TranslationError('Invalid or missing requestId', 400, 'INVALID_REQUEST_ID');
  }

  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new TranslationError('Entries array must not be empty', 400, 'EMPTY_ENTRIES');
  }

  if (input.entries.length > 20) {
    throw new TranslationError('Maximum 20 entries allowed per draft request', 400, 'TOO_MANY_ENTRIES');
  }

  let totalChars = 0;
  const seenClientKeys = new Set<string>();

  for (const entry of input.entries) {
    if (!entry.clientKey || typeof entry.clientKey !== 'string') {
      throw new TranslationError('Each entry must have a valid clientKey string', 400, 'INVALID_CLIENT_KEY');
    }
    if (seenClientKeys.has(entry.clientKey)) {
      throw new TranslationError(`Duplicate clientKey in request: ${entry.clientKey}`, 400, 'DUPLICATE_CLIENT_KEY');
    }
    seenClientKeys.add(entry.clientKey);

    if (typeof entry.text !== 'string' || entry.text.trim().length === 0) {
      throw new TranslationError(`Entry ${entry.clientKey} text cannot be blank`, 400, 'EMPTY_TEXT');
    }

    const field = entry.context?.field;
    if (field !== 'name' && field !== 'description') {
      throw new TranslationError(`Entry ${entry.clientKey} invalid field: ${field}`, 400, 'INVALID_FIELD');
    }

    if (field === 'name' && entry.text.length > 200) {
      throw new TranslationError(`Entry ${entry.clientKey} name exceeds 200 characters`, 400, 'TEXT_TOO_LONG');
    }
    if (field === 'description' && entry.text.length > 2000) {
      throw new TranslationError(`Entry ${entry.clientKey} description exceeds 2000 characters`, 400, 'TEXT_TOO_LONG');
    }

    totalChars += entry.text.length;

    if (!Array.isArray(entry.targetLocales) || entry.targetLocales.length === 0) {
      throw new TranslationError(`Entry ${entry.clientKey} must specify at least one targetLocale`, 400, 'EMPTY_TARGET_LOCALES');
    }

    for (const target of entry.targetLocales) {
      if (!SUPPORTED_LOCALES.includes(target)) {
        throw new TranslationError(`Unsupported targetLocale: ${target}`, 400, 'UNSUPPORTED_LOCALE');
      }
    }

    if (entry.sourceLocale !== 'auto') {
      if (!SUPPORTED_LOCALES.includes(entry.sourceLocale)) {
        throw new TranslationError(`Unsupported sourceLocale: ${entry.sourceLocale}`, 400, 'UNSUPPORTED_LOCALE');
      }
      if (entry.targetLocales.includes(entry.sourceLocale)) {
        throw new TranslationError(`Target locales must exclude confirmed sourceLocale: ${entry.sourceLocale}`, 400, 'TARGET_CONTAINS_SOURCE');
      }
    }
  }

  if (totalChars > 12000) {
    throw new TranslationError('Overall text length exceeds 12,000 characters limit', 400, 'PAYLOAD_TOO_LARGE');
  }
}

/**
 * In-process concurrency and rate limiter.
 * Manager quota: 10 requests / minute.
 * Global concurrency limit: 2 simultaneous translation calls.
 */
export class TranslationLimiter {
  private static activeCalls = 0;
  private static readonly MAX_CONCURRENCY = 2;
  private static readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private static readonly MAX_REQUESTS_PER_WINDOW = 10;
  private static requestTimestamps: Map<string, number[]> = new Map();

  public static async acquire(managerKey: string): Promise<() => void> {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(managerKey) || [];
    const validTimestamps = timestamps.filter((t) => now - t < this.RATE_LIMIT_WINDOW_MS);

    if (validTimestamps.length >= this.MAX_REQUESTS_PER_WINDOW) {
      throw new TranslationError(
        'Rate limit exceeded: maximum 10 translation requests per minute per manager.',
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    if (this.activeCalls >= this.MAX_CONCURRENCY) {
      throw new TranslationError(
        'Server busy: maximum concurrent translation requests reached. Please retry in a moment.',
        503,
        'CONCURRENCY_LIMIT_REACHED'
      );
    }

    this.activeCalls += 1;
    validTimestamps.push(now);
    this.requestTimestamps.set(managerKey, validTimestamps);

    return () => {
      this.activeCalls = Math.max(0, this.activeCalls - 1);
    };
  }

  public static resetForTesting(): void {
    this.activeCalls = 0;
    this.requestTimestamps.clear();
  }
}

/**
 * Mock translation provider for unit tests and local/disabled environments.
 */
export class MockTranslationProvider implements TranslationProvider {
  private dictionary: Map<string, Partial<Record<Locale, string>>>;

  constructor(customMap?: Record<string, Partial<Record<Locale, string>>>) {
    this.dictionary = new Map(Object.entries(customMap || {}));
  }

  public setTranslation(text: string, targets: Partial<Record<Locale, string>>): void {
    this.dictionary.set(text.trim(), targets);
  }

  async translate(input: TranslationDraftRequest): Promise<TranslationDraftResult> {
    validateDraftRequest(input);

    const resultEntries = input.entries.map((entry) => {
      let resolvedSource: Locale | null = null;
      let needsConfirmation = false;

      if (entry.sourceLocale === 'auto') {
        const detected = detectLocaleFromText(entry.text);
        resolvedSource = detected.locale;
        needsConfirmation = detected.ambiguous;
      } else {
        resolvedSource = entry.sourceLocale;
      }

      const translations: Partial<Record<Locale, string>> = {};
      const dictMatch = this.dictionary.get(entry.text.trim());

      for (const target of entry.targetLocales) {
        if (target === resolvedSource) continue;

        if (dictMatch && dictMatch[target]) {
          translations[target] = dictMatch[target];
        } else {
          // Deterministic stub: prefix with locale
          if (target === 'en') {
            translations.en = entry.text.startsWith('en:') ? entry.text : `[EN] ${entry.text}`;
          } else if (target === 'km') {
            translations.km = entry.text.startsWith('km:') ? entry.text : `[KM] ${entry.text}`;
          } else if (target === 'zh') {
            translations.zh = entry.text.startsWith('zh:') ? entry.text : `[ZH] ${entry.text}`;
          }
        }
      }

      return {
        clientKey: entry.clientKey,
        sourceLocale: resolvedSource,
        needsLanguageConfirmation: needsConfirmation,
        translations,
      };
    });

    return {
      requestId: input.requestId,
      entries: resultEntries,
    };
  }
}

/**
 * OpenAI / OpenAI-compatible Translation Provider
 */
export class OpenAITranslationProvider implements TranslationProvider {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(apiKey: string, model = 'gpt-4o-mini', endpoint = 'https://api.openai.com/v1/chat/completions') {
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = endpoint;
  }

  async translate(input: TranslationDraftRequest): Promise<TranslationDraftResult> {
    validateDraftRequest(input);

    const glossaryContext = getGlossaryPromptContext();
    const systemPrompt = `You are an expert menu translator for a dual-brand restaurant:
1. "Ai-Cha": ice cream, soft serve, boba, fruit tea, and milk tea.
2. "Zhengda": Taiwanese XXL crispy fried chicken, popcorn chicken, and rice bowls.

Rules:
- Translate natural F&B menu text between English (en), Khmer (km), and Chinese (zh).
- Retain exact numbers, sizes (e.g. 400ml, 1000ml, 50%), and price/modifier meanings.
- Never invent ingredients, allergens, or dietary claims.
- Use Simplified Chinese characters standard in modern bubble tea and dining menus.
- Use natural Cambodian Khmer food and beverage terminology.
- Respect approved glossary terms:
${glossaryContext}

You must return a JSON object with:
{
  "requestId": string (MUST MATCH input requestId exactly),
  "entries": [
    {
      "clientKey": string (MUST MATCH input clientKey exactly),
      "detectedSourceLocale": "en" | "km" | "zh" | null,
      "needsLanguageConfirmation": boolean,
      "translations": {
        [locale in "en" | "km" | "zh"]?: string
      }
    }
  ]
}
Do NOT include translations for the sourceLocale. Only translate requested targetLocales.`;

    const userPayload = JSON.stringify({
      requestId: input.requestId,
      items: input.entries.map((e) => ({
        clientKey: e.clientKey,
        text: e.text,
        sourceLocale: e.sourceLocale,
        targetLocales: e.targetLocales,
        context: e.context,
      })),
    });

    // Up to 1 retry on transient failure
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < 2) {
      attempt += 1;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20_000);

      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPayload },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text();
          if (status >= 500 && attempt < 2) {
            // Transient 5xx error, retry once
            lastError = new TranslationError(`Provider server error (${status}): ${errorText}`, 502, 'PROVIDER_ERROR');
            continue;
          }
          throw new TranslationError(`Provider returned error (${status}): ${errorText}`, 502, 'PROVIDER_ERROR');
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string') {
          throw new TranslationError('Provider returned empty content', 502, 'PROVIDER_EMPTY_OUTPUT');
        }

        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new TranslationError('Provider returned malformed JSON', 502, 'PROVIDER_MALFORMED_JSON');
        }

        // Validate structure
        if (parsed.requestId !== input.requestId) {
          throw new TranslationError(
            `Provider changed requestId: expected ${input.requestId}, got ${parsed.requestId}`,
            502,
            'PROVIDER_INVALID_OUTPUT'
          );
        }

        if (!Array.isArray(parsed.entries)) {
          throw new TranslationError('Provider entries must be an array', 502, 'PROVIDER_INVALID_OUTPUT');
        }

        const resultMap = new Map<string, any>();
        for (const pe of parsed.entries) {
          if (!pe.clientKey) continue;
          resultMap.set(pe.clientKey, pe);
        }

        const finalEntries = input.entries.map((reqEntry) => {
          const resEntry = resultMap.get(reqEntry.clientKey);
          if (!resEntry) {
            throw new TranslationError(
              `Provider missing translation for clientKey: ${reqEntry.clientKey}`,
              502,
              'PROVIDER_MISSING_ENTRY'
            );
          }

          let resolvedSource: Locale | null = null;
          let needsConfirmation = false;

          if (reqEntry.sourceLocale === 'auto') {
            if (['en', 'km', 'zh'].includes(resEntry.detectedSourceLocale)) {
              resolvedSource = resEntry.detectedSourceLocale;
            } else {
              const fallbackDetect = detectLocaleFromText(reqEntry.text);
              resolvedSource = fallbackDetect.locale;
              needsConfirmation = fallbackDetect.ambiguous;
            }
            if (resEntry.needsLanguageConfirmation !== undefined) {
              needsConfirmation = Boolean(resEntry.needsLanguageConfirmation);
            }
          } else {
            resolvedSource = reqEntry.sourceLocale;
          }

          const translations: Partial<Record<Locale, string>> = {};
          if (resEntry.translations && typeof resEntry.translations === 'object') {
            for (const target of reqEntry.targetLocales) {
              if (target === resolvedSource) continue;
              const val = resEntry.translations[target];
              if (typeof val === 'string' && val.trim().length > 0) {
                translations[target] = val.trim();
              }
            }
          }

          return {
            clientKey: reqEntry.clientKey,
            sourceLocale: resolvedSource,
            needsLanguageConfirmation: needsConfirmation,
            translations,
          };
        });

        return {
          requestId: input.requestId,
          entries: finalEntries,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
          lastError = new TranslationError('Provider request timed out after 20s', 504, 'PROVIDER_TIMEOUT');
          if (attempt < 2) continue;
        } else if (err instanceof TranslationError) {
          throw err;
        } else {
          lastError = new TranslationError(err.message || 'Provider connection failed', 502, 'PROVIDER_NETWORK_ERROR');
          if (attempt < 2) continue;
        }
      }
    }

    throw lastError || new TranslationError('Translation failed after retry', 502, 'PROVIDER_ERROR');
  }
}
