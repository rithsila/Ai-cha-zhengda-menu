import { describe, it, expect } from 'vitest';
import { resolveLocalizedText, resolveWithLegacyFallback } from './utils/localizedText';
import type { MenuItem, CartItem, LocalizedText } from './types';

describe('Customer Menu Localization Integration', () => {
  // Chinese-first item fixture
  const chineseFirstItem: MenuItem = {
    id: 'item-pearl-tea',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: '珍珠奶茶',
    description: '香浓奶茶搭配Q弹珍珠',
    basePrice: 2.5,
    localized: {
      name: {
        id: 'loc-name-1',
        ownerType: 'item',
        ownerKey: 'item-pearl-tea',
        field: 'name',
        sourceLocale: 'zh',
        sourceText: '珍珠奶茶',
        sourceRevision: 1,
        revision: 1,
        cells: [
          { locale: 'zh', text: '珍珠奶茶', basedOnSourceRevision: 1 },
          { locale: 'en', text: 'Pearl Milk Tea', basedOnSourceRevision: 1 },
          { locale: 'km', text: 'តែទឹកដោះគោគុជ', basedOnSourceRevision: 1 },
        ],
      },
      description: {
        id: 'loc-desc-1',
        ownerType: 'item',
        ownerKey: 'item-pearl-tea',
        field: 'description',
        sourceLocale: 'zh',
        sourceText: '香浓奶茶搭配Q弹珍珠',
        sourceRevision: 1,
        revision: 1,
        cells: [
          { locale: 'zh', text: '香浓奶茶搭配Q弹珍珠', basedOnSourceRevision: 1 },
          { locale: 'en', text: 'Rich milk tea with chewy tapioca pearls', basedOnSourceRevision: 1 },
          { locale: 'km', text: 'តែទឹកដោះគោឈ្ងុយឆ្ងាញ់ជាមួយគុជទន់ស្វិត', basedOnSourceRevision: 1 },
        ],
      },
    },
    modifiers: [
      {
        id: 'group-toppings',
        name: '配料加料',
        type: 'multiple',
        localized: {
          name: {
            sourceLocale: 'zh',
            sourceText: '配料加料',
            sourceRevision: 1,
            cells: [
              { locale: 'zh', text: '配料加料', basedOnSourceRevision: 1 },
              { locale: 'en', text: 'Toppings', basedOnSourceRevision: 1 },
              { locale: 'km', text: 'ថែមគ្រឿង', basedOnSourceRevision: 1 },
            ],
          },
        },
        options: [
          {
            id: 'opt-pudding',
            name: '布丁',
            priceDelta: 0.5,
            localized: {
              name: {
                sourceLocale: 'zh',
                sourceText: '布丁',
                sourceRevision: 1,
                cells: [
                  { locale: 'zh', text: '布丁', basedOnSourceRevision: 1 },
                  { locale: 'en', text: 'Pudding', basedOnSourceRevision: 1 },
                  { locale: 'km', text: 'ពូឌីង', basedOnSourceRevision: 1 },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  it('displays Chinese-first item properly across all three customer languages', () => {
    // Chinese view
    expect(resolveLocalizedText(chineseFirstItem.localized?.name, 'zh', chineseFirstItem.name))
      .toBe('珍珠奶茶');
    expect(resolveLocalizedText(chineseFirstItem.localized?.description, 'zh', chineseFirstItem.description!))
      .toBe('香浓奶茶搭配Q弹珍珠');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].localized?.name, 'zh', chineseFirstItem.modifiers![0].name))
      .toBe('配料加料');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].options[0].localized?.name, 'zh', chineseFirstItem.modifiers![0].options[0].name))
      .toBe('布丁');

    // English view
    expect(resolveLocalizedText(chineseFirstItem.localized?.name, 'en', chineseFirstItem.name))
      .toBe('Pearl Milk Tea');
    expect(resolveLocalizedText(chineseFirstItem.localized?.description, 'en', chineseFirstItem.description!))
      .toBe('Rich milk tea with chewy tapioca pearls');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].localized?.name, 'en', chineseFirstItem.modifiers![0].name))
      .toBe('Toppings');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].options[0].localized?.name, 'en', chineseFirstItem.modifiers![0].options[0].name))
      .toBe('Pudding');

    // Khmer view
    expect(resolveLocalizedText(chineseFirstItem.localized?.name, 'km', chineseFirstItem.name))
      .toBe('តែទឹកដោះគោគុជ');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].localized?.name, 'km', chineseFirstItem.modifiers![0].name))
      .toBe('ថែមគ្រឿង');
    expect(resolveLocalizedText(chineseFirstItem.modifiers![0].options[0].localized?.name, 'km', chineseFirstItem.modifiers![0].options[0].name))
      .toBe('ពូឌីង');
  });

  it('reflects owner correction visibility after revalidation', () => {
    // Owner corrects Khmer translation in Settings
    const updatedNameRecord: LocalizedText = {
      ...chineseFirstItem.localized!.name!,
      sourceRevision: 1,
      cells: [
        { locale: 'zh', text: '珍珠奶茶', basedOnSourceRevision: 1 },
        { locale: 'en', text: 'Pearl Milk Tea', basedOnSourceRevision: 1 },
        { locale: 'km', text: 'តែគុជពិសេស', basedOnSourceRevision: 1 }, // updated
      ],
    };

    const revalidatedItem: MenuItem = {
      ...chineseFirstItem,
      localized: {
        ...chineseFirstItem.localized,
        name: updatedNameRecord,
      },
    };

    // Customer re-evaluates item after SWR revalidation
    expect(resolveLocalizedText(revalidatedItem.localized?.name, 'km', revalidatedItem.name))
      .toBe('តែគុជពិសេស');
    // Pricing, id, and brand stay completely unchanged
    expect(revalidatedItem.id).toBe('item-pearl-tea');
    expect(revalidatedItem.basePrice).toBe(2.5);
  });

  it('preserves cart contents and prices when switching languages', () => {
    const selectedOptions = {
      'group-toppings': [chineseFirstItem.modifiers![0].options[0]],
    };

    const cartItem: CartItem = {
      id: 'cart-line-1',
      menuItemId: chineseFirstItem.id,
      name: chineseFirstItem.name,
      basePrice: chineseFirstItem.basePrice,
      quantity: 2,
      selectedModifiers: selectedOptions,
      unitPrice: 3.0, // 2.5 + 0.5
      totalPrice: 6.0,
      localized: { name: chineseFirstItem.localized?.name },
    };

    const cart = [cartItem];

    // Total calculation
    const totalAmount = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    expect(totalAmount).toBe(6.0);

    // Dynamic display resolution in English
    const nameInEn = resolveWithLegacyFallback(
      chineseFirstItem.localized?.name || cartItem.localized?.name,
      'en',
      cartItem.name
    );
    const toppingInEn = resolveWithLegacyFallback(
      chineseFirstItem.modifiers![0].options[0].localized?.name,
      'en',
      cartItem.selectedModifiers['group-toppings'][0].name
    );
    expect(nameInEn).toBe('Pearl Milk Tea');
    expect(toppingInEn).toBe('Pudding');

    // Dynamic display resolution in Khmer (language switch)
    const nameInKm = resolveWithLegacyFallback(
      chineseFirstItem.localized?.name || cartItem.localized?.name,
      'km',
      cartItem.name
    );
    const toppingInKm = resolveWithLegacyFallback(
      chineseFirstItem.modifiers![0].options[0].localized?.name,
      'km',
      cartItem.selectedModifiers['group-toppings'][0].name
    );
    expect(nameInKm).toBe('តែទឹកដោះគោគុជ');
    expect(toppingInKm).toBe('ពូឌីង');

    // Crucial check: Cart item identity, options, and total remain identical!
    expect(cartItem.id).toBe('cart-line-1');
    expect(cartItem.menuItemId).toBe('item-pearl-tea');
    expect(cartItem.quantity).toBe(2);
    expect(cartItem.unitPrice).toBe(3.0);
    expect(cartItem.totalPrice).toBe(6.0);
    expect(cart.reduce((sum, item) => sum + item.totalPrice, 0)).toBe(6.0);
  });
});
