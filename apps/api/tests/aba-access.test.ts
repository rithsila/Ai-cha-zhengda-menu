import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import { enableAba, disableAba, stubAbaFetch } from './helpers/aba';
import { asCustomer } from './helpers/customer';

/**
 * The two customer-facing ABA routes used to accept anyone holding an order id,
 * so a stranger could start or watch someone else's payment.
 */

const app = createApp();
const owner = `aba-owner-${randomUUID()}`;
const stranger = `aba-stranger-${randomUUID()}`;
const itemId = `aba-acl-item-${randomUUID()}`;
let staffToken = '';

async function makeOrder(as?: string) {
  const req = request(app).post('/api/orders');
  if (as) req.set(asCustomer(as));
  const res = await req.send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod: 'khqr',
    orderType: 'pickup',
  });
  expect(res.status).toBe(200);
  return res.body as { id: string; telegramUserId: string | null };
}

const create = (orderId: string) => request(app).post('/api/payment/aba/create').send({ orderId });
const status = (orderId: string) => request(app).get(`/api/payment/aba/status/${orderId}`);

beforeAll(async () => {
  await prisma.user.create({ data: { telegramUserId: owner, loyaltyPoints: 0 } });
  await prisma.user.create({ data: { telegramUserId: stranger, loyaltyPoints: 0 } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'ACL Tea', basePrice: 4.0 },
  });
  staffToken = issueToken('staff').token;
});

beforeEach(() => { enableAba(); stubAbaFetch(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(() => { disableAba(); });

describe('POST /api/payment/aba/create — who may start a payment', () => {
  it('lets the customer who placed the order start it', async () => {
    const order = await makeOrder(owner);
    const res = await create(order.id).set(asCustomer(owner));
    expect(res.status).toBe(200);
  });

  it('refuses another signed-in customer with 403', async () => {
    const order = await makeOrder(owner);
    const res = await create(order.id).set(asCustomer(stranger));
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    const order = await makeOrder(owner);
    const res = await create(order.id);
    expect(res.status).toBe(401);
  });

  it('lets staff start a payment', async () => {
    const order = await makeOrder(owner);
    const res = await create(order.id).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  // A guest never signed in, so there is no identity to check — and they still
  // have to be able to pay. Same trade-off as GET /api/orders/:id.
  it('leaves a guest order reachable by its id', async () => {
    const order = await makeOrder();
    expect(order.telegramUserId).toBeNull();
    const res = await create(order.id);
    expect(res.status).toBe(200);
  });

  it('does not start a payment for the order it refused', async () => {
    const order = await makeOrder(owner);
    await create(order.id).set(asCustomer(stranger));
    const saved = await prisma.order.findUnique({ where: { id: order.id } });
    expect(saved!.transactionId).toBeNull();
    expect(saved!.paymentExpiresAt).toBeNull();
  });
});

describe('GET /api/payment/aba/status/:orderId — who may watch a payment', () => {
  it('lets the owner poll their own payment', async () => {
    const order = await makeOrder(owner);
    await create(order.id).set(asCustomer(owner));
    const res = await status(order.id).set(asCustomer(owner));
    expect(res.status).toBe(200);
  });

  it('refuses another signed-in customer with 403', async () => {
    const order = await makeOrder(owner);
    await create(order.id).set(asCustomer(owner));
    const res = await status(order.id).set(asCustomer(stranger));
    expect(res.status).toBe(403);
  });

  it('refuses an anonymous caller with 401', async () => {
    const order = await makeOrder(owner);
    await create(order.id).set(asCustomer(owner));
    const res = await status(order.id);
    expect(res.status).toBe(401);
  });

  it('lets staff poll a payment', async () => {
    const order = await makeOrder(owner);
    await create(order.id).set(asCustomer(owner));
    const res = await status(order.id).set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
  });

  it('leaves a guest order reachable by its id', async () => {
    const order = await makeOrder();
    await create(order.id);
    const res = await status(order.id);
    expect(res.status).toBe(200);
  });
});
