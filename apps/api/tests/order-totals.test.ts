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
});
