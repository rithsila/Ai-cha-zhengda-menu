import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, translationService } from '../src/app.js';
import { prisma } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { MockTranslationProvider } from '../src/translations/provider.js';

describe('Translation API Endpoints & Catalog Integration (Task 4)', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;
  const staffToken = issueToken('staff').token;

  beforeEach(async () => {
    await prisma.localizedTextValue.deleteMany();
    await prisma.localizedText.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
  });

  describe('Security & Access Control', () => {
    it('rejects unauthenticated and staff requests to translation endpoints', async () => {
      // Unauthenticated
      await request(app).post('/api/translations/draft').send({}).expect(401);
      await request(app).get('/api/translations').expect(401);
      await request(app).patch('/api/translations').send({ edits: [] }).expect(401);

      // Staff (forbidden for staff, manager only)
      await request(app)
        .post('/api/translations/draft')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({})
        .expect(401);

      await request(app)
        .get('/api/translations')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(401);

      await request(app)
        .patch('/api/translations')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ edits: [] })
        .expect(401);
    });

    it('returns 503 when translation service is disabled or unconfigured', async () => {
      translationService.setProvider(null, false);

      const res = await request(app)
        .post('/api/translations/draft')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestId: 'req-disabled',
          entries: [
            {
              clientKey: 'item-1',
              text: 'Tea',
              sourceLocale: 'en',
              targetLocales: ['zh'],
              context: { field: 'name' },
            },
          ],
        })
        .expect(503);

      expect(res.body.code).toBe('TRANSLATION_DISABLED');
    });
  });

  describe('Draft Endpoint (POST /api/translations/draft)', () => {
    it('generates translation draft without writing to the database', async () => {
      const mockProvider = new MockTranslationProvider({
        珍珠奶茶: { en: 'Pearl milk tea', km: 'តែទឹកដោះគោគុជ' },
      });
      translationService.setProvider(mockProvider, true);

      const res = await request(app)
        .post('/api/translations/draft')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          requestId: 'req-draft-1',
          entries: [
            {
              clientKey: 'k-pearl',
              text: '珍珠奶茶',
              sourceLocale: 'zh',
              targetLocales: ['en', 'km'],
              context: { field: 'name', category: 'Milk Tea' },
            },
          ],
        })
        .expect(200);

      expect(res.body.requestId).toBe('req-draft-1');
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].sourceLocale).toBe('zh');
      expect(res.body.entries[0].translations.en).toBe('Pearl milk tea');
      expect(res.body.entries[0].translations.km).toBe('តែទឹកដោះគោគុជ');

      // Verify no database write occurred
      const count = await prisma.localizedText.count();
      expect(count).toBe(0);
    });
  });

  describe('Translations Listing & Search (GET /api/translations)', () => {
    it('returns paginated records and supports search by query q', async () => {
      const item = await prisma.menuItem.create({
        data: { id: 'item-search-1', name: 'Passion Fruit Frappe', category: 'Frappe', basePrice: 3.0 },
      });

      // Save translations for this item
      await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Frappe',
          name: 'Passion Fruit Frappe',
          basePrice: 3.0,
          localization: {
            name: {
              sourceLocale: 'en',
              cells: [
                { locale: 'en', text: 'Passion Fruit Frappe' },
                { locale: 'km', text: 'ហ្វ្រាប៉េផាសិន' },
                { locale: 'zh', text: '百香果冰沙' },
              ],
            },
          },
        })
        .expect(201);

      // Search with English
      const resEn = await request(app)
        .get('/api/translations?q=Passion')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(resEn.body.items.length).toBeGreaterThan(0);

      // Search with Chinese
      const resZh = await request(app)
        .get('/api/translations?q=百香果')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(resZh.body.items.length).toBeGreaterThan(0);

      // Search with Khmer
      const resKm = await request(app)
        .get('/api/translations?q=ផាសិន')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      expect(resKm.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('Translations Batch Patch (PATCH /api/translations)', () => {
    it('saves edits atomically and returns 409 on stale revision conflict', async () => {
      const createRes = await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Milk Tea',
          name: 'Brown Sugar Pearl',
          basePrice: 2.5,
          localization: {
            name: {
              sourceLocale: 'en',
              cells: [{ locale: 'en', text: 'Brown Sugar Pearl' }],
            },
          },
        })
        .expect(201);

      const nameLocId = createRes.body.localized.name.id;
      const initialRev = createRes.body.localized.name.revision;

      // Successful update
      const patchRes = await request(app)
        .patch('/api/translations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          edits: [
            {
              id: nameLocId,
              expectedRevision: initialRev,
              cells: [
                { locale: 'en', text: 'Brown Sugar Pearl' },
                { locale: 'zh', text: '黑糖珍珠', reviewed: true },
              ],
            },
          ],
        })
        .expect(200);

      expect(patchRes.body.updated[0].revision).toBe(initialRev + 1);

      // Conflict update using stale revision
      const conflictRes = await request(app)
        .patch('/api/translations')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          edits: [
            {
              id: nameLocId,
              expectedRevision: initialRev, // Stale!
              cells: [{ locale: 'zh', text: 'Different' }],
            },
          ],
        })
        .expect(409);

      expect(conflictRes.body.code).toBe('TRANSLATION_CONFLICT');
      expect(conflictRes.body.currentRevision).toBe(initialRev + 1);
    });
  });

  describe('Catalog & Category Localization Integration', () => {
    it('Chinese-source item create round trip', async () => {
      const res = await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Milk Tea',
          name: '珍珠奶茶',
          basePrice: 2.5,
          localization: {
            name: {
              sourceLocale: 'zh',
              cells: [
                { locale: 'zh', text: '珍珠奶茶' },
                { locale: 'en', text: 'Pearl milk tea' },
                { locale: 'km', text: 'តែទឹកដោះគោគុជ' },
              ],
            },
          },
        })
        .expect(201);

      const created = res.body;
      expect(created.name).toBe('珍珠奶茶');
      expect(created.localized.name.sourceLocale).toBe('zh');
      expect(created.localized.name.cells.find((c: any) => c.locale === 'en')?.text).toBe('Pearl milk tea');
    });

    it('rejects duplicate modifier keys on item create and update', async () => {
      await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Milk Tea',
          name: 'Duplicate Mod Test',
          basePrice: 2.0,
          modifiers: [
            { key: 'dup-group', name: 'Group 1', options: [{ key: 'opt-1', name: 'Opt 1' }] },
            { key: 'dup-group', name: 'Group 2', options: [{ key: 'opt-2', name: 'Opt 2' }] },
          ],
        })
        .expect(400);
    });

    it('price-only and photo-only updates preserve translation revisions without calling AI', async () => {
      const createRes = await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Milk Tea',
          name: 'Original Drink',
          basePrice: 2.0,
          localization: {
            name: {
              sourceLocale: 'en',
              cells: [
                { locale: 'en', text: 'Original Drink' },
                { locale: 'zh', text: '原味饮品' },
              ],
            },
          },
        })
        .expect(201);

      const revBefore = createRes.body.localized.name.revision;
      const srcRevBefore = createRes.body.localized.name.sourceRevision;

      // Update only price and photo
      const updateRes = await request(app)
        .put(`/api/catalog/${createRes.body.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          basePrice: 3.5,
          image: '/images/new-photo.jpg',
        })
        .expect(200);

      expect(updateRes.body.basePrice).toBe(3.5);
      expect(updateRes.body.image).toBe('/images/new-photo.jpg');
      expect(updateRes.body.localized.name.revision).toBe(revBefore);
      expect(updateRes.body.localized.name.sourceRevision).toBe(srcRevBefore);
    });

    it('cascades category name change to MenuItem records while translated label edit does not change category membership', async () => {
      const catRes = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          name: 'Old Category',
          localization: {
            name: {
              sourceLocale: 'en',
              cells: [
                { locale: 'en', text: 'Old Category' },
                { locale: 'km', text: 'ប្រភេទចាស់' },
              ],
            },
          },
        })
        .expect(201);

      const catId = catRes.body.id;

      const itemRes = await request(app)
        .post('/api/catalog')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          brand: 'ai-cha',
          category: 'Old Category',
          name: 'Category Drink',
          basePrice: 2.0,
        })
        .expect(201);

      // 1. Changing only the Khmer translated label in localization
      await request(app)
        .put(`/api/categories/${catId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          localization: {
            name: {
              sourceLocale: 'en',
              cells: [
                { locale: 'en', text: 'Old Category' },
                { locale: 'km', text: 'ប្រភេទចាស់កែប្រែ' }, // translated correction
              ],
            },
          },
        })
        .expect(200);

      // Item category membership must remain 'Old Category'
      const itemAfterLabelEdit = await prisma.menuItem.findUnique({ where: { id: itemRes.body.id } });
      expect(itemAfterLabelEdit?.category).toBe('Old Category');

      // 2. Changing the actual source name cascades to MenuItem
      await request(app)
        .put(`/api/categories/${catId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Renamed Category',
        })
        .expect(200);

      const itemAfterSourceNameEdit = await prisma.menuItem.findUnique({ where: { id: itemRes.body.id } });
      expect(itemAfterSourceNameEdit?.category).toBe('Renamed Category');
    });
  });
});
