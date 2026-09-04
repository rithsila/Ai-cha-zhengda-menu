import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db';
import { seedCategoriesIfEmpty } from '../src/seed';

describe('Category Database Model', () => {
  beforeEach(async () => {
    await prisma.category.deleteMany();
  });

  it('creates and reads a category with brand and sortOrder', async () => {
    const created = await prisma.category.create({
      data: {
        brand: 'ai-cha',
        name: 'Milk Tea',
        sortOrder: 1,
      },
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Milk Tea');
    expect(created.brand).toBe('ai-cha');
    expect(created.sortOrder).toBe(1);
  });

  it('enforces unique brand and name combination', async () => {
    await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 0 },
    });

    await expect(
      prisma.category.create({
        data: { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 1 },
      })
    ).rejects.toThrow();
  });

  it('seeds standard categories when Category table is empty', async () => {
    await seedCategoriesIfEmpty(prisma);
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(categories.length).toBe(8);

    const aiCha = categories.filter((c) => c.brand === 'ai-cha');
    expect(aiCha.map((c) => c.name)).toEqual(['Cones', 'Milk Tea', 'Frappe', 'Fruit Tea', 'Ice Cream']);

    const zhengda = categories.filter((c) => c.brand === 'zhengda');
    expect(zhengda.map((c) => c.name)).toEqual(['Signature', 'Combos', 'Rice Bowls']);
  });
});

