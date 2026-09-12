import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const itemId = `test-item-${randomUUID()}`;
let optionId = '';

beforeAll(async () => {
  await prisma.systemConfig.upsert({
    where: { key: 'allowCashForStandard' },
    update: { value: '1' },
    create: { key: 'allowCashForStandard', value: '1' },
  });
  await prisma.menuItem.create({
    data: {
      id: itemId, brand: 'ai-cha', category: 'Test', name: 'Priced Tea', basePrice: 3.0,
      modifiers: {
        create: [{
          key: 'size', name: 'Size', type: 'single',
          options: { create: [{ key: 'large', name: 'Large', priceDelta: 0.5 }] },
        }],
      },
    },
    include: { modifiers: { include: { options: true } } },
  });
  const created = await prisma.menuItem.findUnique({
    where: { id: itemId }, include: { modifiers: { include: { options: true } } },
  });
  optionId = created!.modifiers[0].options[0].id;
});

describe('server-side totals', () => {
  it('ignores a tampered client totalAmount', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 2, totalPrice: 0.01,
        selectedModifiers: { Size: [{ id: optionId, name: 'Large', priceDelta: 99 }] } }],
      totalAmount: 0.01,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res.status).toBe(200);
    // (3.0 + 0.5 real delta, NOT the client's fake 99) * 2 = 7.0
    expect(res.body.totalAmount).toBe(7);
  });

  it('applies the configured delivery fee server-side (free inside Arakawa)', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 3.0, selectedModifiers: {} }],
      totalAmount: 3.0,
      paymentMethod: 'cash',
      orderType: 'delivery',
      building: 'G',
      roomNumber: '1110',
      contactName: 'Sok Dara',
      contactPhone: '+85512345678',
    });
    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(3); // 3 + 0 delivery fee
    expect(res.body.deliveryFee).toBe(0);
  });

  it('rejects an empty items array', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [], totalAmount: 0, paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
  });

  it('rejects unknown menu items', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: 'nope', quantity: 1, totalPrice: 1, selectedModifiers: {} }],
      totalAmount: 1, paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
  });

  it('correctly prices multiple choice modifiers with free count', async () => {
    const multiItemId = `multi-item-${randomUUID()}`;
    await prisma.menuItem.create({
      data: {
        id: multiItemId, brand: 'ai-cha', category: 'Test', name: 'Topping Tea', basePrice: 2.0,
        modifiers: {
          create: [{
            key: 'toppings', name: 'Toppings', type: 'multiple', freeCount: 2,
            options: {
              create: [
                { key: 'top1', name: 'Boba', priceDelta: 0.25 },
                { key: 'top2', name: 'Jelly', priceDelta: 0.25 },
                { key: 'top3', name: 'Oats', priceDelta: 0.25 },
              ],
            },
          }],
        },
      },
      include: { modifiers: { include: { options: true } } },
    });

    const itemRecord = await prisma.menuItem.findUnique({
      where: { id: multiItemId },
      include: { modifiers: { include: { options: true } } },
    });
    const opts = itemRecord!.modifiers[0].options;

    // Test 1: Select 2 toppings (within freeCount of 2) -> $2.00 total
    const res2 = await request(app).post('/api/orders').send({
      items: [{
        menuItemId: multiItemId, quantity: 1,
        selectedModifiers: {
          toppings: [{ id: opts[0].id }, { id: opts[1].id }],
        },
      }],
      totalAmount: 2.0,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.totalAmount).toBe(2.0);

    // Test 2: Select 3 toppings (freeCount 2 -> 1 charged at 0.25) -> $2.25 total
    const res3 = await request(app).post('/api/orders').send({
      items: [{
        menuItemId: multiItemId, quantity: 1,
        selectedModifiers: {
          toppings: [{ id: opts[0].id }, { id: opts[1].id }, { id: opts[2].id }],
        },
      }],
      totalAmount: 2.25,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res3.status).toBe(200);
    expect(res3.body.totalAmount).toBe(2.25);
  });
});
