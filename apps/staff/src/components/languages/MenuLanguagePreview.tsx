import React, { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { Badge } from '../ui';

export type PreviewLocale = 'en' | 'km' | 'zh';

export interface PreviewItemData {
  id?: string;
  name: string;
  description?: string | null;
  basePrice: number;
  image?: string | null;
  category?: string;
  modifiers?: Array<{
    name: string;
    options: Array<{ name: string; priceDelta: number }>;
  }>;
  localized?: {
    name?: {
      sourceLocale: string;
      cells: Array<{ locale: string; text: string; status?: string }>;
    };
    description?: {
      sourceLocale: string;
      cells: Array<{ locale: string; text: string; status?: string }>;
    };
  };
}

export interface MenuLanguagePreviewProps {
  item: PreviewItemData;
  drafts?: {
    name?: Partial<Record<PreviewLocale, string>>;
    description?: Partial<Record<PreviewLocale, string>>;
  };
  onClose?: () => void;
}

const LOCALES: Array<{ id: PreviewLocale; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'km', label: 'ខ្មែរ (Khmer)' },
  { id: 'zh', label: '中文 (Chinese)' },
];

export const MenuLanguagePreview: React.FC<MenuLanguagePreviewProps> = ({
  item,
  drafts,
  onClose,
}) => {
  const [activeLocale, setActiveLocale] = useState<PreviewLocale>('en');

  // Fallback resolution matching customer menu rules
  const resolveField = (
    field: 'name' | 'description'
  ): { text: string; isDraft: boolean; isFallback: boolean } => {
    // 1. Check draft
    const draftText = drafts?.[field]?.[activeLocale]?.trim();
    if (draftText) {
      return { text: draftText, isDraft: true, isFallback: false };
    }

    // 2. Check saved localized cell
    const locRecord = item.localized?.[field];
    const cellText = locRecord?.cells.find((c) => c.locale === activeLocale)?.text?.trim();
    if (cellText) {
      return { text: cellText, isDraft: false, isFallback: false };
    }

    // 3. Fallback to source locale cell
    const sourceLocale = locRecord?.sourceLocale;
    if (sourceLocale && sourceLocale !== activeLocale) {
      const sourceCell = locRecord.cells.find((c) => c.locale === sourceLocale)?.text?.trim();
      if (sourceCell) {
        return { text: sourceCell, isDraft: false, isFallback: true };
      }
    }

    // 4. Fallback to raw property
    const raw = field === 'name' ? item.name : item.description || '';
    return { text: raw, isDraft: false, isFallback: Boolean(raw) };
  };

  const nameResolved = resolveField('name');
  const descResolved = resolveField('description');

  return (
    <div
      className="rounded-none border border-border bg-surface p-4 shadow-xl space-y-4 max-w-sm w-full mx-auto"
      role="region"
      aria-label="Menu customer language preview"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2 text-xs font-bold text-ink">
          <Eye className="size-4 text-accent" />
          <span>Customer Menu Preview</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1 text-ink-soft hover:text-ink cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Language Switcher Bar */}
      <div className="flex rounded border border-border p-0.5 bg-surface-sunken">
        {LOCALES.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => setActiveLocale(loc.id)}
            className={`flex-1 py-1 px-2 text-xs font-bold rounded transition-colors ${
              activeLocale === loc.id
                ? 'bg-accent text-on-accent shadow-xs'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {loc.label}
          </button>
        ))}
      </div>

      {/* Customer Card Mockup */}
      <div className="overflow-hidden rounded border border-border bg-surface shadow-xs">
        {item.image ? (
          <div className="relative h-44 w-full bg-surface-sunken overflow-hidden">
            <img
              src={item.image}
              alt={nameResolved.text}
              className="h-full w-full object-cover"
            />
            {item.category && (
              <span className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-xs">
                {item.category}
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-36 w-full items-center justify-center bg-surface-sunken/60 text-ink-faint text-xs">
            <span>No Image</span>
          </div>
        )}

        <div className="p-3.5 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="font-bold text-base text-ink leading-tight">
                {nameResolved.text || 'Untitled Item'}
              </h4>
              <div className="flex items-center gap-1.5 pt-0.5">
                {nameResolved.isDraft && (
                  <Badge variant="pending" className="text-[10px] px-1 py-0 font-bold">
                    Draft
                  </Badge>
                )}
                {nameResolved.isFallback && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium italic">
                    (Fallback original)
                  </span>
                )}
              </div>
            </div>
            <span className="font-black text-sm text-ink shrink-0 tabular-nums">
              ${Number(item.basePrice || 0).toFixed(2)}
            </span>
          </div>

          {descResolved.text && (
            <div>
              <p className="text-xs text-ink-soft line-clamp-2">
                {descResolved.text}
              </p>
              {descResolved.isDraft && (
                <span className="text-[9px] text-amber-600 font-semibold">
                  (Draft description)
                </span>
              )}
            </div>
          )}

          {/* Modifier Options Preview */}
          {item.modifiers && item.modifiers.length > 0 && (
            <div className="pt-2 border-t border-border/50 space-y-1.5 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                Options
              </span>
              <div className="flex flex-wrap gap-1">
                {item.modifiers.slice(0, 3).map((mod, idx) => (
                  <span
                    key={idx}
                    className="rounded bg-surface-sunken px-2 py-0.5 text-[11px] text-ink-soft font-medium"
                  >
                    {mod.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Mock Add to Cart Button */}
          <div className="pt-2">
            <div className="w-full py-1.5 rounded bg-accent text-on-accent text-center text-xs font-bold shadow-xs">
              Add to Order
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
