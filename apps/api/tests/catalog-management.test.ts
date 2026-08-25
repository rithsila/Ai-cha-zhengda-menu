import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { issueToken } from '../src/auth';

describe('Manager Catalog CRUD API', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;
  const staffToken = issueToken('staff').token;

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.menuItem.deleteMany();
  });

  it('rejects unauthenticated and staff requests to create/edit/delete menu items', async () => {
    // Unauthenticated
    await request(app)
      .post('/api/catalog')
      .send({ name: 'Test', brand: 'ai-cha', category: 'Cones', basePrice: 1 })
      .expect(401);

    // Staff role (must be manager)
    await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Test', brand: 'ai-cha', category: 'Cones', basePrice: 1 })
      .expect(401);
  });

  it('allows manager to create a new menu item with modifiers and toppings', async () => {
    const res = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Special Mango Boba',
        description: 'Fresh mango tea with custom boba',
        basePrice: 2.50,
        image: '/images/mango.png',
        modifiers: [
          {
            name: 'Ice Level',
            type: 'single',
            required: true,
            options: [
              { name: 'No Ice', priceDelta: 0 },
              { name: 'Regular Ice', priceDelta: 0 }
            ]
          },
          {
            name: 'Toppings',
            type: 'multiple',
            required: false,
            options: [
              { name: 'Extra Boba', priceDelta: 0.50 },
              { name: 'Cheese Foam', priceDelta: 0.75 }
            ]
          }
        ]
      })
      .expect(201);

    expect(res.body.name).toBe('Special Mango Boba');
    expect(res.body.basePrice).toBe(2.50);
    expect(res.body.earnsStamp).toBe(true);
    expect(res.body.canClaim).toBe(false);
    expect(res.body.modifiers.length).toBe(2);
    expect(res.body.modifiers[1].options.length).toBe(2);
  });

  it('allows manager to toggle earnsStamp and canClaim for reward rules', async () => {
    const res = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Reward Milk Tea',
        basePrice: 1.50,
        earnsStamp: true,
        canClaim: true,
      })
      .expect(201);

    expect(res.body.earnsStamp).toBe(true);
    expect(res.body.canClaim).toBe(true);

    const updateRes = await request(app)
      .put(`/api/catalog/${res.body.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        earnsStamp: false,
        canClaim: false,
      })
      .expect(200);

    expect(updateRes.body.earnsStamp).toBe(false);
    expect(updateRes.body.canClaim).toBe(false);
  });

  it('allows manager to update an existing menu item and its modifiers', async () => {
    const created = await prisma.menuItem.create({
      data: {
        brand: 'zhengda',
        category: 'Signature',
        name: 'Fried Chicken',
        basePrice: 2.00,
        isActive: true,
      }
    });

    const updateRes = await request(app)
      .put(`/api/catalog/${created.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Crispy Fried Chicken XXL',
        basePrice: 2.75,
        modifiers: [
          {
            name: 'Spiciness',
            type: 'single',
            required: true,
            options: [{ name: 'Extra Spicy', priceDelta: 0.20 }]
          }
        ]
      })
      .expect(200);

    expect(updateRes.body.name).toBe('Crispy Fried Chicken XXL');
    expect(updateRes.body.basePrice).toBe(2.75);
    expect(updateRes.body.modifiers.length).toBe(1);
    expect(updateRes.body.modifiers[0].options[0].name).toBe('Extra Spicy');
  });

  it('allows manager to delete a menu item cleanly if not ordered', async () => {
    const created = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Cones',
        name: 'Temporary Item',
        basePrice: 1.00,
        isActive: true,
      }
    });

    await request(app)
      .delete(`/api/catalog/${created.id}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    const check = await prisma.menuItem.findUnique({ where: { id: created.id } });
    expect(check).toBeNull();
  });
});
