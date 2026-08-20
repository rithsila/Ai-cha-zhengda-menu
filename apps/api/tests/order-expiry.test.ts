import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { expireUnpaidKhqrOrders, UNSTARTED_KHQR_GRACE_MS } from '../src/expiry';
import { asCustomer } from './helpers/customer';

/**
 * An order row exists before the customer has paid. If a KHQR payment is
 * abandoned the ticket used to sit on the kitchen board as `pending`, looking
 * exactly like a cash order, and staff made drinks nobody paid for.
 */

const app = createApp();
const uid = `expiry-${randomUUID()}`;
const itemId = `expiry-item-${randomUUID()}`;
const ITEM_PRICE = 5.0;
const START_POINTS = 1000;

/** Place an order and hand back its row. */
async function makeOrder(paymentMethod: 'khqr' | 'cash', pointsToUse = 0) {
  const res = await request(app).post('/api/orders').set(asCustomer(uid)).send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod,
    orderType: 'pickup',
    pointsToUse,
  });
  expect(res.status).toBe(200);
  return res.body as { id: string; pointsRedeemed: number };
}

const balance = async () =>
  (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

const statusOf = async (id: string) =>
  (await prisma.order.findUnique({ where: { id } }))!.status;

/** Push an order's payment deadline into the past. */
const expirePayment = (id: string) =>
  prisma.order.update({
    where: { id },
    data: { paymentExpiresAt: new Date(Date.now() - 60_000) },
  });

beforeAll(async () => {
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: START_POINTS } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Expiry Tea', basePrice: ITEM_PRICE },
  });
});

describe('expireUnpaidKhqrOrders', () => {
  it('cancels an unpaid KHQR order once its payment window has passed', async () => {
    const order = await makeOrder('khqr');
    await expirePayment(order.id);

    const cancelled = await expireUnpaidKhqrOrders(prisma);

    expect(cancelled).toContain(order.id);
    expect(await statusOf(order.id)).toBe('cancelled');
  });

  it('gives the reserved points back', async () => {
    const before = await balance();
    const order = await makeOrder('khqr', 100);
    expect(order.pointsRedeemed).toBe(100);
    expect(await balance()).toBe(before - 100); // reserved at checkout

    await expirePayment(order.id);
    await expireUnpaidKhqrOrders(prisma);

    expect(await balance()).toBe(before);
  });

  it('does not refund twice when the sweep runs again', async () => {
    const order = await makeOrder('khqr', 100);
    await expirePayment(order.id);

    await expireUnpaidKhqrOrders(prisma);
    const afterFirst = await balance();

    const secondRun = await expireUnpaidKhqrOrders(prisma);

    expect(secondRun).not.toContain(order.id);
    expect(await balance()).toBe(afterFirst);
    expect(await statusOf(order.id)).toBe('cancelled');
  });

  it('leaves a KHQR order alone while its payment window is still open', async () => {
    const order = await makeOrder('khqr');
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentExpiresAt: new Date(Date.now() + 10 * 60_000) },
    });

    await expireUnpaidKhqrOrders(prisma);

    expect(await statusOf(order.id)).toBe('pending');
  });

  // Cash is paid at the counter, so a pending cash ticket is a real order.
  it('never expires a cash order', async () => {
    const order = await makeOrder('cash');
    await expirePayment(order.id); // even with a stale deadline on the row

    await expireUnpaidKhqrOrders(prisma);

    expect(await statusOf(order.id)).toBe('pending');
  });

  it.each(['paid', 'preparing', 'ready', 'completed', 'cancelled'])(
    'never expires an order that is already %s',
    async (status) => {
      const order = await makeOrder('khqr');
      await prisma.order.update({
        where: { id: order.id },
        data: { status, paymentExpiresAt: new Date(Date.now() - 60_000) },
      });

      await expireUnpaidKhqrOrders(prisma);

      expect(await statusOf(order.id)).toBe(status);
    }
  );

  // paymentExpiresAt is only set once the QR is requested. An order where the
  // customer closed the app first has none, and must not sit there for ever.
  it('expires a KHQR order that never started a payment after the grace window', async () => {
    const order = await makeOrder('khqr');
    const saved = await prisma.order.findUnique({ where: { id: order.id } });
    expect(saved!.paymentExpiresAt).toBeNull();

    await prisma.order.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - UNSTARTED_KHQR_GRACE_MS - 60_000) },
    });

    await expireUnpaidKhqrOrders(prisma);

    expect(await statusOf(order.id)).toBe('cancelled');
  });

  it('keeps a fresh KHQR order that has not started a payment yet', async () => {
    const order = await makeOrder('khqr');

    await expireUnpaidKhqrOrders(prisma);

    expect(await statusOf(order.id)).toBe('pending');
  });

  // The staff dashboard derives "waiting for payment" from the fields it
  // already has, so the order payload must not grow a new one.
  it('does not add a field to the order payload', async () => {
    const order = await makeOrder('khqr');
    const res = await request(app).get(`/api/orders/${order.id}`).set(asCustomer(uid));
    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe('khqr');
    expect(res.body.status).toBe('pending');
    expect('paymentExpiresAt' in res.body).toBe(true);
  });
});
