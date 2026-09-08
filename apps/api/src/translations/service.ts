import { prisma } from '../db.js';
import {
  saveLocalizedEdits,
  getLocalizedTextsForOwners,
  PrismaTransaction,
  TranslationValidationError,
} from './repository.js';
import {
  detectLocaleFromText,
  MockTranslationProvider,
  OpenAITranslationProvider,
  TranslationError,
  TranslationLimiter,
  validateDraftRequest,
} from './provider.js';
import {
  LocalizedText,
  LocalizedTextEdit,
  PatchTranslationsBody,
  SUPPORTED_LOCALES,
  SUPPORTED_OWNERS,
  TextOwner,
  TranslationDraftRequest,
  TranslationDraftResult,
  TranslationProvider,
} from './types.js';

export interface TranslationListFilter {
  ownerType?: TextOwner;
  status?: 'missing' | 'unreviewed' | 'needs-review' | 'needs_review';
  q?: string;
  cursor?: string;
  limit?: number;
  page?: number;
}

export interface TranslationListResult {
  items: Array<LocalizedText & { ownerLabel?: string }>;
  nextCursor: string | null;
  total: number;
  page: number;
  limit: number;
}

export class TranslationService {
  private provider: TranslationProvider | null = null;
  private isEnabled = false;

  constructor(provider?: TranslationProvider, isEnabled?: boolean) {
    this.isEnabled = isEnabled !== undefined
      ? isEnabled
      : process.env.TRANSLATION_ENABLED === 'true';

    if (provider) {
      this.provider = provider;
    } else if (this.isEnabled && process.env.TRANSLATION_API_KEY) {
      this.provider = new OpenAITranslationProvider(
        process.env.TRANSLATION_API_KEY,
        process.env.TRANSLATION_MODEL || 'gpt-4o-mini'
      );
    }
  }

  public setProvider(provider: TranslationProvider | null, isEnabled = true): void {
    this.provider = provider;
    this.isEnabled = isEnabled;
  }

  public async generateDraft(
    input: TranslationDraftRequest,
    managerKey = 'manager-default'
  ): Promise<TranslationDraftResult> {
    if (!this.isEnabled || !this.provider) {
      throw new TranslationError(
        'Automatic translation is currently disabled or unconfigured.',
        503,
        'TRANSLATION_DISABLED'
      );
    }

    validateDraftRequest(input);

    const release = await TranslationLimiter.acquire(managerKey);
    try {
      return await this.provider.translate(input);
    } finally {
      release();
    }
  }

