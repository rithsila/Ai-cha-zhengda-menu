export type Brand = 'ai-cha' | 'zhengda';

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  options: ModifierOption[];
  required?: boolean;
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
}
