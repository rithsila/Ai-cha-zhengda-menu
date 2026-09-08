import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import { runBackfill, DictionaryResources } from '../src/translations/backfill.js';
import { saveLocalizedEdits } from '../src/translations/repository.js';

describe('Translation Legacy Backfill (Task 3)', () => {
  const testDict: DictionaryResources = {
    en: {
      translation: {
        'Brown Sugar Boba Milk': 'Brown Sugar Boba Milk',
        'Pearl Milk Tea': 'Pearl Milk Tea',
        'Milk Tea': 'Milk Tea',
        'Boba': 'Boba',
      },
    },
    km: {
      translation: {
        'Brown Sugar Boba Milk': 'ទឹកដោះគោគុជស្ករត្នោត',
        'Pearl Milk Tea': 'តែទឹកដោះគោគុជ',
        'Milk Tea': 'តែទឹកដោះគោ',
        'Boba': 'គុជ',
      },
    },
    zh: {
      translation: {
        'Brown Sugar Boba Milk': '黑糖波霸奶茶',
        'Pearl Milk Tea': '珍珠奶茶',
        'Milk Tea': '奶茶',
        'Boba': '波霸',
      },
    },
  };

  beforeEach(async () => {
    await prisma.localizedTextValue.deleteMany();
    await prisma.localizedText.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
  });

  it('performs dry-run without writing to database', async () => {
    const item = await prisma.menuItem.create({
      data: {
        id: 'item-dry-1',
        name: 'Brown Sugar Boba Milk',
        category: 'Milk Tea',
        basePrice: 3.5,
      },
    });

    const stats = await runBackfill({
      apply: false,
      dictionary: testDict,
    });

    expect(stats.newRecords).toBe(1);
    const inDb = await prisma.localizedText.findMany();
    expect(inDb).toHaveLength(0);
  });

  it('imports dictionary translations with legacy origin on apply', async () => {
    const item = await prisma.menuItem.create({
      data: {
        id: 'item-apply-1',
        name: 'Brown Sugar Boba Milk',
        category: 'Milk Tea',
        basePrice: 3.5,
      },
    });

    const stats = await runBackfill({
      apply: true,
      dictionary: testDict,
    });

    expect(stats.newRecords).toBe(1);
    const inDb = await prisma.localizedText.findUnique({
      where: {
        ownerType_ownerKey_field: {
          ownerType: 'item',
          ownerKey: item.id,
          field: 'name',
        },
      },
      include: { values: true },
    });

    expect(inDb).toBeDefined();
    expect(inDb?.sourceLocale).toBe('en');
    expect(inDb?.sourceText).toBe('Brown Sugar Boba Milk');
    expect(inDb?.values).toHaveLength(3);

    const kmCell = inDb?.values.find((v) => v.locale === 'km');
    expect(kmCell?.text).toBe('ទឹកដោះគោគុជស្ករត្នោត');
    expect(kmCell?.origin).toBe('legacy');
    expect(kmCell?.reviewed).toBe(false);
  });

  it('is idempotent: rerunning importer produces zero new records', async () => {
    await prisma.menuItem.create({
      data: {
        id: 'item-idemp-1',
        name: 'Pearl Milk Tea',
        category: 'Milk Tea',
        basePrice: 3.0,
      },
    });

    const firstRun = await runBackfill({
      apply: true,
      dictionary: testDict,
    });
    expect(firstRun.newRecords).toBe(1);

    const secondRun = await runBackfill({
      apply: true,
      dictionary: testDict,
    });
    expect(secondRun.newRecords).toBe(0);
    expect(secondRun.skippedRecords).toBe(1);
  });

  it('keeps separate identities for two items with identical wording', async () => {
    const item1 = await prisma.menuItem.create({
      data: { id: 'item-dup-1', name: 'Pearl Milk Tea', category: 'Milk Tea', basePrice: 3.0 },
    });
    const item2 = await prisma.menuItem.create({
      data: { id: 'item-dup-2', name: 'Pearl Milk Tea', category: 'Milk Tea', basePrice: 3.5 },
    });

    const stats = await runBackfill({
      apply: true,
      dictionary: testDict,
    });
    expect(stats.newRecords).toBe(2);

    const loc1 = await prisma.localizedText.findUnique({
      where: {
        ownerType_ownerKey_field: { ownerType: 'item', ownerKey: item1.id, field: 'name' },
      },
    });
    const loc2 = await prisma.localizedText.findUnique({
      where: {
        ownerType_ownerKey_field: { ownerType: 'item', ownerKey: item2.id, field: 'name' },
      },
    });

    expect(loc1).toBeDefined();
    expect(loc2).toBeDefined();
    expect(loc1?.id).not.toBe(loc2?.id);
  });

  it('preserves existing manual owner corrections and never overwrites them', async () => {
    const item = await prisma.menuItem.create({
      data: { id: 'item-manual-survive', name: 'Brown Sugar Boba Milk', category: 'Milk Tea', basePrice: 3.5 },
    });

    // Owner made a custom manual correction before backfill
    await saveLocalizedEdits([
      {
        ownerType: 'item',
        ownerKey: item.id,
        field: 'name',
        sourceLocale: 'en',
        cells: [
          { locale: 'en', text: 'Brown Sugar Boba Milk' },
          { locale: 'km', text: 'ទឹកដោះគោគុជពិសេសរបស់ខ្ញុំ', reviewed: true },
        ],
      },
    ]);

    // Now run backfill
    const stats = await runBackfill({
      apply: true,
      dictionary: testDict,
    });

    expect(stats.skippedRecords).toBe(1);
    expect(stats.newRecords).toBe(0);

    const textRow = await prisma.localizedText.findUnique({
      where: {
        ownerType_ownerKey_field: { ownerType: 'item', ownerKey: item.id, field: 'name' },
      },
      include: { values: true },
    });

    const kmCell = textRow?.values.find((v) => v.locale === 'km');
    expect(kmCell?.text).toBe('ទឹកដោះគោគុជពិសេសរបស់ខ្ញុំ');
  });

  it('preserves unrecognized text as unclassified source without calling AI', async () => {
    const item = await prisma.menuItem.create({
      data: { id: 'item-unknown-dish', name: 'Brand New Experimental Drink', category: 'Milk Tea', basePrice: 4.0 },
    });

    const stats = await runBackfill({
      apply: true,
      dictionary: testDict,
    });

    expect(stats.newRecords).toBe(1);
    expect(stats.unmatchedText).toBe(1);

    const textRow = await prisma.localizedText.findUnique({
      where: {
        ownerType_ownerKey_field: { ownerType: 'item', ownerKey: item.id, field: 'name' },
      },
      include: { values: true },
    });

    expect(textRow?.sourceLocale).toBeNull();
    expect(textRow?.sourceText).toBe('Brand New Experimental Drink');
    expect(textRow?.values).toHaveLength(0); // No synthetic translations created
  });
});
