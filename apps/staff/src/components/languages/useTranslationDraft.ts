import { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE, authHeaders } from '../../lib/api';

export type Locale = 'en' | 'km' | 'zh';
export type SourceLocaleOption = 'auto' | 'en' | 'km' | 'zh';

export interface LocalizedCellDraft {
  locale: Locale;
  text: string;
  reviewed: boolean;
  origin: 'original' | 'ai' | 'manual' | 'legacy';
}

export type InitialCellInput = {
  text: string;
  reviewed?: boolean;
  origin?: 'original' | 'ai' | 'manual' | 'legacy';
};

export interface UseTranslationDraftOptions {
  clientKey: string;
  field: 'name' | 'description';
  initialSourceLocale?: SourceLocaleOption;
  initialCells?: Partial<Record<Locale, InitialCellInput>>;
  context?: { category?: string; itemName?: string };
  onChange?: (state: {
    sourceLocale: Locale | null;
    cells: LocalizedCellDraft[];
  }) => void;
}

export function detectClientLocale(text: string): {
  locale: Locale | null;
  ambiguous: boolean;
} {
  const trimmed = text.trim();
  if (!trimmed) return { locale: null, ambiguous: true };

  const cleaned = trimmed
    .replace(/\b(ai-cha|zhengda|ai-scream|sund-ai)\b/gi, '')
    .replace(/\b(\d+)\s*(ml|l|oz|g|kg|cm|mm|%)\b/gi, '')
    .replace(/[\d\s.,!?:;/\\()+\-%$#@&*=[\]{}<>"'`~|^_]/g, '');

  const khmer = (cleaned.match(/[\u1780-\u17FF]/g) || []).length;
  const chinese = (cleaned.match(/[\u4E00-\u9FFF]/g) || []).length;
  const latin = (cleaned.match(/[a-zA-Z]/g) || []).length;
  const total = khmer + chinese + latin;

  if (total === 0) return { locale: null, ambiguous: true };
  if (khmer > 0 && chinese === 0 && latin === 0) return { locale: 'km', ambiguous: false };
  if (chinese > 0 && khmer === 0 && latin === 0) return { locale: 'zh', ambiguous: false };
  if (latin >= 2 && khmer === 0 && chinese === 0) return { locale: 'en', ambiguous: false };
  if (latin < 2 && khmer === 0 && chinese === 0) return { locale: null, ambiguous: true };

  if (khmer / total >= 0.6) return { locale: 'km', ambiguous: false };
  if (chinese / total >= 0.6) return { locale: 'zh', ambiguous: false };
  if (latin / total >= 0.6) return { locale: 'en', ambiguous: false };

  return { locale: null, ambiguous: true };
}

export function useTranslationDraft(options: UseTranslationDraftOptions) {
  const { clientKey, field, context, onChange } = options;

  const [sourceLocaleChoice, setSourceLocaleChoice] = useState<SourceLocaleOption>(
    options.initialSourceLocale || 'auto'
  );

  const [cells, setCells] = useState<Record<Locale, LocalizedCellDraft>>(() => {
    return {
      en: {
        locale: 'en',
        text: options.initialCells?.en?.text || '',
        reviewed: options.initialCells?.en?.reviewed ?? false,
        origin: options.initialCells?.en?.origin || 'manual',
      },
      km: {
        locale: 'km',
        text: options.initialCells?.km?.text || '',
        reviewed: options.initialCells?.km?.reviewed ?? false,
        origin: options.initialCells?.km?.origin || 'manual',
      },
      zh: {
        locale: 'zh',
        text: options.initialCells?.zh?.text || '',
        reviewed: options.initialCells?.zh?.reviewed ?? false,
        origin: options.initialCells?.zh?.origin || 'manual',
      },
    };
  });

  const [detectedLocale, setDetectedLocale] = useState<Locale | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generationRef = useRef(0);
  const lastDraftedTextRef = useRef('');
  const isComposingRef = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const lastBroadcastRef = useRef<string>('');

  // Compute effective source locale
  const effectiveSourceLocale: Locale = (() => {
    if (sourceLocaleChoice !== 'auto') {
      return sourceLocaleChoice;
    }
    if (detectedLocale) {
      return detectedLocale;
    }
    // Check if one cell has text while others are empty
    const populated = (['en', 'km', 'zh'] as Locale[]).filter((l) => cells[l].text.trim().length > 0);
    if (populated.length === 1) {
      return populated[0];
    }
    return 'en';
  })();

  // Broadcast state changes
  useEffect(() => {
    const serialized = JSON.stringify({ effectiveSourceLocale, cells });
    if (serialized !== lastBroadcastRef.current) {
      lastBroadcastRef.current = serialized;
      const cellList = Object.values(cells);
      onChangeRef.current?.({
        sourceLocale: effectiveSourceLocale,
        cells: cellList,
      });
    }
  }, [cells, effectiveSourceLocale]);

  const updateCell = useCallback((locale: Locale, text: string) => {
    setCells((prev) => {
      const isEffectiveSource = locale === effectiveSourceLocale;
      return {
        ...prev,
        [locale]: {
          locale,
          text,
          reviewed: isEffectiveSource ? true : true, // manual edits mark reviewed
          origin: isEffectiveSource ? 'original' : 'manual',
        },
      };
    });

    if (sourceLocaleChoice === 'auto') {
      const otherCellsWithText = (['en', 'km', 'zh'] as Locale[]).filter(
        (l) => l !== locale && cells[l].text.trim().length > 0
      );

      if (otherCellsWithText.length === 0 || locale === effectiveSourceLocale) {
        const det = detectClientLocale(text);
        if (det.locale) {
          setDetectedLocale(det.locale);
          setNeedsConfirmation(det.ambiguous);
        } else {
          setNeedsConfirmation(det.ambiguous);
        }
      }
    }
  }, [cells, effectiveSourceLocale, sourceLocaleChoice]);

  const triggerDraft = useCallback(
    async (forceAll = false) => {
      const sourceText = cells[effectiveSourceLocale]?.text?.trim();
      if (!sourceText) return;

      if (!forceAll && sourceText === lastDraftedTextRef.current) {
        return;
      }

      // Targets are all locales other than effective source
      const allTargets: Locale[] = (['en', 'km', 'zh'] as Locale[]).filter(
        (l) => l !== effectiveSourceLocale
      );

      // Only populate unreviewed / empty targets unless forced
      const targetsToTranslate = forceAll
        ? allTargets
        : allTargets.filter((l) => !cells[l].reviewed || cells[l].text.trim() === '');

      if (targetsToTranslate.length === 0) return;

      setIsLoading(true);
      setError(null);
      generationRef.current += 1;
      const currentGen = generationRef.current;
      const snapshotText = sourceText;

      try {
        const res = await fetch(`${API_BASE}/api/translations/draft`, {
          method: 'POST',
          headers: {
            ...authHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            entries: [
              {
                clientKey,
                text: snapshotText,
                sourceLocale: sourceLocaleChoice,
                targetLocales: targetsToTranslate,
                context: { field, ...context },
              },
            ],
          }),
        });

        // Discard stale responses
        if (generationRef.current !== currentGen) {
          return;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Translation draft failed (${res.status})`);
        }

        const data = await res.json();
        const entry = data?.entries?.[0];

        if (entry) {
          if (entry.sourceLocale && sourceLocaleChoice === 'auto') {
            setDetectedLocale(entry.sourceLocale);
          }
          if (entry.needsLanguageConfirmation !== undefined) {
            setNeedsConfirmation(entry.needsLanguageConfirmation);
          }

          setCells((prev) => {
            const next = { ...prev };
            for (const tgt of targetsToTranslate) {
              const trans = entry.translations?.[tgt];
              // Only populate if cell hasn't been manually edited in-flight or if forced
              if (trans && (forceAll || !next[tgt].reviewed || next[tgt].text.trim() === '')) {
                next[tgt] = {
                  locale: tgt,
                  text: trans,
                  reviewed: false, // AI draft is unreviewed
                  origin: 'ai',
                };
              }
            }
            return next;
          });

          lastDraftedTextRef.current = snapshotText;
        }
      } catch (err: any) {
        if (generationRef.current === currentGen) {
          setError(err.message || 'Failed to generate translations');
        }
      } finally {
        if (generationRef.current === currentGen) {
          setIsLoading(false);
        }
      }
    },
    [cells, effectiveSourceLocale, sourceLocaleChoice, clientKey, field, context]
  );

  const handleBlur = useCallback(() => {
    if (isComposingRef.current) return;
    triggerDraft(false);
  }, [triggerDraft]);

  const saveOriginalOnly = useCallback(() => {
    setIsLoading(false);
    setError(null);
    generationRef.current += 1;
  }, []);

  const confirmSourceLanguage = useCallback((locale: Locale) => {
    setSourceLocaleChoice(locale);
    setDetectedLocale(locale);
    setNeedsConfirmation(false);
  }, []);

  return {
    sourceLocaleChoice,
    setSourceLocaleChoice,
    effectiveSourceLocale,
    detectedLocale,
    needsConfirmation,
    confirmSourceLanguage,
    cells,
    updateCell,
    triggerDraft,
    handleBlur,
    isLoading,
    error,
    saveOriginalOnly,
    isComposingRef,
  };
}
