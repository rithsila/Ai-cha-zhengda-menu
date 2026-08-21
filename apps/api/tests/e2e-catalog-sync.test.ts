import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { issueToken } from '../src/auth';

describe('End-to-End Catalog Management & Sync Flow', () => {
  const app = createApp();
  const managerToken = issueToken('manager').token;

  beforeEach(async () => {
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.modifierOption.deleteMany();
    await prisma.modifierGroup.deleteMany();
    await prisma.menuItem.deleteMany();
  });

  it('performs full lifecycle: create item -> fetch in customer catalog -> update price/modifiers -> place order -> soft delete', async () => {
    // 1. Manager creates a new item with ice, sugar, and extra toppings
    const createRes = await request(app)
      .post('/api/catalog')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Avocado Coconut Boba',
        description: 'Rich avocado and coconut milk tea',
        basePrice: 2.20,
        image: '/images/avocado.png',
        modifiers: [
          {
            name: 'Ice Level',
            type: 'single',
            required: true,
            options: [
              { name: 'No Ice', priceDelta: 0 },
              { name: 'Normal Ice', priceDelta: 0 }
            ]
          },
          {
            name: 'Toppings',
            type: 'multiple',
            required: false,
            options: [
              { name: 'Chewy Boba', priceDelta: 0.30 },
              { name: 'Pudding', priceDelta: 0.50 }
            ]
          }
        ]
      })
      .expect(201);

    const itemId = createRes.body.id;
    expect(itemId).toBeDefined();

    // 2. Customer menu fetches catalog and sees the new item
    const catalogRes = await request(app)
      .get('/api/catalog')
      .expect(200);

    const foundInCatalog = catalogRes.body.find((i: any) => i.id === itemId);
    expect(foundInCatalog).toBeDefined();
    expect(foundInCatalog.name).toBe('Avocado Coconut Boba');
    expect(foundInCatalog.modifiers.length).toBe(2);

    const toppingGroup = foundInCatalog.modifiers.find((g: any) => g.name === 'Toppings');
    expect(toppingGroup.options.length).toBe(2);
    const bobaOption = toppingGroup.options.find((o: any) => o.name === 'Chewy Boba');

    // 3. Manager updates the price to $2.50
    const updateRes = await request(app)
      .put(`/api/catalog/${itemId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        basePrice: 2.50
      })
      .expect(200);

    expect(updateRes.body.basePrice).toBe(2.50);

    // 4. Customer places an order with this item and the topping
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        paymentMethod: 'cash',
        orderType: 'pickup',
        items: [
          {
            menuItemId: itemId,
            quantity: 2,
            selectedModifiers: {
              [toppingGroup.key]: [{ id: bobaOption.key }]
            }
          }
        ]
      })
      .expect(200);

    // Expected line price: ($2.50 + $0.30) * 2 = $5.60
    expect(orderRes.body.totalAmount).toBe(5.60);

    // 5. Manager deletes the item -> soft-deletes since it has existing orders
    const deleteRes = await request(app)
      .delete(`/api/catalog/${itemId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(deleteRes.body.softDeleted).toBe(true);

    // 6. Customer catalog should no longer return the soft-deleted item
    const finalCatalogRes = await request(app)
      .get('/api/catalog')
      .expect(200);

    const goneFromCustomer = finalCatalogRes.body.find((i: any) => i.id === itemId);
    expect(goneFromCustomer).toBeUndefined();
  });
});
