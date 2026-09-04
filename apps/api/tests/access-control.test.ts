import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto, { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { clearLoginAttempts, issueToken } from '../src/auth';
import { verifyInitData } from '../src/telegram-initdata';
import { asCustomer, signInitData } from './helpers/customer';

/**
 * Regression tests for the access-control holes found in the audit.
 * Each block names the attack it used to allow.
 */

const app = createApp();

const victim = `victim-${randomUUID()}`;
const attacker = `attacker-${randomUUID()}`;
const itemId = `ac-item-${randomUUID()}`;

let staffToken = '';
let managerToken = '';
let victimOrderId = '';
let guestOrderId = '';

const staffAuth = () => ({ Authorization: `Bearer ${staffToken}` });
const managerAuth = () => ({ Authorization: `Bearer ${managerToken}` });

beforeAll(async () => {
  // Reset rate config so a previous run of config.test.ts can't change this suite's math
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.systemConfig.upsert({
    where: { key: 'allowCashForStandard' },
    update: { value: '1' },
    create: { key: 'allowCashForStandard', value: '1' },
  });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Access Tea', basePrice: 2.0 },
  });
  await prisma.user.create({
    data: {
      telegramUserId: victim,
      loyaltyPoints: 9000,
      phoneNumber: '+85512345678',
      contactName: 'Victim Vy',
      building: 'G',
      roomNumber: '1110',
    },
  });
  await prisma.user.create({ data: { telegramUserId: attacker, loyaltyPoints: 0 } });

  staffToken = issueToken('staff').token;
  managerToken = issueToken('manager').token;

  const victimOrder = await request(app).post('/api/orders').set(asCustomer(victim)).send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod: 'cash', orderType: 'pickup',
  });
  victimOrderId = victimOrder.body.id;

  const guestOrder = await request(app).post('/api/orders').send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod: 'cash', orderType: 'pickup',
  });
  guestOrderId = guestOrder.body.id;
});

describe('GET /api/user/:id — reading someone else\'s profile', () => {
  it('refuses an anonymous caller', async () => {
    const res = await request(app).get(`/api/user/${victim}`);
    expect(res.status).toBe(401);
    expect(res.body.phoneNumber).toBeUndefined();
  });

  it('refuses another signed-in customer', async () => {
    const res = await request(app).get(`/api/user/${victim}`).set(asCustomer(attacker));
    expect(res.status).toBe(403);
    expect(res.body.phoneNumber).toBeUndefined();
  });

  it('lets the owner read their own profile', async () => {
    const res = await request(app).get(`/api/user/${victim}`).set(asCustomer(victim));
    expect(res.status).toBe(200);
    expect(res.body.telegramUserId).toBe(victim);
  });

  it('no longer creates a user row for a stranger id', async () => {
    const strangerId = `stranger-${randomUUID()}`;
    const res = await request(app).get(`/api/user/${strangerId}`);
    expect(res.status).toBe(401);
    const created = await prisma.user.findUnique({ where: { telegramUserId: strangerId } });
    expect(created).toBeNull();
  });
});

// A browser that signed in through the Login Widget only gets a session token, so it
// never learns its own numeric Telegram id and sends "me" instead.
describe('the "me" alias', () => {
  it('resolves to the signed-in caller on profile read', async () => {
    const res = await request(app).get('/api/user/me').set(asCustomer(victim));
    expect(res.status).toBe(200);
    expect(res.body.telegramUserId).toBe(victim);
  });

  it('writes the caller\'s own row on profile save', async () => {
    const res = await request(app).put('/api/user/me/profile')
      .set(asCustomer(attacker))
      .send({ contactName: 'Attacker Own Name' });
    expect(res.status).toBe(200);
    expect(res.body.telegramUserId).toBe(attacker);

    // It must not have touched the victim.
    const row = await prisma.user.findUnique({ where: { telegramUserId: victim } });
    expect(row!.contactName).not.toBe('Attacker Own Name');
  });

  it('returns only the caller\'s own orders', async () => {
    const res = await request(app).get('/api/orders/user/me').set(asCustomer(attacker));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const order of res.body) expect(order.telegramUserId).toBe(attacker);
  });

  it('is still rejected without an identity', async () => {
    expect((await request(app).get('/api/user/me')).status).toBe(401);
    expect((await request(app).get('/api/orders/user/me')).status).toBe(401);
  });
});

