import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();

const itemId = `sec-item-${randomUUID()}`;
const soldOutId = `sec-soldout-${randomUUID()}`;
const uid = `sec-user-${randomUUID()}`;

let staffToken = '';
let orderId = '';

const auth = () => ({ Authorization: `Bearer ${staffToken}` });

beforeAll(async () => {
  delete process.env.ABA_WEBHOOK_SECRET;
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });

  await prisma.menuItem.create({
    data: {
      id: itemId, brand: 'ai-cha', category: 'Test', name: 'Secure Tea', basePrice: 2.0,
      modifiers: {
        create: [{
          key: 'toppings', name: 'Toppings', type: 'multiple',
          options: { create: [{ key: 'boba', name: 'Boba Pearl', priceDelta: 0.25 }] },
        }],
      },
    },
  });

  await prisma.menuItem.create({
    data: {
      id: soldOutId, brand: 'ai-cha', category: 'Test', name: 'Gone Tea',
      basePrice: 2.0, isSoldOut: true,
    },
  });

  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 100 } });

  const login = await request(app).post('/api/auth/staff-login').send({ pin: '1234', role: 'staff' });
  staffToken = login.body.token;

  const created = await request(app).post('/api/orders').send({
    items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
    paymentMethod: 'cash', orderType: 'pickup',
  });
  orderId = created.body.id;
});

describe('staff login', () => {
  it('returns a token with an expiry', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '1234', role: 'staff' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects a wrong PIN', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '0000', role: 'staff' });
    expect(res.status).toBe(401);
  });
});

describe('staff endpoints require a session', () => {
  it('blocks reading all orders without a token', async () => {
    expect((await request(app).get('/api/orders')).status).toBe(401);
  });

  it('blocks changing order status without a token', async () => {
    const res = await request(app).put(`/api/orders/${orderId}/status`).send({ status: 'ready' });
    expect(res.status).toBe(401);
  });

  it('blocks toggling sold-out without a token', async () => {
    const res = await request(app).put(`/api/catalog/${itemId}/sold-out`).send({ isSoldOut: true });
    expect(res.status).toBe(401);
  });

  it('rejects a made-up token', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('allows all three with a valid staff token', async () => {
    expect((await request(app).get('/api/orders').set(auth())).status).toBe(200);

    const status = await request(app)
      .put(`/api/orders/${orderId}/status`).set(auth()).send({ status: 'preparing' });
    expect(status.status).toBe(200);

    const soldOut = await request(app)
      .put(`/api/catalog/${itemId}/sold-out`).set(auth()).send({ isSoldOut: false });
    expect(soldOut.status).toBe(200);
  });
});

describe('modifier pricing', () => {
  it('charges the topping the customer picked', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{
        menuItemId: itemId, quantity: 1, totalPrice: 2.25,
        selectedModifiers: { toppings: [{ id: 'boba', name: 'Boba Pearl', priceDelta: 0.25 }] },
      }],
      paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(200);
    expect(res.body.totalAmount).toBe(2.25);
  });

  it('rejects an option that is not on the menu item', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{
        menuItemId: itemId, quantity: 1, totalPrice: 2.25,
        selectedModifiers: { toppings: [{ id: 'no-such-option', name: 'Ghost', priceDelta: 0 }] },
      }],
      paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
  });
});

describe('sold-out items', () => {
  it('cannot be ordered through the API', async () => {
    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: soldOutId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Sold out');
  });
});

describe('loyalty points cannot be spent twice', () => {
  it('gives the second pending order no discount', async () => {
    const body = () => ({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup', telegramUserId: uid, pointsToUse: 100,
    });

    const first = await request(app).post('/api/orders').send(body());
    expect(first.body.pointsRedeemed).toBe(100);
    expect(first.body.discountApplied).toBe(1);

    const second = await request(app).post('/api/orders').send(body());
    expect(second.body.pointsRedeemed).toBe(0);
    expect(second.body.discountApplied).toBe(0);

    const user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user!.loyaltyPoints).toBe(0);
  });

  it('gives reserved points back when an order is cancelled', async () => {
    await prisma.user.update({ where: { telegramUserId: uid }, data: { loyaltyPoints: 100 } });

    const created = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup', telegramUserId: uid, pointsToUse: 100,
    });
    expect(created.body.pointsRedeemed).toBe(100);

    await request(app)
      .put(`/api/orders/${created.body.id}/status`).set(auth()).send({ status: 'cancelled' });

    const user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user!.loyaltyPoints).toBe(100);
  });
});

describe('analytics', () => {
  it('counts completed cash orders, not only paid ones', async () => {
    const before = await request(app).get('/api/analytics/sales').set('x-manager-pin', '9999');

    const created = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup',
    });
    await request(app)
      .put(`/api/orders/${created.body.id}/status`).set(auth()).send({ status: 'completed' });

    const after = await request(app).get('/api/analytics/sales').set('x-manager-pin', '9999');
    expect(after.body.orderCount).toBe(before.body.orderCount + 1);
    expect(after.body.totalRevenue).toBeCloseTo(before.body.totalRevenue + 2.0, 2);
  });
});
