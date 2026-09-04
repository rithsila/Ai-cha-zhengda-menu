import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import { enableAba, stubAbaFetch, approvedStatus } from './helpers/aba';
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
  staffToken = issueToken('staff').token;
});

describe('order creation reserves points', () => {
  it('deducts redeemed points as soon as the order is created', async () => {
    const res = await request(app).post('/api/orders').set(asCustomer(uid)).send(orderBody(100));
    expect(res.status).toBe(200);
    expect(res.body.pointsRedeemed).toBe(100);
    expect(res.body.discountApplied).toBe(1);      // 100 pts / 100 per $ = $1
    expect(res.body.totalAmount).toBe(4);          // 5 - 1
    expect(res.body.pointsEarned).toBe(10);        // 1 stamp = 10 pts for 1 item
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

  it('allows claiming multiple free reward items with enough stamps (e.g. 20 stamps = 2 items)', async () => {
    const multiUid = `test-multi-claim-${randomUUID()}`;
    const itemA = `test-item-a-${randomUUID()}`;
    const itemB = `test-item-b-${randomUUID()}`;
    await prisma.user.create({ data: { telegramUserId: multiUid, loyaltyPoints: 250 } }); // 25 stamps
    await prisma.menuItem.createMany({
      data: [
        { id: itemA, brand: 'ai-cha', category: 'Tea', name: 'Free Drink A', basePrice: 2.0, canClaim: true, earnsStamp: true },
        { id: itemB, brand: 'ai-cha', category: 'Tea', name: 'Free Drink B', basePrice: 2.5, canClaim: true, earnsStamp: true },
      ],
    });

    const res = await request(app).post('/api/orders').set(asCustomer(multiUid)).send({
      items: [
        { menuItemId: itemA, quantity: 1, totalPrice: 2.0, selectedModifiers: {} },
        { menuItemId: itemB, quantity: 1, totalPrice: 2.5, selectedModifiers: {} },
      ],
      paymentMethod: 'khqr',
      orderType: 'pickup',
      claimReward: 2,
    });

    expect(res.status).toBe(200);
    expect(res.body.pointsRedeemed).toBe(200); // 20 stamps = 200 points
    expect(res.body.discountApplied).toBe(4.5); // $2.0 + $2.5
    expect(res.body.totalAmount).toBe(0);
    const user = await prisma.user.findUnique({ where: { telegramUserId: multiUid } });
    expect(user?.loyaltyPoints).toBe(50); // 250 - 200 = 50 remaining (5 stamps)
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

describe('settlement on ABA status confirmation', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('marks paid and settles points', async () => {
    const created = await request(app).post('/api/orders').set(asCustomer(uid)).send(orderBody(0));
    const tranId = `t-${randomUUID()}`;
    await prisma.order.update({ where: { id: created.body.id }, data: { transactionId: tranId } });
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    // The server asks ABA before settling anything; no browser return or
    // client-supplied status can mark this order paid.
    stubAbaFetch({ status: approvedStatus(created.body.totalAmount) });
    const res = await request(app)
      .get(`/api/payment/aba/status/${created.body.id}`)
      .set(asCustomer(uid));
    expect(res.status).toBe(200);

    const order = await prisma.order.findUnique({ where: { id: created.body.id } });
    expect(order!.status).toBe('paid');
    expect(order!.pointsSettled).toBe(true);
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before + order!.pointsEarned); // earned credited at payment
  });
});
