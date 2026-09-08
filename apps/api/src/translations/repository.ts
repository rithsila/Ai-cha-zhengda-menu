import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import {
  Locale,
  LocalizedCell,
  LocalizedText,
  LocalizedTextEdit,
  TextField,
  TextOwner,
  TranslationOrigin,
  SUPPORTED_LOCALES,
  SUPPORTED_OWNERS,
  SUPPORTED_FIELDS,
} from './types.js';

export type PrismaTransaction = Prisma.TransactionClient | PrismaClient;

export class TranslationConflictError extends Error {
  public statusCode = 409;
  public code = 'TRANSLATION_CONFLICT';
  public expectedRevision: number;
  public currentRevision: number;
  public currentRecord?: LocalizedText;

  constructor(
    message: string,
    expectedRevision: number,
    currentRevision: number,
    currentRecord?: LocalizedText
  ) {
    super(message);
    this.name = 'TranslationConflictError';
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
    this.currentRecord = currentRecord;
  }
}

export class TranslationValidationError extends Error {
  public statusCode = 400;
  public code: string;

  constructor(message: string, code = 'TRANSLATION_VALIDATION_ERROR') {
    super(message);
    this.name = 'TranslationValidationError';
    this.code = code;
  }
}

export function makeModifierGroupKey(menuItemId: string, groupKey: string): string {
  return JSON.stringify([menuItemId, groupKey]);
}

export function makeModifierOptionKey(
  menuItemId: string,
  groupKey: string,
  optionKey: string
): string {
  return JSON.stringify([menuItemId, groupKey, optionKey]);
}

function mapPrismaToLocalizedText(row: any): LocalizedText {
  return {
    id: row.id,
    ownerType: row.ownerType as TextOwner,
    ownerKey: row.ownerKey,
    field: row.field as TextField,
    sourceLocale: (row.sourceLocale as Locale) || null,
    sourceText: row.sourceText || '',
    sourceRevision: row.sourceRevision,
    revision: row.revision,
    cells: (row.values || []).map((v: any) => ({
      locale: v.locale as Locale,
      text: v.text,
      origin: v.origin as TranslationOrigin,
      reviewed: Boolean(v.reviewed),
      basedOnSourceRevision: v.basedOnSourceRevision,
    })),
  };
}

export async function getLocalizedTexts(
  ownerType: TextOwner,
  ownerKey: string,
  tx: PrismaTransaction = defaultPrisma
): Promise<LocalizedText[]> {
  const rows = await tx.localizedText.findMany({
    where: { ownerType, ownerKey },
    include: { values: true },
  });
  return rows.map(mapPrismaToLocalizedText);
}

export async function getLocalizedText(
  ownerType: TextOwner,
  ownerKey: string,
  field: TextField,
  tx: PrismaTransaction = defaultPrisma
): Promise<LocalizedText | null> {
  const row = await tx.localizedText.findUnique({
    where: {
      ownerType_ownerKey_field: { ownerType, ownerKey, field },
    },
    include: { values: true },
  });
  return row ? mapPrismaToLocalizedText(row) : null;
}

export async function getLocalizedTextsForOwners(
  owners: Array<{ ownerType: TextOwner; ownerKey: string }>,
  tx: PrismaTransaction = defaultPrisma
): Promise<LocalizedText[]> {
  if (owners.length === 0) return [];
  const orClauses = owners.map((o) => ({
    ownerType: o.ownerType,
    ownerKey: o.ownerKey,
  }));

  const rows = await tx.localizedText.findMany({
    where: { OR: orClauses },
    include: { values: true },
  });
  return rows.map(mapPrismaToLocalizedText);
}

export async function deleteOwnedTexts(
  ownerType: TextOwner,
  ownerKey: string,
  tx: PrismaTransaction = defaultPrisma
): Promise<void> {
  await tx.localizedText.deleteMany({
    where: { ownerType, ownerKey },
  });
}

