import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, translationService } from '../src/app.js';
import { prisma } from '../src/db.js';
import { issueToken } from '../src/auth.js';
import { MockTranslationProvider } from '../src/translations/provider.js';

describe('End-to-End Multilingual Menu Management (Task 8)', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;
  const deterministicProvider = new MockTranslationProvider();

  beforeEach(async () => {
    translationService.setProvider(deterministicProvider, true);
    await prisma.localizedTextValue.deleteMany();
    await prisma.localizedText.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
  });

  it('handles item creation in each source language (en, km, zh)', async () => {
    // 1. English source item
    const resEn = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Smoothies',
        name: 'Mango Smoothie',
        description: 'Fresh mango blended with ice',
        basePrice: 3.5,
        localization: {
          name: {
            sourceLocale: 'en',
            cells: [
              { locale: 'en', text: 'Mango Smoothie' },
              { locale: 'km', text: 'ស្មូតធីស្វាយ' },
              { locale: 'zh', text: '芒果冰沙' },
            ],
          },
        },
      })
      .expect(201);

    expect(resEn.body.name).toBe('Mango Smoothie');
    expect(resEn.body.localized.name.sourceLocale).toBe('en');
    expect(resEn.body.localized.name.cells).toHaveLength(3);

    // 2. Khmer source item
    const resKm = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Coffee',
        name: 'កាហ្វេដោះគោទឹកកក',
        description: 'កាហ្វេប្រពៃណីខ្មែរ',
        basePrice: 2.0,
        localization: {
          name: {
            sourceLocale: 'km',
            cells: [
              { locale: 'km', text: 'កាហ្វេដោះគោទឹកកក' },
              { locale: 'en', text: 'Iced Milk Coffee' },
              { locale: 'zh', text: '冰奶咖啡' },
            ],
          },
        },
      })
      .expect(201);

    expect(resKm.body.name).toBe('កាហ្វេដោះគោទឹកកក');
    expect(resKm.body.localized.name.sourceLocale).toBe('km');
    expect(resKm.body.localized.name.cells).toHaveLength(3);

    // 3. Chinese source item
    const resZh = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'zhengda',
        category: 'Milk Tea',
        name: '珍珠奶茶',
        description: '传统台湾风味珍珠奶茶',
        basePrice: 2.5,
        localization: {
          name: {
            sourceLocale: 'zh',
            cells: [
              { locale: 'zh', text: '珍珠奶茶' },
              { locale: 'en', text: 'Pearl Milk Tea' },
              { locale: 'km', text: 'តែទឹកដោះគោគុជ' },
            ],
          },
        },
      })
      .expect(201);

    expect(resZh.body.name).toBe('珍珠奶茶');
    expect(resZh.body.localized.name.sourceLocale).toBe('zh');
    expect(resZh.body.localized.name.cells).toHaveLength(3);

    // Public catalog returns all 3 items with their respective localizations
    const publicCatalog = await request(app).get('/api/catalog').expect(200);
    expect(publicCatalog.body).toHaveLength(3);
    const zhItem = publicCatalog.body.find((i: any) => i.id === resZh.body.id);
    expect(zhItem.localized.name.sourceLocale).toBe('zh');
  });

  it('drafts translations via provider and saves them atomically', async () => {
    // Generate drafts
    const draftRes = await request(app)
      .post('/api/translations/draft')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        requestId: 'draft-e2e-1',
        entries: [
          {
            clientKey: 'item-draft-test',
            text: 'Jasmine Green Tea',
            sourceLocale: 'en',
            targetLocales: ['km', 'zh'],
            context: { field: 'name', category: 'Tea' },
          },
        ],
      })
      .expect(200);

    expect(draftRes.body.entries[0].translations.km).toBeDefined();
    expect(draftRes.body.entries[0].translations.zh).toBeDefined();

    // Create item with the drafted translations
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Tea',
        name: 'Jasmine Green Tea',
        basePrice: 2.0,
        localization: {
          name: {
            sourceLocale: 'en',
            cells: [
              { locale: 'en', text: 'Jasmine Green Tea' },
              { locale: 'km', text: draftRes.body.entries[0].translations.km },
              { locale: 'zh', text: draftRes.body.entries[0].translations.zh },
            ],
          },
        },
      })
      .expect(201);

    expect(created.body.localized.name.cells).toHaveLength(3);
  });

  it('allows manual correction and tracks reviewed status', async () => {
    // Create Chinese item
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'zhengda',
        category: 'Milk Tea',
        name: '珍珠奶茶',
        basePrice: 2.5,
        localization: {
          name: {
            sourceLocale: 'zh',
            cells: [
              { locale: 'zh', text: '珍珠奶茶' },
              { locale: 'en', text: 'Pearl Milk Tea' },
              { locale: 'km', text: 'តែគុជ' },
            ],
          },
        },
      })
      .expect(201);

    const nameId = created.body.localized.name.id;
    const initialRev = created.body.localized.name.revision;

    // Manager corrects Khmer translation in Settings -> Languages
    const patchRes = await request(app)
      .patch('/api/translations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        edits: [
          {
            id: nameId,
            expectedRevision: initialRev,
            cells: [
              { locale: 'zh', text: '珍珠奶茶' },
              { locale: 'en', text: 'Pearl Milk Tea' },
              { locale: 'km', text: 'តែទឹកដោះគោគុជពិសេស', reviewed: true },
            ],
          },
        ],
      })
      .expect(200);

    const updated = patchRes.body.updated[0];
    const kmCell = updated.cells.find((c: any) => c.locale === 'km');
    expect(kmCell.text).toBe('តែទឹកដោះគោគុជពិសេស');
    expect(kmCell.reviewed).toBe(true);

    // Verify public catalog immediately returns the correction
    const cat = await request(app).get('/api/catalog').expect(200);
    const itemInCat = cat.body.find((i: any) => i.id === created.body.id);
    const catKmCell = itemInCat.localized.name.cells.find((c: any) => c.locale === 'km');
    expect(catKmCell.text).toBe('តែទឹកដោះគោគុជពិសេស');
  });

  it('increments sourceRevision on source text change marking target cells stale', async () => {
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'zhengda',
        category: 'Milk Tea',
        name: '珍珠奶茶',
        basePrice: 2.5,
        localization: {
          name: {
            sourceLocale: 'zh',
            cells: [
              { locale: 'zh', text: '珍珠奶茶' },
              { locale: 'en', text: 'Pearl Milk Tea', reviewed: true },
              { locale: 'km', text: 'តែគុជ', reviewed: true },
            ],
          },
        },
      })
      .expect(201);

    const nameId = created.body.localized.name.id;
    expect(created.body.localized.name.sourceRevision).toBe(1);

    // Update Chinese source text: "波霸奶茶"
    const patchRes = await request(app)
      .patch('/api/translations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        edits: [
          {
            id: nameId,
            expectedRevision: created.body.localized.name.revision,
            sourceLocale: 'zh',
            cells: [
              { locale: 'zh', text: '波霸奶茶' }, // only source is edited
            ],
          },
        ],
      })
      .expect(200);

    const updated = patchRes.body.updated[0];
    expect(updated.sourceText).toBe('波霸奶茶');
    expect(updated.sourceRevision).toBe(2); // sourceRevision incremented!

    const enCell = updated.cells.find((c: any) => c.locale === 'en');
    expect(enCell.basedOnSourceRevision).toBe(1);
    // enCell basedOnSourceRevision (1) < updated.sourceRevision (2) => stale!
  });

  it('supports original-only save when AI is disabled and can draft later', async () => {
    // Disable AI provider
    translationService.setProvider(null, false);

    // Owner creates item with original text only
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Lemonade',
        name: 'Fresh Lemonade',
        basePrice: 1.8,
        localization: {
          name: {
            sourceLocale: 'en',
            cells: [{ locale: 'en', text: 'Fresh Lemonade' }],
          },
        },
      })
      .expect(201);

    expect(created.body.name).toBe('Fresh Lemonade');
    expect(created.body.localized.name.cells).toHaveLength(1);

    // Re-enable provider and draft translations later
    translationService.setProvider(deterministicProvider, true);

    const draftRes = await request(app)
      .post('/api/translations/draft')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        requestId: 'retry-draft-1',
        entries: [
          {
            clientKey: 'lemonade-key',
            text: 'Fresh Lemonade',
            sourceLocale: 'en',
            targetLocales: ['km', 'zh'],
            context: { field: 'name', category: 'Lemonade' },
          },
        ],
      })
      .expect(200);

    // Save drafted translations via PATCH
    const patchRes = await request(app)
      .patch('/api/translations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        edits: [
          {
            id: created.body.localized.name.id,
            expectedRevision: created.body.localized.name.revision,
            cells: [
              { locale: 'en', text: 'Fresh Lemonade' },
              { locale: 'km', text: draftRes.body.entries[0].translations.km },
              { locale: 'zh', text: draftRes.body.entries[0].translations.zh },
            ],
          },
        ],
      })
      .expect(200);

    expect(patchRes.body.updated[0].cells).toHaveLength(3);
  });

  it('cleans up localized rows on item deletion', async () => {
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Special',
        name: 'Temporary Special',
        basePrice: 4.0,
        localization: {
          name: {
            sourceLocale: 'en',
            cells: [
              { locale: 'en', text: 'Temporary Special' },
              { locale: 'km', text: 'ពិសេសបណ្តោះអាសន្ន' },
            ],
          },
        },
      })
      .expect(201);

    const itemId = created.body.id;

    // Verify localized rows exist in database
    const locBefore = await prisma.localizedText.findMany({
      where: { ownerKey: itemId },
    });
    expect(locBefore.length).toBeGreaterThan(0);

    // Delete item
    await request(app)
      .delete(`/api/catalog/${itemId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    // Verify localized rows were completely cleaned up
    const locAfter = await prisma.localizedText.findMany({
      where: { ownerKey: itemId },
    });
    expect(locAfter).toHaveLength(0);
  });

  it('handles two-manager conflict with 409 and preserves edits', async () => {
    const created = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Tea',
        name: 'Oolong Tea',
        basePrice: 2.0,
        localization: {
          name: {
            sourceLocale: 'en',
            cells: [
              { locale: 'en', text: 'Oolong Tea' },
              { locale: 'zh', text: '乌龙茶' },
            ],
          },
        },
      })
      .expect(201);

    const textId = created.body.localized.name.id;
    const rev = created.body.localized.name.revision;

    // Manager A saves update with expectedRevision: rev
    await request(app)
      .patch('/api/translations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        edits: [
          {
            id: textId,
            expectedRevision: rev,
            cells: [
              { locale: 'en', text: 'Oolong Tea' },
              { locale: 'zh', text: '高山乌龙茶' },
            ],
          },
        ],
      })
      .expect(200);

    // Manager B tries to save with the stale revision: rev
    const conflictRes = await request(app)
      .patch('/api/translations')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        edits: [
          {
            id: textId,
            expectedRevision: rev, // Stale! Revision is now rev + 1
            cells: [
              { locale: 'en', text: 'Oolong Tea' },
              { locale: 'zh', text: '冻顶乌龙茶' },
            ],
          },
        ],
      })
      .expect(409);

    expect(conflictRes.body.error).toContain('Stale revision conflict');
    expect(conflictRes.body.code).toBe('TRANSLATION_CONFLICT');
    expect(conflictRes.body.expectedRevision).toBe(rev);
    expect(conflictRes.body.currentRevision).toBe(rev + 1);
    expect(conflictRes.body.currentRecord.id).toBe(textId);
  });
});
