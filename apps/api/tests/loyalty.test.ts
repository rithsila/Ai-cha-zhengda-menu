import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { enableAba, postWebhook, stubAbaFetch, approvedStatus } from './helpers/aba';
import { asCustomer } from './helpers/customer';

const app = createApp();
const uid = `test-${randomUUID()}`;
let staffToken = '';
const itemId = `test-item-${randomUUID()}`;

const orderBody = (pointsToUse: number) => ({
  items: [{ menuItemId: itemId, quantity: 1, totalPrice: 5.0, selectedModifiers: {} }],
  totalAmount: 5.0,
  paymentMethod: 'khqr',
  orderType: 'pickup',
  pointsToUse,
});

beforeAll(async () => {
  enableAba(); // ABA routes refuse to run without credentials
  // Reset rate config so a previous run of config.test.ts can't change this suite's math
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 200 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Test Tea', basePrice: 5.0 },
  });
  const login = await request(app).post('/api/auth/staff-login').send({ pin: '1234', role: 'staff' });
  staffToken = login.body.token;
});

describe('order creation reserves points', () => {
  it('deducts redeemed points as soon as the order is created', async () => {
    const res = await request(app).post('/api/orders').set(asCustomer(uid)).send(orderBody(100));
    expect(res.status).toBe(200);
    expect(res.body.pointsRedeemed).toBe(100);
    expect(res.body.discountApplied).toBe(1);      // 100 pts / 100 per $ = $1
    expect(res.body.totalAmount).toBe(4);          // 5 - 1
    expect(res.body.pointsEarned).toBe(40);        // floor(4 * 10)
    const user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user?.loyaltyPoints).toBe(100);         // 200 - 100 reserved
  });

  it('allows claiming a free reward item with 10 stamps (100 points)', async () => {
    const claimUid = `test-claim-${randomUUID()}`;
    const claimItemId = `test-claim-item-${randomUUID()}`;
    await prisma.user.create({ data: { telegramUserId: claimUid, loyaltyPoints: 100 } });
    await prisma.menuItem.create({
      data: { id: claimItemId, brand: 'ai-cha', category: 'Tea', name: 'Free Drink', basePrice: 2.0, canClaim: true, earnsStamp: true },
    });

    const res = await request(app).post('/api/orders').set(asCustomer(claimUid)).send({
      items: [{ menuItemId: claimItemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      paymentMethod: 'khqr',
      orderType: 'pickup',
      claimReward: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.pointsRedeemed).toBe(100); // 10 stamps = 100 points
    expect(res.body.discountApplied).toBe(2);  // $2 free item
    expect(res.body.totalAmount).toBe(0);
    const user = await prisma.user.findUnique({ where: { telegramUserId: claimUid } });
    expect(user?.loyaltyPoints).toBe(0);
  });
});

describe('settlement on completion (cash path)', () => {
  it('settles exactly once', async () => {
    const created = await request(app).post('/api/orders').set(asCustomer(uid)).send(orderBody(100));
    const id = created.body.id;

    await request(app).put(`/api/orders/${id}/status`).set('Authorization', `Bearer ${staffToken}`).send({ status: 'completed' });
    let user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    const afterFirst = user!.loyaltyPoints;        // earned points credited once

    await request(app).put(`/api/orders/${id}/status`).set('Authorization', `Bearer ${staffToken}`).send({ status: 'completed' });
    user = await prisma.user.findUnique({ where: { telegramUserId: uid } });
    expect(user!.loyaltyPoints).toBe(afterFirst);  // idempotent
    const order = await prisma.order.findUnique({ where: { id } });
    expect(order!.pointsSettled).toBe(true);
  });
});

describe('settlement on webhook (ABA path)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('marks paid and settles points', async () => {
    const created = await request(app).post('/api/orders').set(asCustomer(uid)).send(orderBody(0));
    const tranId = `t-${randomUUID()}`;
    await prisma.order.update({ where: { id: created.body.id }, data: { transactionId: tranId } });
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    // The webhook now needs a real signature, and the server double-checks the
    // payment with ABA before settling anything.
    stubAbaFetch({ status: approvedStatus(created.body.totalAmount) });
    const res = await postWebhook(app, { tran_id: tranId, status: 'APPROVED' });
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: created.body.id } });
    expect(order!.status).toBe('paid');
    expect(order!.pointsSettled).toBe(true);
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before + order!.pointsEarned); // earned credited at payment
  });
});
