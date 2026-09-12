import type { MenuItem, ModifierOption } from '../types';

export function calculateItemUnitPrice(
  item: MenuItem,
  selectedOptions: Record<string, ModifierOption[]>
): number {
  let unitPrice = item.basePrice;

  if (item.modifiers && item.modifiers.length > 0) {
    for (const group of item.modifiers) {
      const groupSelections = selectedOptions[group.id] || [];
      if (group.type === 'multiple' && (group.freeCount ?? 0) > 0) {
        let freeRemaining = group.freeCount ?? 0;
        // Sort ascending by priceDelta so free count covers options fairly
        const sorted = [...groupSelections].sort((a, b) => a.priceDelta - b.priceDelta);
        for (const opt of sorted) {
          if (freeRemaining > 0) {
            freeRemaining--;
          } else {
            unitPrice += opt.priceDelta;
          }
        }
      } else {
        for (const opt of groupSelections) {
          unitPrice += opt.priceDelta;
        }
      }
    }
  } else {
    for (const opts of Object.values(selectedOptions)) {
      for (const opt of opts) {
        unitPrice += opt.priceDelta;
      }
    }
  }

  return Math.round(unitPrice * 100) / 100;
}
