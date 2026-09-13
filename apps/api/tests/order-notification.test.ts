import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-notify';

describe('Order Notifications (Completed & Cancelled)', () => {
  let staffToken: string;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    staffToken = issueToken('staff').token;
  });

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    vi.unstubAllGlobals();
  });

  it('sends a bot notification to the customer when order is completed', async () => {
    const customerTgId = `tg-${randomUUID()}`;
    await prisma.user.create({
      data: { telegramUserId: customerTgId, firstName: 'Alice' },
    });

    const item = await prisma.menuItem.create({
      data: {
        id: `item-${randomUUID()}`,
        brand: 'ai-cha',
        category: 'Drinks',
        name: 'Milk Tea',
        basePrice: 2.5,
      },
    });

    const order = await prisma.order.create({
      data: {
        totalAmount: 2.5,
        paymentMethod: 'cash',
        status: 'ready',
        pickupCode: '101',
        user: { connect: { telegramUserId: customerTgId } },
        items: {
          create: [
            {
              menuItemId: item.id,
              quantity: 1,
              price: 2.5,
              modifiers: '{}',
            },
          ],
        },
      },
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');

    // Verify notification was sent
    const telegramCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('/sendMessage')
    );
    expect(telegramCalls.length).toBe(1);

    const body = JSON.parse(telegramCalls[0][1].body);
    expect(body.chat_id).toBe(customerTgId);
    expect(body.text).toContain('Order Completed');
    expect(body.text).toContain('#101');
  });

  it('does not resend notification if order is already completed', async () => {
    const customerTgId = `tg-${randomUUID()}`;
    await prisma.user.create({
      data: { telegramUserId: customerTgId, firstName: 'Bob' },
    });

    const order = await prisma.order.create({
      data: {
        totalAmount: 3.0,
        paymentMethod: 'cash',
        status: 'completed',
        pickupCode: '102',
        user: { connect: { telegramUserId: customerTgId } },
      },
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);

    const telegramCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('/sendMessage')
    );
    expect(telegramCalls.length).toBe(0);
  });

  it('sends a bot notification to the customer when order is cancelled', async () => {
    const customerTgId = `tg-${randomUUID()}`;
    await prisma.user.create({
      data: { telegramUserId: customerTgId, firstName: 'Charlie' },
    });

    const order = await prisma.order.create({
      data: {
        totalAmount: 4.0,
        paymentMethod: 'cash',
        status: 'pending',
        pickupCode: '103',
        user: { connect: { telegramUserId: customerTgId } },
      },
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'cancelled', cancelReason: 'Out of stock' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const telegramCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('/sendMessage')
    );
    expect(telegramCalls.length).toBe(1);

    const body = JSON.parse(telegramCalls[0][1].body);
    expect(body.chat_id).toBe(customerTgId);
    expect(body.text).toContain('Order Cancelled');
    expect(body.text).toContain('#103');
    expect(body.text).toContain('Out of stock');
  });

  it('handles orders without telegramUserId gracefully without sending messages', async () => {
    const order = await prisma.order.create({
      data: {
        totalAmount: 5.0,
        paymentMethod: 'cash',
        status: 'pending',
        pickupCode: '104',
      },
    });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');

    const telegramCalls = fetchSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string' && call[0].includes('/sendMessage')
    );
    expect(telegramCalls.length).toBe(0);
  });
});
