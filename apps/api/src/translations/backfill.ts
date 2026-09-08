import path from 'path';
import { pathToFileURL } from 'url';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import {
  makeModifierGroupKey,
  makeModifierOptionKey,
  PrismaTransaction,
} from './repository.js';
import { Locale, TranslationOrigin } from './types.js';

export interface BackfillStats {
  newRecords: number;
  skippedRecords: number;
  unmatchedText: number;
  orphanRecords: number;
}

export interface DictionaryResources {
  en?: { translation?: Record<string, string> };
  km?: { translation?: Record<string, string> };
  zh?: { translation?: Record<string, string> };
}

export async function loadMenuResources(): Promise<DictionaryResources> {
  const resourcePath = path.resolve(process.cwd(), '../menu/src/i18n/resources.ts');
  const fileUrl = pathToFileURL(resourcePath).href;
  const mod = await import(fileUrl);
  return mod.resources;
}

export async function runBackfill(options: {
  apply: boolean;
  dictionary?: DictionaryResources;
  tx?: PrismaTransaction;
}): Promise<BackfillStats> {
  const { apply, tx = defaultPrisma } = options;
  const dict = options.dictionary || (await loadMenuResources());

  const enDict = dict.en?.translation || {};
  const kmDict = dict.km?.translation || {};
  const zhDict = dict.zh?.translation || {};

  const stats: BackfillStats = {
    newRecords: 0,
    skippedRecords: 0,
    unmatchedText: 0,
    orphanRecords: 0,
  };

  // Fetch all existing domain records
  const items = await tx.menuItem.findMany({
    include: {
      modifiers: {
        include: {
          options: true,
        },
      },
    },
  });

  const categories = await tx.category.findMany();

  // Fetch all existing localized text records
  const existingLocalized = await tx.localizedText.findMany({
    include: { values: true },
  });

  const existingMap = new Map<string, typeof existingLocalized[0]>();
  for (const loc of existingLocalized) {
    existingMap.set(`${loc.ownerType}:${loc.ownerKey}:${loc.field}`, loc);
  }

  // Build lookup sets for orphan detection
  const validItemIds = new Set(items.map((i) => i.id));
  const validCategoryIds = new Set(categories.map((c) => c.id));
  const validGroupKeys = new Set<string>();
  const validOptionKeys = new Set<string>();

  for (const item of items) {
    for (const group of item.modifiers) {
      const gKey = makeModifierGroupKey(item.id, group.key);
      validGroupKeys.add(gKey);
      for (const opt of group.options) {
        const oKey = makeModifierOptionKey(item.id, group.key, opt.key);
        validOptionKeys.add(oKey);
      }
    }
  }

  // Count orphans
  for (const loc of existingLocalized) {
    let exists = false;
    if (loc.ownerType === 'item') {
      exists = validItemIds.has(loc.ownerKey);
    } else if (loc.ownerType === 'category') {
      exists = validCategoryIds.has(loc.ownerKey);
    } else if (loc.ownerType === 'modifierGroup') {
      exists = validGroupKeys.has(loc.ownerKey);
    } else if (loc.ownerType === 'modifierOption') {
      exists = validOptionKeys.has(loc.ownerKey);
    }
    if (!exists) {
      stats.orphanRecords += 1;
    }
  }

  // Helper to import a single text field
  const processEntry = async (
    ownerType: 'item' | 'category' | 'modifierGroup' | 'modifierOption',
    ownerKey: string,
    field: 'name' | 'description',
    rawText: string
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const lookupKey = `${ownerType}:${ownerKey}:${field}`;
    if (existingMap.has(lookupKey)) {
      stats.skippedRecords += 1;
      return;
    }

    // Match in dictionary
    const hasEnglishMatch = Boolean(enDict[trimmed]);
    const kmTranslation = kmDict[trimmed];
    const zhTranslation = zhDict[trimmed];

    let sourceLocale: Locale | null = null;
    const cellsToCreate: Array<{
      locale: Locale;
      text: string;
      origin: TranslationOrigin;
      reviewed: boolean;
      basedOnSourceRevision: number;
    }> = [];

    if (hasEnglishMatch) {
      sourceLocale = 'en';
      cellsToCreate.push({
        locale: 'en',
        text: enDict[trimmed] || trimmed,
        origin: 'legacy',
        reviewed: false,
        basedOnSourceRevision: 1,
      });

      if (kmTranslation) {
        cellsToCreate.push({
          locale: 'km',
          text: kmTranslation,
          origin: 'legacy',
          reviewed: false,
          basedOnSourceRevision: 1,
        });
      }

      if (zhTranslation) {
        cellsToCreate.push({
          locale: 'zh',
          text: zhTranslation,
          origin: 'legacy',
          reviewed: false,
          basedOnSourceRevision: 1,
        });
      }
    } else {
      // Preserve unrecognized text as unclassified source without calling AI
      sourceLocale = null;
      stats.unmatchedText += 1;
    }

    stats.newRecords += 1;

    if (apply) {
      await tx.localizedText.create({
        data: {
          ownerType,
          ownerKey,
          field,
          sourceLocale,
          sourceText: trimmed,
          sourceRevision: 1,
          revision: 1,
          values: {
            create: cellsToCreate,
          },
        },
      });
    }
  };

  // Process items
  for (const item of items) {
    await processEntry('item', item.id, 'name', item.name);
    if (item.description) {
      await processEntry('item', item.id, 'description', item.description);
    }

    // Modifiers
    for (const group of item.modifiers) {
      const gKey = makeModifierGroupKey(item.id, group.key);
      await processEntry('modifierGroup', gKey, 'name', group.name);

      for (const opt of group.options) {
        const oKey = makeModifierOptionKey(item.id, group.key, opt.key);
        await processEntry('modifierOption', oKey, 'name', opt.name);
      }
    }
  }

  // Process categories
  for (const cat of categories) {
    await processEntry('category', cat.id, 'name', cat.name);
  }

  return stats;
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('backfill.ts')) {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  console.log(`Starting translation backfill (${isApply ? 'APPLY' : 'DRY-RUN'})...`);

  runBackfill({ apply: isApply })
    .then((stats) => {
      console.log('--- Backfill Summary ---');
      console.log(`New records:        ${stats.newRecords}`);
      console.log(`Existing skipped:   ${stats.skippedRecords}`);
      console.log(`Unmatched text:     ${stats.unmatchedText}`);
      console.log(`Orphan records:     ${stats.orphanRecords}`);
      console.log('------------------------');
      if (isDryRun) {
        console.log('Dry run complete. No database changes were applied. Use --apply to execute.');
      } else {
        console.log('Backfill applied successfully.');
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backfill failed:', err);
      process.exit(1);
    });
}
