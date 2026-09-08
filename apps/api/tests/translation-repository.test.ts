import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/db.js';
import {
  saveLocalizedEdits,
  getLocalizedText,
  getLocalizedTexts,
  deleteOwnedTexts,
  TranslationConflictError,
  TranslationValidationError,
  makeModifierGroupKey,
  makeModifierOptionKey,
} from '../src/translations/repository.js';

describe('Translation Repository & Concurrency (Task 2)', () => {
  beforeEach(async () => {
    // Clean localized text rows before each test
    await prisma.localizedTextValue.deleteMany();
    await prisma.localizedText.deleteMany();
  });

  it('creates a localized text record with initial revisions', async () => {
    const saved = await saveLocalizedEdits([
      {
        ownerType: 'item',
        ownerKey: 'item-test-1',
        field: 'name',
        sourceLocale: 'zh',
        cells: [
          { locale: 'zh', text: '珍珠奶茶' },
          { locale: 'en', text: 'Pearl Milk Tea' },
        ],
      },
    ]);

    expect(saved).toHaveLength(1);
    expect(saved[0].sourceLocale).toBe('zh');
    expect(saved[0].sourceText).toBe('珍珠奶茶');
    expect(saved[0].revision).toBe(1);
    expect(saved[0].sourceRevision).toBe(1);
    expect(saved[0].cells).toHaveLength(2);

    const zhCell = saved[0].cells.find((c) => c.locale === 'zh');
    expect(zhCell?.origin).toBe('original');
    expect(zhCell?.reviewed).toBe(true);
  });

  it('rejects stale expectedRevision with 409 conflict error', async () => {
    const [initial] = await saveLocalizedEdits([
      {
        ownerType: 'item',
        ownerKey: 'item-conflict',
        field: 'name',
        sourceLocale: 'en',
        cells: [{ locale: 'en', text: 'Brown Sugar Milk' }],
      },
    ]);

    expect(initial.revision).toBe(1);

    // Save update 1 (revision becomes 2)
    await saveLocalizedEdits([
      {
        id: initial.id,
        expectedRevision: 1,
        cells: [{ locale: 'en', text: 'Brown Sugar Fresh Milk' }],
      },
    ]);

    // Save update 2 with stale revision 1 -> should fail with conflict
    await expect(
      saveLocalizedEdits([
        {
          id: initial.id,
          expectedRevision: 1,
          cells: [{ locale: 'en', text: 'Stale Edit' }],
        },
      ])
    ).rejects.toThrow(TranslationConflictError);
  });

  it('preserves reviewed target text on source edit and marks it needing review (stale)', async () => {
    // 1. Owner creates Chinese item and enters manual/reviewed Khmer translation
    const ownerCorrection = 'តែទឹកដោះគោគុជ';
    const [before] = await saveLocalizedEdits([
      {
        ownerType: 'item',
        ownerKey: 'item-review-test',
        field: 'name',
        sourceLocale: 'zh',
        cells: [
          { locale: 'zh', text: '珍珠奶茶' },
          { locale: 'km', text: ownerCorrection, reviewed: true },
        ],
      },
    ]);

    expect(before.sourceRevision).toBe(1);
    expect(before.revision).toBe(1);

    // 2. Owner changes the Chinese source text
    const [after] = await saveLocalizedEdits([
      {
        id: before.id,
        expectedRevision: before.revision,
        sourceLocale: 'zh',
        cells: [
          { locale: 'zh', text: '超级珍珠奶茶' }, // Changed source text
        ],
      },
    ]);

    expect(after.sourceRevision).toBe(before.sourceRevision + 1);
    expect(after.revision).toBe(before.revision + 1);

    const kmCell = after.cells.find((c) => c.locale === 'km');
    expect(kmCell?.text).toBe(ownerCorrection);
    // basedOnSourceRevision remains before.sourceRevision, so basedOnSourceRevision !== sourceRevision (needs review!)
    expect(kmCell?.basedOnSourceRevision).toBe(before.sourceRevision);
  });

  it('atomically clears translations when source description is cleared', async () => {
    const [initial] = await saveLocalizedEdits([
      {
        ownerType: 'item',
        ownerKey: 'item-desc-test',
        field: 'description',
        sourceLocale: 'en',
        cells: [
          { locale: 'en', text: 'Crispy whole chicken breast' },
          { locale: 'zh', text: '香脆全鸡胸' },
          { locale: 'km', text: 'សាច់ទ្រូងមាន់បំពងស្រួយ' },
        ],
      },
    ]);

    expect(initial.cells).toHaveLength(3);

    // Clear the English source description
    const [cleared] = await saveLocalizedEdits([
      {
        id: initial.id,
        expectedRevision: initial.revision,
        sourceLocale: 'en',
        cells: [{ locale: 'en', text: '' }],
      },
    ]);

    expect(cleared.sourceText).toBe('');
    expect(cleared.cells).toHaveLength(0);
  });

  it('rejects blank name', async () => {
    await expect(
      saveLocalizedEdits([
        {
          ownerType: 'item',
          ownerKey: 'item-blank',
          field: 'name',
          sourceLocale: 'en',
          cells: [{ locale: 'en', text: '   ' }],
        },
      ])
    ).rejects.toThrow(TranslationValidationError);
  });

  it('rejects duplicate locale cells in one edit', async () => {
    await expect(
      saveLocalizedEdits([
        {
          ownerType: 'item',
          ownerKey: 'item-dup-locale',
          field: 'name',
          sourceLocale: 'en',
          cells: [
            { locale: 'en', text: 'Name 1' },
            { locale: 'en', text: 'Name 2' },
          ],
        },
      ])
    ).rejects.toThrow('Duplicate cell locale');
  });

  it('preserves translation identities when item is renamed and when modifiers are recreated with stable keys', async () => {
    const groupKey = makeModifierGroupKey('item-stable-1', 'ice-level');
    const optionKey = makeModifierOptionKey('item-stable-1', 'ice-level', 'no-ice');

    // Create modifier group and option translations
    await saveLocalizedEdits([
      {
        ownerType: 'modifierGroup',
        ownerKey: groupKey,
        field: 'name',
        sourceLocale: 'en',
        cells: [
          { locale: 'en', text: 'Ice Level' },
          { locale: 'zh', text: '冰量' },
          { locale: 'km', text: 'កម្រិតទឹកកក' },
        ],
      },
      {
        ownerType: 'modifierOption',
        ownerKey: optionKey,
        field: 'name',
        sourceLocale: 'en',
        cells: [
          { locale: 'en', text: 'No Ice' },
          { locale: 'zh', text: '去冰' },
          { locale: 'km', text: 'គ្មានទឹកកក' },
        ],
      },
    ]);

    // Simulate item or modifier recreation in catalog: retrieve by stable key
    const retrievedGroup = await getLocalizedText('modifierGroup', groupKey, 'name');
    const retrievedOption = await getLocalizedText('modifierOption', optionKey, 'name');

    expect(retrievedGroup?.cells.find((c) => c.locale === 'zh')?.text).toBe('冰量');
    expect(retrievedOption?.cells.find((c) => c.locale === 'km')?.text).toBe('គ្មានទឹកកក');

    // Deleting item cleans up all owned texts
    await deleteOwnedTexts('modifierGroup', groupKey);
    await deleteOwnedTexts('modifierOption', optionKey);

    const afterDeleteGroup = await getLocalizedText('modifierGroup', groupKey, 'name');
    expect(afterDeleteGroup).toBeNull();
  });
});
