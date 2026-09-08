import React from 'react';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import {
  useTranslationDraft,
  type Locale,
  type SourceLocaleOption,
  type LocalizedCellDraft,
  type InitialCellInput,
} from './useTranslationDraft';

export interface TranslationEditorProps {
  label: string;
  fieldName: string; // e.g. "item name", "description", "category name"
  fieldType?: 'input' | 'textarea';
  clientKey: string;
  field: 'name' | 'description';
  initialSourceLocale?: SourceLocaleOption;
  initialCells?: Partial<Record<Locale, InitialCellInput>>;
  context?: { category?: string; itemName?: string };
  required?: boolean;
  placeholder?: string;
  onChange?: (state: {
    sourceLocale: Locale | null;
    cells: LocalizedCellDraft[];
  }) => void;
  onPrimaryTextChange?: (text: string) => void;
  compact?: boolean;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  km: 'Khmer',
  zh: 'Chinese',
};

export const TranslationEditor: React.FC<TranslationEditorProps> = ({
  label,
  fieldName,
  fieldType = 'input',
  clientKey,
  field,
  initialSourceLocale,
  initialCells,
  context,
  required = false,
  placeholder,
  onChange,
  onPrimaryTextChange,
  compact = false,
}) => {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const onPrimaryTextChangeRef = React.useRef(onPrimaryTextChange);
  onPrimaryTextChangeRef.current = onPrimaryTextChange;

  const handleDraftChange = React.useCallback(
    (st: { sourceLocale: Locale | null; cells: LocalizedCellDraft[] }) => {
      if (onChangeRef.current) onChangeRef.current(st);
      if (onPrimaryTextChangeRef.current) {
        const primaryText =
          st.cells.find((c) => c.locale === st.sourceLocale)?.text ||
          st.cells[0]?.text ||
          '';
        onPrimaryTextChangeRef.current(primaryText);
      }
    },
    []
  );

  const {
    sourceLocaleChoice,
    setSourceLocaleChoice,
    effectiveSourceLocale,
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
  } = useTranslationDraft({
    clientKey,
    field,
    initialSourceLocale,
    initialCells,
    context,
    onChange: handleDraftChange,
  });

  const handleCellChange = (loc: Locale, val: string) => {
    updateCell(loc, val);
  };

  return (
    <div className={`space-y-2 ${compact ? 'text-xs' : ''}`}>
      {/* Header with Source Language Selector & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        <div className="flex items-center gap-2">
          {/* Source Language Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-ink-soft hidden sm:inline">Original:</span>
            <select
              aria-label={`Original language for ${fieldName}`}
              value={sourceLocaleChoice}
              onChange={(e) => setSourceLocaleChoice(e.target.value as SourceLocaleOption)}
              className="rounded border border-border bg-surface px-2 py-0.5 text-xs font-medium text-ink focus:border-accent outline-none"
            >
              <option value="auto">Auto (Detect)</option>
              <option value="en">English</option>
              <option value="km">Khmer</option>
              <option value="zh">Chinese</option>
            </select>
          </div>

          {/* Regenerate Button */}
          <button
            type="button"
            onClick={() => triggerDraft(true)}
            disabled={isLoading || !cells[effectiveSourceLocale]?.text?.trim()}
            title="Regenerate translations with AI"
            className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 text-xs font-medium text-ink hover:bg-surface-soft disabled:opacity-40 transition-colors"
          >
            <Sparkles className={`h-3 w-3 text-amber-500 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Regenerate</span>
          </button>
        </div>
      </div>

      {/* Ambiguous Confirmation Banner */}
      {needsConfirmation && (
        <div className="flex flex-wrap items-center gap-2 rounded bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Language ambiguous. Please confirm original language:</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => confirmSourceLanguage('en')}
              className="rounded bg-amber-600/20 px-2 py-0.5 font-bold hover:bg-amber-600/30"
            >
              English
            </button>
            <button
              type="button"
              onClick={() => confirmSourceLanguage('km')}
              className="rounded bg-amber-600/20 px-2 py-0.5 font-bold hover:bg-amber-600/30"
            >
              Khmer
            </button>
            <button
              type="button"
              onClick={() => confirmSourceLanguage('zh')}
              className="rounded bg-amber-600/20 px-2 py-0.5 font-bold hover:bg-amber-600/30"
            >
              Chinese
            </button>
          </div>
        </div>
      )}

      {/* Error & Retry Banner */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Translation failed: {error}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => triggerDraft(false)}
              className="font-bold underline hover:no-underline"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={saveOriginalOnly}
              className="font-bold underline hover:no-underline text-ink-soft"
            >
              Save original only
            </button>
          </div>
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-ink-soft italic">
          <RefreshCw className="h-3 w-3 animate-spin text-accent" />
          <span>Translating other languages...</span>
        </div>
      )}

      {/* Three Language Inputs */}
      <div className={`grid grid-cols-1 gap-2.5 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {(['en', 'km', 'zh'] as Locale[]).map((loc) => {
          const isSource = loc === effectiveSourceLocale;
          const accessibleName = `${LOCALE_LABELS[loc]} ${fieldName}`;
          const cell = cells[loc];

          return (
            <div key={loc} className="flex flex-col space-y-1">
              <div className="flex items-center justify-between text-[11px] text-ink-soft">
                <span className="font-semibold">{LOCALE_LABELS[loc]}</span>
                <span className="text-[10px]">
                  {isSource ? (
                    <span className="font-bold text-accent bg-accent/10 px-1.5 py-0.2 rounded">Original</span>
                  ) : cell.text ? (
                    cell.reviewed ? (
                      <span className="text-emerald-600 dark:text-emerald-400">Reviewed ✓</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">AI Draft</span>
                    )
                  ) : null}
                </span>
              </div>

              {fieldType === 'textarea' ? (
                <textarea
                  rows={2}
                  aria-label={accessibleName}
                  placeholder={loc === 'en' && placeholder ? placeholder : `Enter in ${LOCALE_LABELS[loc]}...`}
                  value={cell.text}
                  onChange={(e) => handleCellChange(loc, e.target.value)}
                  onBlur={isSource ? handleBlur : undefined}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  className={`w-full rounded border bg-surface p-2 text-sm font-medium text-ink outline-none transition-colors ${
                    isSource
                      ? 'border-accent/60 focus:border-accent'
                      : 'border-border focus:border-ink-soft'
                  }`}
                />
              ) : (
                <input
                  type="text"
                  aria-label={accessibleName}
                  placeholder={loc === 'en' && placeholder ? placeholder : `Enter in ${LOCALE_LABELS[loc]}...`}
                  value={cell.text}
                  onChange={(e) => handleCellChange(loc, e.target.value)}
                  onBlur={isSource ? handleBlur : undefined}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  className={`h-9 w-full rounded border bg-surface px-2.5 text-sm font-medium text-ink outline-none transition-colors ${
                    isSource
                      ? 'border-accent/60 focus:border-accent'
                      : 'border-border focus:border-ink-soft'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
