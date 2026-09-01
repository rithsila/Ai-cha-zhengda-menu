import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import {
  enableAba,
  disableAba,
  stubAbaFetch,
  approvedStatus,
} from './helpers/aba';
import { asCustomer } from './helpers/customer';

const app = createApp();
const uid = `aba-${randomUUID()}`;
let staffToken = '';
const itemId = `aba-item-${randomUUID()}`;
const ITEM_PRICE = 5.0;

/** Create a pending khqr order and hand back the row. */
async function makeOrder() {
  const res = await request(app).post('/api/orders').set(asCustomer(uid)).send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod: 'khqr',
    orderType: 'pickup',
    pointsToUse: 0,
  });
  expect(res.status).toBe(200);
  return res.body as { id: string; totalAmount: number; pickupCode: string };
}

/** Create an order that already has an ABA transaction attached. */
async function makeOrderWithTransaction() {
  const order = await makeOrder();
  const transactionId = `tx-${randomUUID()}`;
  await prisma.order.update({
    where: { id: order.id },
    data: { transactionId, paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  return { ...order, transactionId };
}

beforeAll(async () => {
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 0 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Test Milk Tea', basePrice: ITEM_PRICE },
  });
  staffToken = issueToken('staff').token;
});

beforeEach(() => { enableAba(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { disableAba(); });

// The customer app reads this before drawing the payment step, so KHQR is never
// offered on a device that has not yet had a payment fail.
describe('GET /api/payment/methods', () => {
  it('reports online payment as unavailable when ABA is not configured', async () => {
    disableAba();
    const res = await request(app).get('/api/payment/methods');
    expect(res.status).toBe(200);
    expect(res.body.online).toBe(false);
    expect(res.body.cash).toBe(true);
  });

  it('reports online payment as available once credentials exist', async () => {
    enableAba();
    const res = await request(app).get('/api/payment/methods');
    expect(res.status).toBe(200);
    expect(res.body.online).toBe(true);
  });

  it('is readable without signing in', async () => {
    const res = await request(app).get('/api/payment/methods');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/payment/aba/create', () => {
  it('returns 503 when ABA credentials are not configured', async () => {
    disableAba();
    const order = await makeOrder();
    const res = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('ABA_MERCHANT_ID');
  });

  it('returns 404 for an unknown order', async () => {
    stubAbaFetch();
    const res = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it('returns ABA’s QR image, deeplink, and a persisted transaction id', async () => {
    stubAbaFetch();
    const order = await makeOrder();

    const res = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });
    expect(res.status).toBe(200);
    expect(res.body.abapayDeeplink).toContain('abamobilebank://');
    expect(res.body.qrImage).toMatch(/^data:image\/png;base64,/);
    expect(res.body.transactionId).toBeTruthy();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const saved = await prisma.order.findUnique({ where: { id: order.id } });
    expect(saved!.transactionId).toBe(res.body.transactionId);
    expect(saved!.paymentExpiresAt).toBeTruthy();
  });

  it('asks ABA for a deeplink-capable KHQR payment and encodes order items', async () => {
    const spy = stubAbaFetch();
    const order = await makeOrder();

    await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });

    const purchaseCall = spy.mock.calls.find((c) => String(c[0]).includes('/payments/purchase'));
    expect(purchaseCall).toBeTruthy();
    const body = new URLSearchParams((purchaseCall![1] as any).body);
    expect(body.get('payment_option')).toBe('abapay_khqr_deeplink');
    expect(body.get('return_params')).toBe(order.id);

    const items = JSON.parse(Buffer.from(body.get('items')!, 'base64').toString('utf-8'));
    expect(items).toEqual([{ name: 'Test Milk Tea', quantity: 1, price: ITEM_PRICE }]);
  });

  it('reuses the transaction id instead of orphaning one on retry', async () => {
    stubAbaFetch();
    const order = await makeOrder();

    const first = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });
    const second = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });

    expect(second.body.transactionId).toBe(first.body.transactionId);
  });

  it('refuses to start a payment for an order that is already paid', async () => {
    stubAbaFetch();
    const order = await makeOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status: 'paid' } });

    const res = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });
    expect(res.status).toBe(409);
  });

  it('passes ABA’s own error message through on failure', async () => {
    stubAbaFetch({ purchase: { status: 1, description: 'Wrong Hash' } });
    const order = await makeOrder();

    const res = await request(app).post('/api/payment/aba/create').set(asCustomer(uid)).send({ orderId: order.id });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Wrong Hash');
  });
});

describe('GET /api/payment/aba/status/:orderId', () => {
  it('returns 503 when ABA credentials are not configured', async () => {
    const { id } = await makeOrderWithTransaction();
    disableAba();
    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));
    expect(res.status).toBe(503);
  });

  it('returns 404 for an unknown order', async () => {
    const res = await request(app).get('/api/payment/aba/status/does-not-exist').set(asCustomer(uid));
    expect(res.status).toBe(404);
  });

  it('reports PENDING while the customer has not paid yet', async () => {
    const { id } = await makeOrderWithTransaction();
    stubAbaFetch({ status: { status: 0, payment_status: 'PENDING' } });

    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.orderStatus).toBe('pending');
  });

  // This is the route that makes the flow work in development, where a webhook
  // can never reach localhost.
  it('settles the order once ABA reports the payment approved', async () => {
    const { id, totalAmount, pickupCode } = await makeOrderWithTransaction();
    stubAbaFetch({ status: approvedStatus(totalAmount) });
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.orderStatus).toBe('paid');
    expect(res.body.pickupCode).toBe(pickupCode);
    const order = await prisma.order.findUnique({ where: { id } });
    expect(order!.status).toBe('paid');
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before + order!.pointsEarned);
  });

  it('refuses to settle a short payment', async () => {
    const { id, totalAmount } = await makeOrderWithTransaction();
    stubAbaFetch({ status: approvedStatus(totalAmount - 1) });

    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));

    expect(res.status).toBe(400);
    const order = await prisma.order.findUnique({ where: { id } });
    expect(order!.status).toBe('pending');
  });

  it('reports EXPIRED once the QR validity window has passed', async () => {
    const { id } = await makeOrderWithTransaction();
    await prisma.order.update({
      where: { id },
      data: { paymentExpiresAt: new Date(Date.now() - 60 * 1000) },
    });
    stubAbaFetch();

    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('EXPIRED');
  });

  // A cancelled order has pointsSettled = true from the refund. Treating that
  // flag as "already paid" would report a cancelled order as APPROVED.
  it('does not report a cancelled order as paid', async () => {
    const { id, transactionId } = await makeOrderWithTransaction();
    await request(app)
      .put(`/api/orders/${id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'cancelled' });
    const cancelled = await prisma.order.findUnique({ where: { id } });
    expect(cancelled!.pointsSettled).toBe(true); // the refund marks it settled

    stubAbaFetch({ status: approvedStatus(cancelled!.totalAmount) });
    const res = await request(app).get(`/api/payment/aba/status/${id}`).set(asCustomer(uid));

    expect(res.status).toBe(409);
    const after = await prisma.order.findUnique({ where: { id } });
    expect(after!.status).toBe('cancelled');
  });

  it('returns 409 when no payment has been started for the order', async () => {
    const order = await makeOrder();
    const res = await request(app).get(`/api/payment/aba/status/${order.id}`).set(asCustomer(uid));
    expect(res.status).toBe(409);
  });
});
