import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp, prisma } from '../src/app';
import { enableAba, postWebhook, stubAbaFetch, approvedStatus } from './helpers/aba';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-e2e';
const MANAGER_PIN = '9999';
const STAFF_PIN = '1234';

function generateTelegramLogin(fields: Record<string, string>, botToken: string) {
  const checkString = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

describe('End-to-End System & Workflow Validation', () => {
  let customerTelegramId: string;
  let drinkItemId: string;
  let snackItemId: string;
  let drinkOptionId: string;
  let staffToken: string;
  let managerToken: string;
  let customerToken: string;
  const branchId = 'branch-toul-kork';
  // Staff endpoints need a login token; helper keeps the calls below readable.
  const staffAuth = () => ({ Authorization: `Bearer ${staffToken}` });
  const managerAuth = () => ({ Authorization: `Bearer ${managerToken}` });
  // Customer endpoints need the token the Telegram login callback handed back.
  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    process.env.MANAGER_PIN = MANAGER_PIN;
    process.env.STAFF_PIN = STAFF_PIN;
    delete process.env.ABA_WEBHOOK_SECRET; // skip signature check for mock ABA test

    // Reset database config
    await prisma.systemConfig.deleteMany({});
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.reward.deleteMany({});
    await prisma.modifierOption.deleteMany({});
    await prisma.modifierGroup.deleteMany({});
    await prisma.menuItem.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.user.deleteMany({});

    // Seed Branch
    await prisma.branch.create({
      data: {
        id: branchId,
        name: 'Toul Kork Branch',
        address: 'Street 315, Toul Kork',
        isActive: true,
      }
    });

    // Seed Drink Item with size modifiers
    const drink = await prisma.menuItem.create({
      data: {
        id: 'drink-jasmine-tea',
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Jasmine Milk Tea',
        basePrice: 2.50,
        isSoldOut: false,
        modifiers: {
          create: [{
            key: 'size',
            name: 'Size',
            type: 'single',
            required: true,
            options: {
              create: [
                { key: 'regular_500', name: 'Regular (500ml)', priceDelta: 0 },
                { key: 'large_700', name: 'Large (700ml)', priceDelta: 0.25 }
              ]
            }
          }]
        }
      },
      include: { modifiers: { include: { options: true } } }
    });
    drinkItemId = drink.id;
    drinkOptionId = drink.modifiers[0].options.find(o => o.name.includes('Large'))!.id;

    // Seed Snack Item
    const snack = await prisma.menuItem.create({
      data: {
        id: 'snack-fried-chicken',
        brand: 'zhengda',
        category: 'Fried Chicken',
        name: 'Crispy Chicken Cutlet',
        basePrice: 3.00,
        isSoldOut: false,
      }
    });
    snackItemId = snack.id;

    const staffLogin = await request(app).post('/api/auth/staff-login').send({ pin: STAFF_PIN, role: 'staff' });
    staffToken = staffLogin.body.token;
    const managerLogin = await request(app).post('/api/auth/staff-login').send({ pin: MANAGER_PIN, role: 'manager' });
    managerToken = managerLogin.body.token;
  });

  it('1. Customer browses full multi-brand catalog and branches', async () => {
    // Check Catalog
    const catalogRes = await request(app).get('/api/catalog');
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.body)).toBe(true);
    expect(catalogRes.body.length).toBeGreaterThanOrEqual(2);

    const aichaItems = catalogRes.body.filter((i: any) => i.brand === 'ai-cha');
    const zhengdaItems = catalogRes.body.filter((i: any) => i.brand === 'zhengda');
    expect(aichaItems.length).toBeGreaterThanOrEqual(1);
    expect(zhengdaItems.length).toBeGreaterThanOrEqual(1);

    // Check Branches
    const branchRes = await request(app).get('/api/branches');
    expect(branchRes.status).toBe(200);
    expect(branchRes.body.some((b: any) => b.id === branchId)).toBe(true);
  });

  it('2. Customer authenticates via Telegram Login Widget', async () => {
    customerTelegramId = `tg-${Date.now()}`;
    const payload = generateTelegramLogin({
      id: customerTelegramId,
      first_name: 'Sila',
      last_name: 'Khmer',
      username: 'siladev',
      auth_date: String(Math.floor(Date.now() / 1000)),
    }, BOT_TOKEN);

    const callbackRes = await request(app).get('/api/auth/telegram/callback').query(payload);
    expect(callbackRes.status).toBe(302);
    // The callback returns a session token, not the raw telegram id.
    const tokenMatch = /#tg_token=([^&]+)/.exec(callbackRes.headers.location);
    expect(tokenMatch).toBeTruthy();
    customerToken = decodeURIComponent(tokenMatch![1]);

    // Verify user profile exists in database
    const userRes = await request(app).get(`/api/user/${customerTelegramId}`).set(customerAuth());
    expect(userRes.status).toBe(200);
    expect(userRes.body.telegramUserId).toBe(customerTelegramId);
    expect(userRes.body.firstName).toBe('Sila');
    expect(userRes.body.loyaltyPoints).toBe(0);
  });

  it('3. Customer places a pickup order with loyalty points redemption', async () => {
    // Give user 300 points for test
    await prisma.user.update({
      where: { telegramUserId: customerTelegramId },
      data: { loyaltyPoints: 300 },
    });

    // Subtotal: Jasmine Milk Tea ($2.50 + $0.25 Large) + Crispy Chicken ($3.00) = $5.75
    // Redeem 100 points (default 100 pts = $1 discount)
    // Server Total: $5.75 - $1.00 = $4.75
    // Earn points: floor(4.75 * 10) = 47 points
    const createOrderRes = await request(app).post('/api/orders').set(customerAuth()).send({
      items: [
        {
          menuItemId: drinkItemId,
          quantity: 1,
          totalPrice: 2.75,
          selectedModifiers: { Size: [{ id: drinkOptionId, name: 'Large', priceDelta: 0.25 }] },
        },
        {
          menuItemId: snackItemId,
          quantity: 1,
          totalPrice: 3.00,
          selectedModifiers: {},
        }
      ],
      paymentMethod: 'cash',
      orderType: 'pickup',
      branchId,
      pointsToUse: 100,
    });

    expect(createOrderRes.status).toBe(200);
    const order = createOrderRes.body;
    expect(order.totalAmount).toBe(4.75);
    expect(order.discountApplied).toBe(1.00);
    expect(order.pointsRedeemed).toBe(100);
    expect(order.pointsEarned).toBe(47);
    expect(order.status).toBe('pending');
    expect(order.pickupCode).toMatch(/^A-\d{3}$/);
    expect(order.pointsSettled).toBe(false);

    // Redeemed points are reserved (deducted) at order creation so they cannot be
    // spent again by a second pending order.
    const userPending = await prisma.user.findUnique({ where: { telegramUserId: customerTelegramId } });
    expect(userPending?.loyaltyPoints).toBe(200);

    // Check order shows in customer history
    const historyRes = await request(app).get(`/api/orders/user/${customerTelegramId}`).set(customerAuth());
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.some((o: any) => o.id === order.id)).toBe(true);

    // Staff completes order -> points settle
    const statusRes = await request(app).put(`/api/orders/${order.id}/status`).set(staffAuth()).send({ status: 'completed' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('completed');

    const completedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(completedOrder?.pointsSettled).toBe(true);

    // Points settled: 300 - 100 reserved + 47 earned = 247 points
    const userSettled = await prisma.user.findUnique({ where: { telegramUserId: customerTelegramId } });
    expect(userSettled?.loyaltyPoints).toBe(247);
  });

  it('4. Customer places a delivery order with ABA KHQR payment and webhook confirmation', async () => {
    // Single item $3.00 + $0.00 delivery fee (free inside Arakawa) = $3.00
    const createRes = await request(app).post('/api/orders').set(customerAuth()).send({
      items: [{ menuItemId: snackItemId, quantity: 1, totalPrice: 3.00, selectedModifiers: {} }],
      paymentMethod: 'khqr',
      orderType: 'delivery',
      building: 'G',
      roomNumber: '1110',
      contactName: 'Sok Dara',
      contactPhone: '+85512345678',
      pointsToUse: 0,
    });
    expect(createRes.status).toBe(200);
    const order = createRes.body;
    expect(order.totalAmount).toBe(3.00); // 3 + 0 delivery fee
    expect(order.orderType).toBe('delivery');
    expect(order.deliveryAddress).toContain('G1110');

    // ABA create payment
    const tranId = `aba-tx-${Date.now()}`;
    await prisma.order.update({ where: { id: order.id }, data: { transactionId: tranId } });

    const beforePoints = (await prisma.user.findUnique({ where: { telegramUserId: customerTelegramId } }))!.loyaltyPoints;

    // ABA webhook fires. It must be signed, and the server confirms the amount
    // with ABA before it will mark anything paid.
    enableAba();
    stubAbaFetch({ status: approvedStatus(order.totalAmount) });
    const webhookRes = await postWebhook(app, { tran_id: tranId, status: 'APPROVED' });
    expect(webhookRes.status).toBe(200);
    vi.restoreAllMocks();

    const paidOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(paidOrder?.status).toBe('paid');
    expect(paidOrder?.pointsSettled).toBe(true);

    // Earned 30 points on the $3.00 order
    const afterPoints = (await prisma.user.findUnique({ where: { telegramUserId: customerTelegramId } }))!.loyaltyPoints;
    expect(afterPoints).toBe(beforePoints + 30);
  });

  it('5. Staff toggles item sold-out status', async () => {
    // Set to sold out
    const soldOutRes = await request(app).put(`/api/catalog/${drinkItemId}/sold-out`).set(staffAuth()).send({ isSoldOut: true });
    expect(soldOutRes.status).toBe(200);
    expect(soldOutRes.body.isSoldOut).toBe(true);

    // Verify customer catalog reflects it
    const catalogRes1 = await request(app).get('/api/catalog');
    const item1 = catalogRes1.body.find((i: any) => i.id === drinkItemId);
    expect(item1.isSoldOut).toBe(true);

    // Restore to available
    const restoreRes = await request(app).put(`/api/catalog/${drinkItemId}/sold-out`).set(staffAuth()).send({ isSoldOut: false });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.isSoldOut).toBe(false);

    const catalogRes2 = await request(app).get('/api/catalog');
    const item2 = catalogRes2.body.find((i: any) => i.id === drinkItemId);
    expect(item2.isSoldOut).toBe(false);
  });

  it('6. Manager Mode: Config rates, analytics, points adjustment, and rewards management', async () => {
    // 1. Manager auth verification
    const loginRes = await request(app).post('/api/auth/staff-login').send({ pin: MANAGER_PIN, role: 'manager' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.ok).toBe(true);

    // 2. Manager updates loyalty rates
    const updateRateRes = await request(app).put('/api/config')
      .set(managerAuth())
      .send({ key: 'pointsPerDollar', value: '50' });
    expect(updateRateRes.status).toBe(200);

    const configRes = await request(app).get('/api/config');
    expect(configRes.status).toBe(200);
    expect(configRes.body.some((c: any) => c.key === 'pointsPerDollar' && c.value === '50')).toBe(true);

    // 3. Manager views sales analytics
    const salesRes = await request(app).get('/api/analytics/sales').set(managerAuth());
    expect(salesRes.status).toBe(200);
    expect(salesRes.body.orderCount).toBeGreaterThanOrEqual(1);
    expect(salesRes.body.totalRevenue).toBeGreaterThan(0);

    // 4. Manager manually adjusts user points
    const adjustRes = await request(app).put(`/api/users/${customerTelegramId}/points`)
      .set(managerAuth())
      .send({ points: 500 });
    expect(adjustRes.status).toBe(200);
    expect(adjustRes.body.loyaltyPoints).toBe(500);

    // 5. Manager creates and manages rewards catalog
    const createRewardRes = await request(app).post('/api/rewards')
      .set(managerAuth())
      .send({ name: 'Free Jasmine Milk Tea', pointsCost: 350, description: '1 Regular Cup' });
    expect(createRewardRes.status).toBe(200);
    const rewardId = createRewardRes.body.id;

    // Customer sees reward
    const publicRewards1 = await request(app).get('/api/rewards');
    expect(publicRewards1.body.some((r: any) => r.id === rewardId)).toBe(true);

    // Manager deactivates reward
    await request(app).put(`/api/rewards/${rewardId}`)
      .set(managerAuth())
      .send({ isActive: false });

    // Customer no longer sees inactive reward
    const publicRewards2 = await request(app).get('/api/rewards');
    expect(publicRewards2.body.some((r: any) => r.id === rewardId)).toBe(false);

    // Manager still sees inactive reward with ?includeInactive=1
    const managerRewards = await request(app).get('/api/rewards?includeInactive=1');
    const deactivated = managerRewards.body.find((r: any) => r.id === rewardId);
    expect(deactivated).toBeDefined();
    expect(deactivated.isActive).toBe(false);
  });

  it('7. End-to-End Stamp Reward Claim & Item Stamp Exclusion Workflow', async () => {
    // 1. Manager configures Jasmine Tea to be claimable (canClaim = true) and earn stamps (earnsStamp = true)
    await request(app)
      .put(`/api/catalog/${drinkItemId}`)
      .set(managerAuth())
      .send({ earnsStamp: true, canClaim: true })
      .expect(200);

    // 2. Manager configures Snack to NOT earn stamps (earnsStamp = false) and NOT claimable (canClaim = false)
    await request(app)
      .put(`/api/catalog/${snackItemId}`)
      .set(managerAuth())
      .send({ earnsStamp: false, canClaim: false })
      .expect(200);

    // 3. Reset rate config to standard 100 pts per dollar
    await prisma.systemConfig.deleteMany({
      where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
    });

    // 4. Give customer exactly 100 points (10 stamps)
    await prisma.user.update({
      where: { telegramUserId: customerTelegramId },
      data: { loyaltyPoints: 100 },
    });

    // 5. Customer places order: 1 Jasmine Tea ($2.50, claimable) + 1 Snack ($3.00, no stamps)
    // Using claimReward: true to redeem 10 stamps for the Jasmine Tea
    const claimOrderRes = await request(app).post('/api/orders').set(customerAuth()).send({
      items: [
        {
          menuItemId: drinkItemId,
          quantity: 1,
          totalPrice: 2.50,
          selectedModifiers: {},
        },
        {
          menuItemId: snackItemId,
          quantity: 1,
          totalPrice: 3.00,
          selectedModifiers: {},
        }
      ],
      paymentMethod: 'cash',
      orderType: 'pickup',
      branchId,
      claimReward: true,
    });

    expect(claimOrderRes.status).toBe(200);
    const order = claimOrderRes.body;
    expect(order.discountApplied).toBe(2.50); // $2.50 free drink
    expect(order.totalAmount).toBe(3.00);     // Only pay for snack
    expect(order.pointsRedeemed).toBe(100);   // 10 stamps redeemed
    // Snack has earnsStamp = false, so 0 stamps/points earned on snack
    expect(order.pointsEarned).toBe(0);

    // Verify 10 stamps deducted from user account immediately
    const userAfterOrder = await prisma.user.findUnique({ where: { telegramUserId: customerTelegramId } });
    expect(userAfterOrder?.loyaltyPoints).toBe(0);

    // 6. Staff completes the order
    const statusRes = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set(staffAuth())
      .send({ status: 'completed' });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('completed');

    // 7. Verify order points settled
    const completedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(completedOrder?.pointsSettled).toBe(true);
  });
});