export async function deleteOwnedTextsByKeys(
  keys: Array<{ ownerType: TextOwner; ownerKey: string }>,
  tx: PrismaTransaction = defaultPrisma
): Promise<void> {
  if (keys.length === 0) return;
  await tx.localizedText.deleteMany({
    where: {
      OR: keys.map((k) => ({
        ownerType: k.ownerType,
        ownerKey: k.ownerKey,
      })),
    },
  });
}

/**
 * Saves localized text edits atomically.
 * Synchronizes domain tables (MenuItem, Category, ModifierGroup, ModifierOption)
 * when source text is modified.
 */
export async function saveLocalizedEdits(
  edits: LocalizedTextEdit[],
  tx: PrismaTransaction = defaultPrisma
): Promise<LocalizedText[]> {
  if (!edits || edits.length === 0) return [];

  const results: LocalizedText[] = [];

  for (const edit of edits) {
    // Validate owner & field
    if (edit.ownerType && !SUPPORTED_OWNERS.includes(edit.ownerType)) {
      throw new TranslationValidationError(`Unsupported ownerType: ${edit.ownerType}`);
    }
    if (edit.field && !SUPPORTED_FIELDS.includes(edit.field)) {
      throw new TranslationValidationError(`Unsupported field: ${edit.field}`);
    }
    if (edit.field === 'description' && edit.ownerType && edit.ownerType !== 'item') {
      throw new TranslationValidationError('Description is only supported for item owners');
    }

    // Lookup existing record
    let existingRow = null;
    if (edit.id) {
      existingRow = await tx.localizedText.findUnique({
        where: { id: edit.id },
        include: { values: true },
      });
    } else if (edit.ownerType && edit.ownerKey && edit.field) {
      existingRow = await tx.localizedText.findUnique({
        where: {
          ownerType_ownerKey_field: {
            ownerType: edit.ownerType,
            ownerKey: edit.ownerKey,
            field: edit.field,
          },
        },
        include: { values: true },
      });
    }

    // Check revision conflicts
    if (edit.expectedRevision !== undefined) {
      if (!existingRow && edit.expectedRevision !== 0) {
        throw new TranslationConflictError(
          `Record does not exist but expected revision was ${edit.expectedRevision}`,
          edit.expectedRevision,
          0
        );
      }
      if (existingRow && existingRow.revision !== edit.expectedRevision) {
        throw new TranslationConflictError(
          `Stale revision conflict: expected ${edit.expectedRevision}, server has ${existingRow.revision}`,
          edit.expectedRevision,
          existingRow.revision,
          mapPrismaToLocalizedText(existingRow)
        );
      }
    }

    const ownerType = (edit.ownerType || existingRow?.ownerType) as TextOwner;
    const ownerKey = edit.ownerKey || existingRow?.ownerKey;
    const field = (edit.field || existingRow?.field) as TextField;

    if (!ownerType || !ownerKey || !field) {
      throw new TranslationValidationError('Missing required ownerType, ownerKey, or field');
    }

    // Determine target sourceLocale
    let sourceLocale: Locale | null = null;
    if (edit.sourceLocale !== undefined) {
      sourceLocale = edit.sourceLocale;
    } else if (existingRow) {
      sourceLocale = (existingRow.sourceLocale as Locale) || null;
    }

    if (sourceLocale && !SUPPORTED_LOCALES.includes(sourceLocale)) {
      throw new TranslationValidationError(`Invalid sourceLocale: ${sourceLocale}`);
    }

    // Check duplicate cell locales in the same edit
    const cellLocales = new Set<string>();
    for (const cell of edit.cells) {
      if (!SUPPORTED_LOCALES.includes(cell.locale)) {
        throw new TranslationValidationError(`Unsupported cell locale: ${cell.locale}`);
      }
      if (cellLocales.has(cell.locale)) {
        throw new TranslationValidationError(`Duplicate cell locale ${cell.locale} in edit`);
      }
      cellLocales.add(cell.locale);
    }

    // Check if source text is in the cells
    let newSourceText = existingRow?.sourceText || '';
    let sourceCellSpecified = false;
    if (sourceLocale) {
      const sourceCell = edit.cells.find((c) => c.locale === sourceLocale);
      if (sourceCell) {
        newSourceText = sourceCell.text;
        sourceCellSpecified = true;
      }
    }

    // Validation: Names cannot be blank
    if (field === 'name') {
      if (sourceCellSpecified && !newSourceText.trim()) {
        throw new TranslationValidationError('Item or category name cannot be blank', 'BLANK_NAME');
      }
      if (!existingRow && !newSourceText.trim()) {
        const firstCell = edit.cells[0];
        if (!firstCell || !firstCell.text.trim()) {
          throw new TranslationValidationError('Name cannot be blank', 'BLANK_NAME');
        }
        newSourceText = firstCell.text;
      }
    }

    // Description clearing check:
    // If source description is set to empty string, atomically clear all translations
    const isDescriptionCleared =
      field === 'description' && sourceCellSpecified && newSourceText.trim() === '';

    // Determine revisions
    const oldSourceText = existingRow?.sourceText || '';
    const oldSourceLocale = existingRow?.sourceLocale || null;
    const sourceChanged =
      !existingRow ||
      oldSourceText !== newSourceText ||
      oldSourceLocale !== sourceLocale;

    const newRevision = existingRow ? existingRow.revision + 1 : 1;
    const newSourceRevision = existingRow
      ? sourceChanged
        ? existingRow.sourceRevision + 1
        : existingRow.sourceRevision
      : 1;

    // Upsert LocalizedText row
    let textRowId = existingRow?.id;
    if (existingRow) {
      await tx.localizedText.update({
        where: { id: existingRow.id },
        data: {
          sourceLocale,
          sourceText: isDescriptionCleared ? '' : newSourceText,
          sourceRevision: newSourceRevision,
          revision: newRevision,
        },
      });
    } else {
      const created = await tx.localizedText.create({
        data: {
          ownerType,
          ownerKey,
          field,
          sourceLocale,
          sourceText: newSourceText,
          sourceRevision: newSourceRevision,
          revision: newRevision,
        },
      });
      textRowId = created.id;
    }

    if (isDescriptionCleared) {
      // Delete all cells for cleared description
      await tx.localizedTextValue.deleteMany({
        where: { textId: textRowId },
      });
    } else {
      // Update or create cells
      for (const cell of edit.cells) {
        const isSourceCell = cell.locale === sourceLocale;
        const origin: TranslationOrigin = isSourceCell
          ? 'original'
          : 'manual';

        const reviewed = isSourceCell ? true : cell.reviewed ?? true;
        const basedOnSourceRevision = newSourceRevision;

        await tx.localizedTextValue.upsert({
          where: {
            textId_locale: {
              textId: textRowId!,
              locale: cell.locale,
            },
          },
          update: {
            text: cell.text,
            origin,
            reviewed,
            basedOnSourceRevision,
          },
          create: {
            textId: textRowId!,
            locale: cell.locale,
            text: cell.text,
            origin,
            reviewed,
            basedOnSourceRevision,
          },
        });
      }
    }

    // Synchronize domain tables if source text changed
    if (sourceChanged && newSourceText.trim().length > 0) {
      if (ownerType === 'item') {
        if (field === 'name') {
          await tx.menuItem.updateMany({
            where: { id: ownerKey },
            data: { name: newSourceText },
          });
        } else if (field === 'description') {
          await tx.menuItem.updateMany({
            where: { id: ownerKey },
            data: { description: newSourceText },
          });
        }
      } else if (ownerType === 'category' && field === 'name') {
        // Find category to get old name
        const category = await tx.category.findUnique({
          where: { id: ownerKey },
        });
        if (category) {
          const oldCatName = category.name;
          await tx.category.update({
            where: { id: ownerKey },
            data: { name: newSourceText },
          });
          // Update matching MenuItem.category references
          await tx.menuItem.updateMany({
            where: { category: oldCatName },
            data: { category: newSourceText },
          });
        }
      } else if (ownerType === 'modifierGroup' && field === 'name') {
        // ownerKey is JSON string [menuItemId, groupKey]
        try {
          const [menuItemId, groupKey] = JSON.parse(ownerKey);
          await tx.modifierGroup.updateMany({
            where: { menuItemId, key: groupKey },
            data: { name: newSourceText },
          });
        } catch {}
      } else if (ownerType === 'modifierOption' && field === 'name') {
        // ownerKey is JSON string [menuItemId, groupKey, optionKey]
        try {
          const [menuItemId, groupKey, optionKey] = JSON.parse(ownerKey);
          const group = await tx.modifierGroup.findFirst({
            where: { menuItemId, key: groupKey },
          });
          if (group) {
            await tx.modifierOption.updateMany({
              where: { modifierGroupId: group.id, key: optionKey },
              data: { name: newSourceText },
            });
          }
        } catch {}
      }
    }

    // Read back complete record
    const updatedRow = await tx.localizedText.findUnique({
      where: { id: textRowId! },
      include: { values: true },
    });

    if (updatedRow) {
      results.push(mapPrismaToLocalizedText(updatedRow));
    }
  }

  return results;
}

