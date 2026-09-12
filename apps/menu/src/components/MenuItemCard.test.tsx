import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MenuItemCard } from './MenuItemCard';
import type { MenuItem } from '../types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback: string) => fallback || k,
    i18n: { language: 'en' },
  }),
}));

const mockItem: MenuItem = {
  id: 'test-cone',
  brand: 'ai-cha',
  category: 'Ice Cream',
  name: 'Ai-Scream Cone Matcha',
  description: 'Crispy cone with matcha soft serve',
  basePrice: 0.5,
  imageFallback: '/images/ai-scream-cone-matcha.webp',
};

describe('MenuItemCard imageFit styles', () => {
  it('renders contain style (Option A) with clean card background and contain padding', () => {
    render(
      <MenuItemCard
        item={mockItem}
        onAdd={vi.fn()}
        imageFit="contain"
      />
    );

    const img = screen.getByAltText('Ai-Scream Cone Matcha');
    expect(img.className).toContain('object-contain');
    expect(img.className).toContain('p-2');

    const container = img.parentElement;
    expect(container?.className).not.toContain('bg-tg-hint/10');
  });

  it('renders cover style (Option B) edge-to-edge without padding', () => {
    render(
      <MenuItemCard
        item={mockItem}
        onAdd={vi.fn()}
        imageFit="cover"
      />
    );

    const img = screen.getByAltText('Ai-Scream Cone Matcha');
    expect(img.className).toContain('object-cover');
    expect(img.className).not.toContain('p-2');

    const container = img.parentElement;
    expect(container?.className).toContain('overflow-hidden');
  });

  it('uses item.imageFit when defined on the item', () => {
    const itemWithCover: MenuItem = {
      ...mockItem,
      imageFit: 'cover',
    };

    render(
      <MenuItemCard
        item={itemWithCover}
        onAdd={vi.fn()}
        imageFit="contain" // Prop is contain, but item says cover
      />
    );

    const img = screen.getByAltText('Ai-Scream Cone Matcha');
    expect(img.className).toContain('object-cover');
    expect(img.className).not.toContain('p-2');
  });
});
