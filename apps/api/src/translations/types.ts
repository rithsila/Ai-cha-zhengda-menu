export type Locale = 'en' | 'km' | 'zh';
export type TextOwner = 'item' | 'category' | 'modifierGroup' | 'modifierOption';
export type TextField = 'name' | 'description';
export type TranslationOrigin = 'original' | 'ai' | 'manual' | 'legacy';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'km', 'zh'];
export const SUPPORTED_OWNERS: TextOwner[] = ['item', 'category', 'modifierGroup', 'modifierOption'];
export const SUPPORTED_FIELDS: TextField[] = ['name', 'description'];

export type LocalizedCell = {
  locale: Locale;
  text: string;
  origin: TranslationOrigin;
  reviewed: boolean;
  basedOnSourceRevision: number;
};

export type LocalizedText = {
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

export type TranslationDraftEntryRequest = {
  clientKey: string;
  text: string;
  sourceLocale: Locale | 'auto';
  targetLocales: Locale[];
  context: { field: TextField; category?: string; itemName?: string };
};

export type TranslationDraftRequest = {
  requestId: string;
  entries: TranslationDraftEntryRequest[];
};

export type TranslationDraftEntryResult = {
  clientKey: string;
  sourceLocale: Locale | null;
  needsLanguageConfirmation: boolean;
  translations: Partial<Record<Locale, string>>;
};

export type TranslationDraftResult = {
  requestId: string;
  entries: TranslationDraftEntryResult[];
};

export interface TranslationProvider {
  translate(input: TranslationDraftRequest): Promise<TranslationDraftResult>;
}

export type LocalizedCellEdit = {
  locale: Locale;
  text: string;
  reviewed?: boolean;
};

export type LocalizedTextEdit = {
  id?: string;
  ownerType?: TextOwner;
  ownerKey?: string;
  field?: TextField;
  expectedRevision?: number;
  sourceLocale?: Locale | null;
  cells: LocalizedCellEdit[];
};

export type PatchTranslationsBody = {
  edits: Array<{
    id: string;
    expectedRevision: number;
    sourceLocale?: Locale | null;
    cells: Array<{
      locale: Locale;
      text: string;
      reviewed?: boolean;
    }>;
  }>;
};

// Additive payload in catalog create/update
export type CatalogLocalizationPayload = {
  name?: {
    sourceLocale?: Locale | null;
    cells?: LocalizedCellEdit[];
  };
  description?: {
    sourceLocale?: Locale | null;
    cells?: LocalizedCellEdit[];
  };
  modifiers?: Array<{
    clientKey: string; // matches ModifierGroup client key
    name?: {
      sourceLocale?: Locale | null;
      cells?: LocalizedCellEdit[];
    };
    options?: Array<{
      clientKey: string; // matches ModifierOption client key
      name?: {
        sourceLocale?: Locale | null;
        cells?: LocalizedCellEdit[];
      };
    }>;
  }>;
};