export async function attachCatalogLocalization<T extends { id: string; modifiers?: any[] }>(
  items: T[],
  tx: PrismaTransaction = defaultPrisma
): Promise<Array<T & { localized?: { name?: LocalizedText; description?: LocalizedText } }>> {
  if (items.length === 0) return [];

  const owners: Array<{ ownerType: TextOwner; ownerKey: string }> = [];
  for (const item of items) {
    owners.push({ ownerType: 'item', ownerKey: item.id });
    if (Array.isArray(item.modifiers)) {
      for (const group of item.modifiers) {
        const gKey = makeModifierGroupKey(item.id, group.key);
        owners.push({ ownerType: 'modifierGroup', ownerKey: gKey });
        if (Array.isArray(group.options)) {
          for (const opt of group.options) {
            const oKey = makeModifierOptionKey(item.id, group.key, opt.key);
            owners.push({ ownerType: 'modifierOption', ownerKey: oKey });
          }
        }
      }
    }
  }

  const allLocalized = await getLocalizedTextsForOwners(owners, tx);
  const map = new Map<string, LocalizedText>();
  for (const loc of allLocalized) {
    map.set(`${loc.ownerType}:${loc.ownerKey}:${loc.field}`, loc);
  }

  return items.map((item) => {
    const itemLocalized = {
      name: map.get(`item:${item.id}:name`),
      description: map.get(`item:${item.id}:description`),
    };

    let modifiedModifiers = item.modifiers;
    if (Array.isArray(item.modifiers)) {
      modifiedModifiers = item.modifiers.map((group) => {
        const gKey = makeModifierGroupKey(item.id, group.key);
        const groupLocalized = {
          name: map.get(`modifierGroup:${gKey}:name`),
        };

        let modifiedOptions = group.options;
        if (Array.isArray(group.options)) {
          modifiedOptions = group.options.map((opt: any) => {
            const oKey = makeModifierOptionKey(item.id, group.key, opt.key);
            return {
              ...opt,
              localized: {
                name: map.get(`modifierOption:${oKey}:name`),
              },
            };
          });
        }

        return {
          ...group,
          options: modifiedOptions,
          localized: groupLocalized,
        };
      });
    }

    return {
      ...item,
      modifiers: modifiedModifiers,
      localized: itemLocalized,
    };
  });
}

export async function attachCategoryLocalization<T extends { id: string }>(
  categories: T[],
  tx: PrismaTransaction = defaultPrisma
): Promise<Array<T & { localized?: { name?: LocalizedText } }>> {
  if (categories.length === 0) return [];

  const owners: Array<{ ownerType: TextOwner; ownerKey: string }> = categories.map((c) => ({
    ownerType: 'category',
    ownerKey: c.id,
  }));

  const allLocalized = await getLocalizedTextsForOwners(owners, tx);
  const map = new Map<string, LocalizedText>();
  for (const loc of allLocalized) {
    map.set(`${loc.ownerType}:${loc.ownerKey}:${loc.field}`, loc);
  }

  return categories.map((cat) => ({
    ...cat,
    localized: {
      name: map.get(`category:${cat.id}:name`),
    },
  }));
}