describe('PUT /api/user/:id/profile — overwriting someone else\'s address', () => {
  it('refuses another signed-in customer and leaves the row untouched', async () => {
    const res = await request(app).put(`/api/user/${victim}/profile`)
      .set(asCustomer(attacker))
      .send({ building: 'A', roomNumber: '0101', contactName: 'Not Vy', phoneNumber: '+85599999999' });
    expect(res.status).toBe(403);

    const row = await prisma.user.findUnique({ where: { telegramUserId: victim } });
    expect(row!.building).toBe('G');
    expect(row!.roomNumber).toBe('1110');
    expect(row!.phoneNumber).toBe('+85512345678');
  });

  it('refuses an anonymous caller', async () => {
    const res = await request(app).put(`/api/user/${victim}/profile`).send({ building: 'A' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/orders/user/:id — reading someone else\'s order history', () => {
  it('refuses another signed-in customer', async () => {
    const res = await request(app).get(`/api/orders/user/${victim}`).set(asCustomer(attacker));
    expect(res.status).toBe(403);
    expect(Array.isArray(res.body)).toBe(false);
  });

  it('refuses an anonymous caller', async () => {
    expect((await request(app).get(`/api/orders/user/${victim}`)).status).toBe(401);
  });

  it('returns the caller\'s own history', async () => {
    const res = await request(app).get(`/api/orders/user/${victim}`).set(asCustomer(victim));
    expect(res.status).toBe(200);
    expect(res.body.some((o: any) => o.id === victimOrderId)).toBe(true);
  });
});

describe('POST /api/orders — spending another customer\'s points', () => {
  it('ignores telegramUserId in the body when the caller is anonymous', async () => {
    const before = (await prisma.user.findUnique({ where: { telegramUserId: victim } }))!.loyaltyPoints;

    const res = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup',
      telegramUserId: victim, pointsToUse: 5000,
    });

    expect(res.status).toBe(200);              // guest checkout still works
    expect(res.body.pointsRedeemed).toBe(0);
    expect(res.body.discountApplied).toBe(0);
    expect(res.body.telegramUserId).toBeNull();

    const after = (await prisma.user.findUnique({ where: { telegramUserId: victim } }))!.loyaltyPoints;
    expect(after).toBe(before);
  });

  it('ignores telegramUserId in the body when another customer is signed in', async () => {
    const before = (await prisma.user.findUnique({ where: { telegramUserId: victim } }))!.loyaltyPoints;

    const res = await request(app).post('/api/orders').set(asCustomer(attacker)).send({
      items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
      paymentMethod: 'cash', orderType: 'pickup',
      telegramUserId: victim, pointsToUse: 5000,
    });

    expect(res.status).toBe(200);
    expect(res.body.telegramUserId).toBe(attacker);
    expect(res.body.pointsRedeemed).toBe(0);   // the attacker has no points of their own

    const after = (await prisma.user.findUnique({ where: { telegramUserId: victim } }))!.loyaltyPoints;
    expect(after).toBe(before);
  });
});

describe('GET /api/orders/:id — reading an order by id', () => {
  it('refuses another customer', async () => {
    const res = await request(app).get(`/api/orders/${victimOrderId}`).set(asCustomer(attacker));
    expect(res.status).toBe(403);
    expect(res.body.contactPhone).toBeUndefined();
  });

  it('refuses an anonymous caller', async () => {
    expect((await request(app).get(`/api/orders/${victimOrderId}`)).status).toBe(403);
  });

  it('allows the owner', async () => {
    const res = await request(app).get(`/api/orders/${victimOrderId}`).set(asCustomer(victim));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(victimOrderId);
  });

  it('allows staff', async () => {
    const res = await request(app).get(`/api/orders/${victimOrderId}`).set(staffAuth());
    expect(res.status).toBe(200);
  });

  it('keeps a guest order readable by id (guest receipt lookup)', async () => {
    const res = await request(app).get(`/api/orders/${guestOrderId}`);
    expect(res.status).toBe(200);
    expect(res.body.telegramUserId).toBeNull();
  });
});

describe('x-manager-pin header no longer opens anything', () => {
  it('is rejected on manager routes', async () => {
    expect((await request(app).get('/api/analytics/sales').set('x-manager-pin', '9999')).status).toBe(401);
    expect((await request(app).get(`/api/users/${victim}`).set('x-manager-pin', '9999')).status).toBe(401);
    const points = await request(app).put(`/api/users/${victim}/points`)
      .set('x-manager-pin', '9999').send({ points: 999999 });
    expect(points.status).toBe(401);
  });

  it('is rejected on staff routes', async () => {
    expect((await request(app).get('/api/orders').set('x-manager-pin', '9999')).status).toBe(401);
    const status = await request(app).put(`/api/orders/${victimOrderId}/status`)
      .set('x-manager-pin', '9999').send({ status: 'ready' });
    expect(status.status).toBe(401);
  });

  it('did not change the victim\'s points', async () => {
    const row = await prisma.user.findUnique({ where: { telegramUserId: victim } });
    expect(row!.loyaltyPoints).toBe(9000);
  });
});

describe('PUT /api/orders/:id/status — status validation', () => {
  it('rejects a made-up status', async () => {
    const res = await request(app).put(`/api/orders/${victimOrderId}/status`)
      .set(staffAuth()).send({ status: 'PWNED<script>' });
    expect(res.status).toBe(400);

    const row = await prisma.order.findUnique({ where: { id: victimOrderId } });
    expect(row!.status).toBe('pending');
  });

  it('rejects a missing status', async () => {
    const res = await request(app).put(`/api/orders/${victimOrderId}/status`).set(staffAuth()).send({});
    expect(res.status).toBe(400);
  });

  it('accepts each allowed status', async () => {
    for (const status of ['preparing', 'ready', 'completed']) {
      const res = await request(app).put(`/api/orders/${victimOrderId}/status`)
        .set(staffAuth()).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });
});

describe('PUT /api/rewards/:id — mass assignment', () => {
  let rewardId = '';

  beforeAll(async () => {
    const created = await request(app).post('/api/rewards').set(managerAuth())
      .send({ name: 'Free Topping', pointsCost: 300 });
    rewardId = created.body.id;
  });

  it('rejects a negative pointsCost, like the create route does', async () => {
    const res = await request(app).put(`/api/rewards/${rewardId}`).set(managerAuth())
      .send({ pointsCost: -999 });
    expect(res.status).toBe(400);

    const row = await prisma.reward.findUnique({ where: { id: rewardId } });
    expect(row!.pointsCost).toBe(300);
  });

  it('rejects an empty name and a non-boolean isActive', async () => {
    expect((await request(app).put(`/api/rewards/${rewardId}`).set(managerAuth())
      .send({ name: '  ' })).status).toBe(400);
    expect((await request(app).put(`/api/rewards/${rewardId}`).set(managerAuth())
      .send({ isActive: 'yes' })).status).toBe(400);
  });

  it('ignores fields that are not editable', async () => {
    const res = await request(app).put(`/api/rewards/${rewardId}`).set(managerAuth())
      .send({ id: 'hijacked-id', name: 'Free Topping v2' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(rewardId);
    expect(res.body.name).toBe('Free Topping v2');

    expect(await prisma.reward.findUnique({ where: { id: 'hijacked-id' } })).toBeNull();
  });
});

describe('verifyInitData', () => {
  const BOT = 'unit-test-bot-token';

  it('accepts a correctly signed string and returns the user', () => {
    const user = verifyInitData(signInitData('777', BOT), BOT);
    expect(user?.id).toBe('777');
  });

  it('rejects a signature made with a different bot token', () => {
    expect(verifyInitData(signInitData('777', 'other-token'), BOT)).toBeNull();
  });

  it('rejects a tampered user field', () => {
    const initData = signInitData('777', BOT);
    const params = new URLSearchParams(initData);
    params.set('user', JSON.stringify({ id: '888' }));
    expect(verifyInitData(params.toString(), BOT)).toBeNull();
  });

  it('rejects data older than 24 hours', () => {
    const old = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    expect(verifyInitData(signInitData('777', BOT, { authDate: old }), BOT)).toBeNull();
  });

  it('rejects a malformed hash without throwing', () => {
    // timingSafeEqual throws on a length mismatch; a short hash must be a plain
    // "no", not a 500.
    for (const hash of ['', 'abc', 'z'.repeat(64), crypto.randomBytes(20).toString('hex')]) {
      expect(() => verifyInitData(`auth_date=${Math.floor(Date.now() / 1000)}&user=%7B%7D&hash=${hash}`, BOT))
        .not.toThrow();
      expect(verifyInitData(`auth_date=${Math.floor(Date.now() / 1000)}&user=%7B%7D&hash=${hash}`, BOT)).toBeNull();
    }
  });
});

describe('the development X-Telegram-User-Id header', () => {
  const saved = process.env.TELEGRAM_BOT_TOKEN;
  afterAll(() => {
    if (saved === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = saved;
  });

  it('is ignored once a bot token is configured', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'a-real-bot-token';
    const res = await request(app).get(`/api/user/${victim}`).set('X-Telegram-User-Id', victim);
    expect(res.status).toBe(401);
  });

  it('does not accept an initData string signed with the wrong token', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'a-real-bot-token';
    const res = await request(app).get(`/api/user/${victim}`)
      .set('X-Telegram-Init-Data', signInitData(victim, 'attacker-guessed-token'));
    expect(res.status).toBe(401);
  });
});

describe('CORS and security headers', () => {
  it('allows the shop front-ends', async () => {
    const res = await request(app).get('/').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not allow a random site to read the API', async () => {
    const res = await request(app).get('/').set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sends helmet\'s security headers', async () => {
    const res = await request(app).get('/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('Staff login rate limit brute force', () => {
  afterAll(() => { clearLoginAttempts(); });

  it('locks the caller out with 429 after repeated failed attempts', async () => {
    clearLoginAttempts();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/auth/staff/send-otp').send({ phoneNumber: '+85512999000' });
      codes.push(res.status);
    }
    expect(codes.filter((c) => c === 403).length).toBe(5); // 5 tries, then the door shuts
    expect(codes[codes.length - 1]).toBe(429);
  });
});

// A delivery order used to be saved with branchId null while the staff dashboard
// auto-selects the first branch and filters by it, so delivery tickets never
// reached the kitchen at all.
describe('GET /api/orders — no order may be hidden by the branch filter', () => {
  it('includes orders with no branch when filtering by a branch', async () => {
    const branch = await prisma.branch.upsert({
      where: { id: 'branch-filter-test' },
      update: {},
      create: { id: 'branch-filter-test', name: 'Filter Test', address: 'Somewhere' },
    });
    const item = await prisma.menuItem.findFirst({ where: { isSoldOut: false } });

    const mk = (branchId: string | null, code: string) => prisma.order.create({
      data: {
        totalAmount: 1, paymentMethod: 'cash', status: 'pending', pickupCode: code,
        orderType: branchId ? 'pickup' : 'delivery', branchId,
        items: { create: [{ menuItemId: item!.id, quantity: 1, price: 1, modifiers: '{}' }] },
      },
    });
    const withBranch = await mk(branch.id, 'B-001');
    const noBranch = await mk(null, 'B-002');

    const staffSession = issueToken('staff');
    const res = await request(app)
      .get(`/api/orders?branchId=${branch.id}`)
      .set('Authorization', `Bearer ${staffSession.token}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((o: any) => o.id);
    expect(ids).toContain(withBranch.id);
    expect(ids).toContain(noBranch.id);
  });
});