  public async listTranslations(
    filter: TranslationListFilter,
    tx: PrismaTransaction = prisma
  ): Promise<TranslationListResult> {
    const page = Math.max(Number(filter.page) || 1, 1);
    const limit = Math.min(Math.max(Number(filter.limit) || 10, 1), 100);
    const where: any = {};

    if (filter.ownerType) {
      let normalizedOwner = filter.ownerType as string;
      if (normalizedOwner === 'menu_item') normalizedOwner = 'item';
      if (normalizedOwner === 'modifier_group') normalizedOwner = 'modifierGroup';
      if (normalizedOwner === 'modifier_option') normalizedOwner = 'modifierOption';

      if (!SUPPORTED_OWNERS.includes(normalizedOwner as any)) {
        throw new TranslationValidationError(`Invalid ownerType filter: ${filter.ownerType}`);
      }
      where.ownerType = normalizedOwner;
    }

    // Search query filter
    const query = filter.q?.trim();
    if (query) {
      where.OR = [
        { sourceText: { contains: query } },
        { values: { some: { text: { contains: query } } } },
      ];
    }

    const total = await tx.localizedText.count({ where });

    // Cursor or Page pagination
    let cursorObj = undefined;
    if (filter.cursor) {
      cursorObj = { id: filter.cursor };
    }

    const skip = cursorObj ? 1 : (page - 1) * limit;

    const rows = await tx.localizedText.findMany({
      where,
      take: limit + 1,
      skip,
      cursor: cursorObj,
      orderBy: { createdAt: 'desc' },
      include: { values: true },
    });

    const hasMore = rows.length > limit;
    const pagedRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? pagedRows[pagedRows.length - 1].id : null;

    // Filter by status if requested
    let targetStatus = filter.status as string | undefined;
    if (targetStatus === 'needs_review') targetStatus = 'needs-review';

    let filtered = pagedRows;
    if (targetStatus === 'missing') {
      filtered = pagedRows.filter((r) => {
        const locales = new Set(r.values.map((v) => v.locale));
        return SUPPORTED_LOCALES.some((l) => !locales.has(l));
      });
    } else if (targetStatus === 'unreviewed') {
      filtered = pagedRows.filter((r) => r.values.some((v) => !v.reviewed));
    } else if (targetStatus === 'needs-review') {
      filtered = pagedRows.filter((r) =>
        r.values.some((v) => v.locale !== r.sourceLocale && v.basedOnSourceRevision !== r.sourceRevision)
      );
    }

    // Attach owner labels for UI display
    const itemsWithLabels: Array<LocalizedText & { ownerLabel?: string }> = [];

    // Collect keys by ownerType for bulk label retrieval
    const itemIds = new Set<string>();
    const categoryIds = new Set<string>();

    for (const r of filtered) {
      if (r.ownerType === 'item') {
        itemIds.add(r.ownerKey);
      } else if (r.ownerType === 'category') {
        categoryIds.add(r.ownerKey);
      } else if (r.ownerType === 'modifierGroup' || r.ownerType === 'modifierOption') {
        try {
          const parsed = JSON.parse(r.ownerKey);
          if (Array.isArray(parsed) && parsed[0]) {
            itemIds.add(parsed[0]);
          }
        } catch {}
      }
    }

    const items = itemIds.size > 0
      ? await tx.menuItem.findMany({ where: { id: { in: Array.from(itemIds) } } })
      : [];
    const itemMap = new Map(items.map((i) => [i.id, i.name]));

    const categories = categoryIds.size > 0
      ? await tx.category.findMany({ where: { id: { in: Array.from(categoryIds) } } })
      : [];
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    for (const r of filtered) {
      let label = r.sourceText || r.ownerKey;
      if (r.ownerType === 'item') {
        label = itemMap.get(r.ownerKey) || r.sourceText || r.ownerKey;
      } else if (r.ownerType === 'category') {
        label = categoryMap.get(r.ownerKey) || r.sourceText || r.ownerKey;
      } else if (r.ownerType === 'modifierGroup' || r.ownerType === 'modifierOption') {
        try {
          const parsed = JSON.parse(r.ownerKey);
          const itemId = parsed[0];
          const itemName = itemMap.get(itemId) || itemId;
          label = `${itemName} > ${r.sourceText}`;
        } catch {}
      }

      itemsWithLabels.push({
        id: r.id,
        ownerType: r.ownerType as TextOwner,
        ownerKey: r.ownerKey,
        field: r.field as any,
        sourceLocale: (r.sourceLocale as any) || null,
        sourceText: r.sourceText,
        sourceRevision: r.sourceRevision,
        revision: r.revision,
        cells: r.values.map((v) => ({
          locale: v.locale as any,
          text: v.text,
          origin: v.origin as any,
          reviewed: v.reviewed,
          basedOnSourceRevision: v.basedOnSourceRevision,
        })),
        ownerLabel: label,
      });
    }

    return {
      items: itemsWithLabels,
      nextCursor,
      total,
      page,
      limit,
    };
  }

  public async saveEdits(
    body: PatchTranslationsBody,
    tx: PrismaTransaction = prisma
  ): Promise<LocalizedText[]> {
    if (!body || !Array.isArray(body.edits) || body.edits.length === 0) {
      throw new TranslationValidationError('edits array is required and must not be empty');
    }

    if (body.edits.length > 50) {
      throw new TranslationValidationError('Maximum 50 records allowed per PATCH request');
    }

    const editsToApply: LocalizedTextEdit[] = body.edits.map((e) => ({
      id: e.id,
      expectedRevision: e.expectedRevision,
      sourceLocale: e.sourceLocale,
      cells: e.cells,
    }));

    return saveLocalizedEdits(editsToApply, tx);
  }
}

export const translationService = new TranslationService();
