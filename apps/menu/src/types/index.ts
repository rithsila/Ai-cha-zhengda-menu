export type Brand = 'ai-cha' | 'zhengda' | string;

export interface MenuTabConfig {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
}

export type Locale = 'en' | 'km' | 'zh';
export type TextOwner = 'item' | 'category' | 'modifierGroup' | 'modifierOption';
export type TextField = 'name' | 'description';
export type TranslationOrigin = 'original' | 'ai' | 'manual' | 'legacy';

export interface LocalizedCell {
  locale: Locale | string;
  text: string;
  origin?: TranslationOrigin;
  reviewed?: boolean;
  basedOnSourceRevision?: number;
}

export interface LocalizedText {
  id?: string;
  ownerType?: TextOwner;
  ownerKey?: string;
  field?: TextField;
  sourceLocale?: Locale | string | null;
  sourceText?: string;
  sourceRevision?: number;
  revision?: number;
  cells?: LocalizedCell[];
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  localized?: {
    name?: LocalizedText;
  };
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  options: ModifierOption[];
  required?: boolean;
  freeCount?: number;
  localized?: {
    name?: LocalizedText;
  };
}

export interface MenuItem {
  id: string;
  brand: Brand;
  category: string;
  name: string;
  description?: string;
  basePrice: number;
  imageFallback?: string;
  isSoldOut?: boolean;
  earnsStamp?: boolean;
  canClaim?: boolean;
  modifiers?: ModifierGroup[];
  localized?: {
    name?: LocalizedText;
    description?: LocalizedText;
  };
}

export interface CartItem {
  id: string; // Unique instance ID for the cart
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  selectedModifiers: Record<string, ModifierOption[]>; // groupId -> selected options
  unitPrice: number;
  totalPrice: number;
  localized?: {
    name?: LocalizedText;
  };
}
