import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { issueToken } from '../src/auth';

describe('Category Management API', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;
  const staffToken = issueToken('staff').token;

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.category.deleteMany();
  });

  it('allows anyone to list categories sorted by sortOrder', async () => {
    await prisma.category.createMany({
      data: [
        { brand: 'ai-cha', name: 'Fruit Tea', sortOrder: 2 },
        { brand: 'ai-cha', name: 'Milk Tea', sortOrder: 1 },
      ],
    });

    const res = await request(app).get('/api/categories?brand=ai-cha').expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].name).toBe('Milk Tea');
    expect(res.body[1].name).toBe('Fruit Tea');
  });

  it('rejects category creation by non-manager', async () => {
    await request(app)
      .post('/api/categories')
      .send({ brand: 'ai-cha', name: 'Snacks' })
      .expect(401);

    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ brand: 'ai-cha', name: 'Snacks' })
      .expect(401);
  });

  it('allows manager to create a category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ brand: 'ai-cha', name: 'Smoothies', sortOrder: 5 })
      .expect(201);

    expect(res.body.name).toBe('Smoothies');
    expect(res.body.sortOrder).toBe(5);
  });

  it('renames category and cascades new name to MenuItem records', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Old Tea', sortOrder: 1 },
    });
    const item = await prisma.menuItem.create({
      data: { brand: 'ai-cha', category: 'Old Tea', name: 'Jasmine', basePrice: 1.5 },
    });

    await request(app)
      .put(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'New Tea' })
      .expect(200);

    const updatedItem = await prisma.menuItem.findUnique({ where: { id: item.id } });
    expect(updatedItem?.category).toBe('New Tea');
  });

  it('reorders categories in batch', async () => {
    const c1 = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Cat 1', sortOrder: 1 },
    });
    const c2 = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Cat 2', sortOrder: 2 },
    });

    await request(app)
      .put('/api/categories/reorder')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        items: [
          { id: c1.id, sortOrder: 10 },
          { id: c2.id, sortOrder: 5 },
        ],
      })
      .expect(200);

    const list = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(list[0].name).toBe('Cat 2');
    expect(list[1].name).toBe('Cat 1');
  });

  it('blocks deletion of a category that still contains menu items', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Desserts', sortOrder: 1 },
    });
    await prisma.menuItem.create({
      data: { brand: 'ai-cha', category: 'Desserts', name: 'Sundae', basePrice: 1.0, isActive: true },
    });

    const res = await request(app)
      .delete(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(400);

    expect(res.body.error).toContain('Cannot delete category');
  });

  it('deletes empty category successfully', async () => {
    const cat = await prisma.category.create({
      data: { brand: 'ai-cha', name: 'Empty Cat', sortOrder: 1 },
    });

    await request(app)
      .delete(`/api/categories/${cat.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const check = await prisma.category.findUnique({ where: { id: cat.id } });
    expect(check).toBeNull();
  });
});
