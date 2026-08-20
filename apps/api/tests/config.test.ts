import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { asCustomer } from './helpers/customer';

const app = createApp();
const uid = `test-${randomUUID()}`;
const itemId = `test-item-${randomUUID()}`;
let managerToken = '';

beforeAll(async () => {
  process.env.MANAGER_PIN = '9999';
  const login = await request(app).post('/api/auth/staff-login').send({ pin: '9999', role: 'manager' });
  managerToken = login.body.token;
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 100 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Cfg Tea', basePrice: 10.0 },
  });
});

describe('PUT /api/config validation', () => {
  const put = (body: object) =>
    request(app).put('/api/config').set('Authorization', `Bearer ${managerToken}`).send(body);

  it('rejects unknown keys', async () => {
    expect((await put({ key: 'hackerKey', value: '1' })).status).toBe(400);
  });
  it('rejects non-positive values', async () => {
    expect((await put({ key: 'pointsPerDollar', value: '0' })).status).toBe(400);
  });
  it('accepts a valid rate', async () => {
    expect((await put({ key: 'pointsPerDollar', value: '50' })).status).toBe(200);
  });
});

describe('order creation uses the configured rate', () => {
  it('applies pointsPerDollar=50 (100 pts = $2 discount)', async () => {
    await request(app).put('/api/config').set('Authorization', `Bearer ${managerToken}`)
      .send({ key: 'pointsPerDollar', value: '50' });
    const res = await request(app).post('/api/orders').set(asCustomer(uid)).send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 10, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup', pointsToUse: 100,
    });
    expect(res.body.discountApplied).toBe(2);   // 100 / 50
    expect(res.body.totalAmount).toBe(8);       // 10 - 2
  });
});
