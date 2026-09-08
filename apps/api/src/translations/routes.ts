import { Router, Request, Response } from 'express';
import { requireManager } from '../auth.js';
import { translationService, TranslationService } from './service.js';
import { TranslationConflictError, TranslationValidationError } from './repository.js';
import { TranslationError } from './provider.js';

export function createTranslationRouter(service: TranslationService = translationService): Router {
  const router = Router();

  /**
   * POST /api/translations/draft
   * Manager-only. Generates AI draft translations without writing to the database.
   */
  router.post('/draft', requireManager, async (req: Request, res: Response) => {
    try {
      const managerId = (req as any).user?.telegramUserId || (req as any).user?.phoneNumber || 'manager';
      const result = await service.generateDraft(req.body, String(managerId));
      res.json(result);
    } catch (err: any) {
      if (err instanceof TranslationError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.error('Translation draft error:', err);
      res.status(500).json({ error: err.message || 'Internal translation draft error' });
    }
  });

  /**
   * GET /api/translations
   * Manager-only. Paginated list and search of localized records.
   */
  router.get('/', requireManager, async (req: Request, res: Response) => {
    try {
      const { ownerType, status, q, cursor, limit, page } = req.query;
      const result = await service.listTranslations({
        ownerType: ownerType as any,
        status: status as any,
        q: q ? String(q) : undefined,
        cursor: cursor ? String(cursor) : undefined,
        limit: limit ? Number(limit) : undefined,
        page: page ? Number(page) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (err instanceof TranslationValidationError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.error('Translation listing error:', err);
      res.status(500).json({ error: 'Failed to fetch translations' });
    }
  });

  /**
   * PATCH /api/translations
   * Manager-only. Atomic all-or-nothing save for up to 50 records.
   */
  router.patch('/', requireManager, async (req: Request, res: Response) => {
    try {
      const updated = await service.saveEdits(req.body);
      res.json({ ok: true, updated });
    } catch (err: any) {
      if (err instanceof TranslationConflictError) {
        return res.status(409).json({
          error: err.message,
          code: err.code,
          expectedRevision: err.expectedRevision,
          currentRevision: err.currentRevision,
          currentRecord: err.currentRecord,
        });
      }
      if (err instanceof TranslationValidationError) {
        return res.status(400).json({ error: err.message, code: err.code });
      }
      console.error('Translation patch error:', err);
      res.status(500).json({ error: err.message || 'Failed to save translations' });
    }
  });

  return router;
}
