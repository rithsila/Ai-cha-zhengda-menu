import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import { asCustomer, signInitData } from './helpers/customer';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-crm';

describe('Customer CRM, Trust Tiers, Lucky Draw & Search Backend', () => {
  let managerToken: string;
  let staffToken: string;
  let menuItemId: string;

  const managerAuth = () => ({ Authorization: `Bearer ${managerToken}` });
  const staffAuth = () => ({ Authorization: `Bearer ${staffToken}` });

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    managerToken = issueToken('manager').token;
    staffToken = issueToken('staff').token;

    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'CRM Roasted Milk Tea',
        basePrice: 3.5,
        earnsStamp: true,
      },
    });
    menuItemId = item.id;
  });

  beforeEach(async () => {
    // Reset config to defaults
    await prisma.systemConfig.deleteMany({});
  });

  describe('1. InitData Sync on GET /api/user/:telegramUserId', () => {
    it('syncs and updates username, firstName, lastName when x-telegram-init-data is provided', async () => {
      const tgId = `user-sync-${randomUUID()}`;

      // 1. Initial creation via initData
      const initData1 = signInitData(tgId, BOT_TOKEN, { firstName: 'Alice' });
      // Add username and last_name into signed initData
      const params1 = new URLSearchParams(initData1);
      const userObj1 = JSON.parse(params1.get('user') || '{}');
      userObj1.username = 'alice_tea';
      userObj1.first_name = 'Alice';
      userObj1.last_name = 'Smith';
      params1.set('user', JSON.stringify(userObj1));

      // Re-sign with bot token
      const crypto = await import('crypto');
      params1.delete('hash');
      const dataCheck1 = [...params1.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
      const hash1 = crypto.createHmac('sha256', secretKey).update(dataCheck1).digest('hex');
      params1.set('hash', hash1);
      const signedInitData1 = params1.toString();

      const res1 = await request(app)
        .get(`/api/user/${tgId}`)
        .set({ 'X-Telegram-Init-Data': signedInitData1 });

      expect(res1.status).toBe(200);
      expect(res1.body.telegramUserId).toBe(tgId);
      expect(res1.body.username).toBe('alice_tea');
      expect(res1.body.firstName).toBe('Alice');
      expect(res1.body.lastName).toBe('Smith');
      expect(res1.body.tier).toBe('standard');
      expect(res1.body.luckyTickets).toBe(0);

      // 2. Updated name and username in telegram
      const params2 = new URLSearchParams();
      params2.set('auth_date', String(Math.floor(Date.now() / 1000)));
      params2.set('user', JSON.stringify({
        id: tgId,
        username: 'alice_vip',
        first_name: 'Alicia',
        last_name: 'Wonderland',
      }));
      const dataCheck2 = [...params2.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
      const hash2 = crypto.createHmac('sha256', secretKey).update(dataCheck2).digest('hex');
      params2.set('hash', hash2);
      const signedInitData2 = params2.toString();

      const res2 = await request(app)
        .get(`/api/user/${tgId}`)
        .set({ 'X-Telegram-Init-Data': signedInitData2 });

      expect(res2.status).toBe(200);
      expect(res2.body.username).toBe('alice_vip');
      expect(res2.body.firstName).toBe('Alicia');
      expect(res2.body.lastName).toBe('Wonderland');
    });
  });

  describe('2. Trust Tiers (Standard vs Gold) & Cash Ordering', () => {
    it('blocks cash payment for Standard tier when allowCashForStandard is 0', async () => {
      const standardUser = `std-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: standardUser, tier: 'standard' },
      });

      const res = await request(app)
        .post('/api/orders')
        .set(asCustomer(standardUser))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'cash',
          orderType: 'pickup',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Cash on delivery is reserved for Gold members. Please pay via KHQR.');
    });

    it('allows cash payment for Gold tier users', async () => {
      const goldUser = `gold-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: goldUser, tier: 'gold' },
      });

      const res = await request(app)
        .post('/api/orders')
        .set(asCustomer(goldUser))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'cash',
          orderType: 'pickup',
        });

      expect(res.status).toBe(200);
      expect(res.body.paymentMethod).toBe('cash');
      expect(res.body.telegramUserId).toBe(goldUser);
    });

    it('allows cash payment for Standard tier if allowCashForStandard is set to 1', async () => {
      await prisma.systemConfig.create({
        data: { key: 'allowCashForStandard', value: '1' },
      });

      const standardUser = `std-allowed-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: standardUser, tier: 'standard' },
      });

      const res = await request(app)
        .post('/api/orders')
        .set(asCustomer(standardUser))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'cash',
          orderType: 'pickup',
        });

      expect(res.status).toBe(200);
      expect(res.body.paymentMethod).toBe('cash');
    });

    it('allows KHQR payment for Standard tier regardless of config', async () => {
      const standardUser = `std-khqr-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: standardUser, tier: 'standard' },
      });

      const res = await request(app)
        .post('/api/orders')
        .set(asCustomer(standardUser))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'khqr',
          orderType: 'pickup',
        });

      expect(res.status).toBe(200);
      expect(res.body.paymentMethod).toBe('khqr');
    });
  });

  describe('3. Auto-Promotion to Gold & Lucky Ticket Accrual', () => {
    it('promotes user to Gold tier after goldMinOrdersThreshold (3) paid orders and awards lucky tickets', async () => {
      const customerId = `promo-user-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          tier: 'standard',
          loyaltyPoints: 0,
          luckyTickets: 0,
        },
      });

      // Order 1 (KHQR) -> mark paid/completed
      const order1Res = await request(app)
        .post('/api/orders')
        .set(asCustomer(customerId))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'khqr',
          orderType: 'pickup',
        });
      const order1Id = order1Res.body.id;

      await request(app)
        .put(`/api/orders/${order1Id}/status`)
        .set(staffAuth())
        .send({ status: 'completed' });

      let user = await prisma.user.findUnique({ where: { telegramUserId: customerId } });
      expect(user?.tier).toBe('standard');
      expect(user?.luckyTickets).toBe(1); // Standard order gives 1 ticket

      // Order 2 (KHQR) -> mark paid/completed
      const order2Res = await request(app)
        .post('/api/orders')
        .set(asCustomer(customerId))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'khqr',
          orderType: 'pickup',
        });
      const order2Id = order2Res.body.id;

      await request(app)
        .put(`/api/orders/${order2Id}/status`)
        .set(staffAuth())
        .send({ status: 'completed' });

      user = await prisma.user.findUnique({ where: { telegramUserId: customerId } });
      expect(user?.tier).toBe('standard');
      expect(user?.luckyTickets).toBe(2); // 1 + 1 = 2

      // Order 3 (KHQR) -> 3rd order reaches threshold (3) -> auto-promoted to Gold!
      const order3Res = await request(app)
        .post('/api/orders')
        .set(asCustomer(customerId))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'khqr',
          orderType: 'pickup',
        });
      const order3Id = order3Res.body.id;

      await request(app)
        .put(`/api/orders/${order3Id}/status`)
        .set(staffAuth())
        .send({ status: 'completed' });

      user = await prisma.user.findUnique({ where: { telegramUserId: customerId } });
      expect(user?.tier).toBe('gold');
      expect(user?.luckyTickets).toBe(4); // 2 + 2 (gold order reward) = 4

      // Order 4 (Now Gold member can order with cash!)
      const order4Res = await request(app)
        .post('/api/orders')
        .set(asCustomer(customerId))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'cash',
          orderType: 'pickup',
        });
      expect(order4Res.status).toBe(200);
      const order4Id = order4Res.body.id;

      await request(app)
        .put(`/api/orders/${order4Id}/status`)
        .set(staffAuth())
        .send({ status: 'completed' });

      user = await prisma.user.findUnique({ where: { telegramUserId: customerId } });
      expect(user?.tier).toBe('gold');
      expect(user?.luckyTickets).toBe(6); // 4 + 2 = 6
    });

    it('does not award lucky tickets if luckyDrawEnabled is 0', async () => {
      await prisma.systemConfig.create({
        data: { key: 'luckyDrawEnabled', value: '0' },
      });

      const customerId = `no-draw-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: customerId, tier: 'gold', luckyTickets: 5 },
      });

      const orderRes = await request(app)
        .post('/api/orders')
        .set(asCustomer(customerId))
        .send({
          items: [{ menuItemId, quantity: 1, selectedModifiers: {} }],
          paymentMethod: 'cash',
          orderType: 'pickup',
        });
      const orderId = orderRes.body.id;

      await request(app)
        .put(`/api/orders/${orderId}/status`)
        .set(staffAuth())
        .send({ status: 'completed' });

      const user = await prisma.user.findUnique({ where: { telegramUserId: customerId } });
      expect(user?.luckyTickets).toBe(5); // No change
    });
  });

  describe('4. CRM Customers List & Search & Pagination', () => {
    let customerA: string;
    let customerB: string;
    let customerC: string;
    let phoneA: string;

    beforeAll(async () => {
      customerA = `crm-a-${randomUUID()}`;
      customerB = `crm-b-${randomUUID()}`;
      customerC = `crm-c-${randomUUID()}`;

      phoneA = `9988${Math.floor(100000 + Math.random() * 900000)}`;
      await prisma.user.createMany({
        data: [
          {
            telegramUserId: customerA,
            phoneNumber: `+855${phoneA}`,
            username: 'alice_cambodia',
            firstName: 'Alice',
            lastName: 'Vannak',
            contactName: 'Alice V.',
            building: 'A',
            roomNumber: '0512',
            tier: 'standard',
            loyaltyPoints: 50,
            luckyTickets: 3,
            trustNotes: 'Friendly resident',
          },
          {
            telegramUserId: customerB,
            phoneNumber: '+85588445566',
            username: `bob_${customerB}`,
            firstName: 'Bob',
            lastName: 'Rath',
            contactName: 'Bob R.',
            building: 'B',
            roomNumber: '1204',
            tier: 'gold',
            loyaltyPoints: 120,
            luckyTickets: 10,
            trustNotes: 'Top regular, always tips',
          },
          {
            telegramUserId: customerC,
            phoneNumber: '+85512778899',
            username: 'charlie_arakawa',
            firstName: `Charlie_${customerC}`,
            lastName: 'Heng',
            contactName: 'Charlie H.',
            building: 'C',
            roomNumber: '1808',
            tier: 'standard',
            loyaltyPoints: 20,
            luckyTickets: 1,
            trustNotes: null,
          },
        ],
      });

      // Create paid orders for customerB
      await prisma.order.createMany({
        data: [
          {
            id: `order-b1-${randomUUID()}`,
            telegramUserId: customerB,
            totalAmount: 12.5,
            paymentMethod: 'cash',
            status: 'completed',
            pointsSettled: true,
          },
          {
            id: `order-b2-${randomUUID()}`,
            telegramUserId: customerB,
            totalAmount: 7.0,
            paymentMethod: 'khqr',
            status: 'paid',
            pointsSettled: true,
          },
        ],
      });
    });

    it('requires manager authentication', async () => {
      const anonRes = await request(app).get('/api/customers');
      expect(anonRes.status).toBe(401);

      const staffRes = await request(app).get('/api/customers').set(staffAuth());
      expect(staffRes.status).toBe(401);

      const mgrRes = await request(app).get('/api/customers').set(managerAuth());
      expect(mgrRes.status).toBe(200);
      expect(Array.isArray(mgrRes.body.customers)).toBe(true);
      expect(mgrRes.body.summary).toBeDefined();
      expect(mgrRes.body.summary.totalCustomers).toBeGreaterThanOrEqual(3);
    });

    it('filters customers by search term (phone, name, username, ID)', async () => {
      // Search by phone
      const phoneRes = await request(app)
        .get('/api/customers')
        .query({ search: phoneA })
        .set(managerAuth());
      expect(phoneRes.status).toBe(200);
      expect(phoneRes.body.customers.some((c: any) => c.telegramUserId === customerA)).toBe(true);
      expect(phoneRes.body.customers.every((c: any) => c.telegramUserId === customerA)).toBe(true);

      // Search by username
      const userRes = await request(app)
        .get('/api/customers')
        .query({ search: `bob_${customerB}` })
        .set(managerAuth());
      expect(userRes.status).toBe(200);
      expect(userRes.body.customers.length).toBe(1);
      expect(userRes.body.customers[0].telegramUserId).toBe(customerB);

      // Search by firstName
      const nameRes = await request(app)
        .get('/api/customers')
        .query({ search: `Charlie_${customerC}` })
        .set(managerAuth());
      expect(nameRes.status).toBe(200);
      expect(nameRes.body.customers.length).toBe(1);
      expect(nameRes.body.customers[0].telegramUserId).toBe(customerC);
    });

    it('filters customers by tier', async () => {
      const goldRes = await request(app)
        .get('/api/customers')
        .query({ tier: 'gold' })
        .set(managerAuth());
      expect(goldRes.status).toBe(200);
      expect(goldRes.body.customers.every((c: any) => c.tier === 'gold')).toBe(true);

      const stdRes = await request(app)
        .get('/api/customers')
        .query({ tier: 'standard' })
        .set(managerAuth());
      expect(stdRes.status).toBe(200);
      expect(stdRes.body.customers.every((c: any) => c.tier === 'standard')).toBe(true);
    });

    it('computes totalSpent, totalOrders, and lastOrderDate on customers', async () => {
      const res = await request(app)
        .get('/api/customers')
        .query({ search: customerB })
        .set(managerAuth());
      expect(res.status).toBe(200);
      expect(res.body.customers.length).toBe(1);
      const bob = res.body.customers[0];
      expect(bob.totalOrders).toBe(2);
      expect(bob.totalSpent).toBe(19.5); // 12.5 + 7.0
      expect(bob.lastOrderDate).toBeDefined();
    });
  });

  describe('5. Customer Details & Order History (GET /api/customers/:telegramUserId)', () => {
    it('returns customer details and last 20 orders', async () => {
      const custId = `crm-detail-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: custId,
          phoneNumber: '+85511223344',
          contactName: 'Detail Customer',
          tier: 'gold',
          loyaltyPoints: 30,
        },
      });

      await prisma.order.create({
        data: {
          id: `order-detail-1-${randomUUID()}`,
          telegramUserId: custId,
          totalAmount: 10.0,
          paymentMethod: 'cash',
          status: 'completed',
        },
      });

      const res = await request(app)
        .get(`/api/customers/${custId}`)
        .set(managerAuth());

      expect(res.status).toBe(200);
      expect(res.body.telegramUserId).toBe(custId);
      expect(res.body.contactName).toBe('Detail Customer');
      expect(res.body.tier).toBe('gold');
      expect(res.body.totalOrders).toBe(1);
      expect(res.body.totalSpent).toBe(10.0);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBe(1);
    });

    it('returns 404 for unknown customer', async () => {
      const res = await request(app)
        .get('/api/customers/non-existent-user-id')
        .set(managerAuth());
      expect(res.status).toBe(404);
    });
  });

  describe('6. Manual Tier Management (PUT /api/customers/:telegramUserId/tier)', () => {
    it('allows manager to change tier and update trust notes', async () => {
      const custId = `tier-edit-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: custId, tier: 'standard', trustNotes: 'Initial' },
      });

      const res = await request(app)
        .put(`/api/customers/${custId}/tier`)
        .set(managerAuth())
        .send({
          tier: 'gold',
          trustNotes: 'Verified trusted resident in Building B',
        });

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe('gold');
      expect(res.body.trustNotes).toBe('Verified trusted resident in Building B');

      const user = await prisma.user.findUnique({ where: { telegramUserId: custId } });
      expect(user?.tier).toBe('gold');
    });

    it('rejects invalid tier value', async () => {
      const custId = `tier-invalid-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: custId, tier: 'standard' },
      });

      const res = await request(app)
        .put(`/api/customers/${custId}/tier`)
        .set(managerAuth())
        .send({ tier: 'diamond' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("tier must be 'standard' or 'gold'");
    });
  });

  describe('7. Manual Lucky Ticket Adjustment (PUT /api/customers/:telegramUserId/lucky-tickets)', () => {
    it('supports setting tickets directly or adjusting via delta', async () => {
      const custId = `ticket-edit-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: custId, luckyTickets: 2 },
      });

      // 1. Delta +3
      const res1 = await request(app)
        .put(`/api/customers/${custId}/lucky-tickets`)
        .set(managerAuth())
        .send({ delta: 3 });
      expect(res1.status).toBe(200);
      expect(res1.body.luckyTickets).toBe(5);

      // 2. Delta -2
      const res2 = await request(app)
        .put(`/api/customers/${custId}/lucky-tickets`)
        .set(managerAuth())
        .send({ delta: -2 });
      expect(res2.status).toBe(200);
      expect(res2.body.luckyTickets).toBe(3);

      // 3. Direct tickets: 20
      const res3 = await request(app)
        .put(`/api/customers/${custId}/lucky-tickets`)
        .set(managerAuth())
        .send({ tickets: 20 });
      expect(res3.status).toBe(200);
      expect(res3.body.luckyTickets).toBe(20);

      // 4. Large negative delta clamps to 0
      const res4 = await request(app)
        .put(`/api/customers/${custId}/lucky-tickets`)
        .set(managerAuth())
        .send({ delta: -50 });
      expect(res4.status).toBe(200);
      expect(res4.body.luckyTickets).toBe(0);
    });
  });

  describe('8. Lucky Draw (POST /api/lucky-draw/draw)', () => {
    it('draws a random winner weighted by tickets and supports tier filter', async () => {
      // Clear previous tickets to test isolated draw
      await prisma.user.updateMany({ data: { luckyTickets: 0 } });

      const uid1 = `draw-gold-${randomUUID()}`;
      const uid2 = `draw-std-${randomUUID()}`;

      await prisma.user.createMany({
        data: [
          { telegramUserId: uid1, tier: 'gold', luckyTickets: 10, contactName: 'Gold Winner' },
          { telegramUserId: uid2, tier: 'standard', luckyTickets: 5, contactName: 'Std Winner' },
        ],
      });

      // Draw all tiers
      const resAll = await request(app)
        .post('/api/lucky-draw/draw')
        .set(managerAuth())
        .send({ prizeName: 'Free Milk Tea Voucher', tierFilter: 'all' });

      expect(resAll.status).toBe(200);
      expect(resAll.body.winner).toBeDefined();
      expect([uid1, uid2]).toContain(resAll.body.winner.telegramUserId);
      expect(resAll.body.prizeName).toBe('Free Milk Tea Voucher');
      expect(resAll.body.totalTickets).toBeGreaterThanOrEqual(15);

      // Draw gold only
      const resGold = await request(app)
        .post('/api/lucky-draw/draw')
        .set(managerAuth())
        .send({ prizeName: 'Gold Exclusive VIP Voucher', tierFilter: 'gold' });

      expect(resGold.status).toBe(200);
      expect(resGold.body.winner.tier).toBe('gold');
    });

    it('rejects if no eligible participants exist', async () => {
      // Clear tickets for all users
      await prisma.user.updateMany({ data: { luckyTickets: 0 } });

      const res = await request(app)
        .post('/api/lucky-draw/draw')
        .set(managerAuth())
        .send({ tierFilter: 'all' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No eligible participants with tickets found');
    });
  });

  describe('9. SystemConfig for Trust Tiers & Lucky Draw', () => {
    it('allows manager to configure threshold, allowCash, luckyDrawEnabled, and ticket rewards', async () => {
      // 1. goldMinOrdersThreshold
      const r1 = await request(app)
        .put('/api/config')
        .set(managerAuth())
        .send({ key: 'goldMinOrdersThreshold', value: '5' });
      expect(r1.status).toBe(200);
      expect(r1.body.value).toBe('5');

      // 2. allowCashForStandard
      const r2 = await request(app)
        .put('/api/config')
        .set(managerAuth())
        .send({ key: 'allowCashForStandard', value: '1' });
      expect(r2.status).toBe(200);
      expect(r2.body.value).toBe('1');

      // 3. luckyDrawEnabled
      const r3 = await request(app)
        .put('/api/config')
        .set(managerAuth())
        .send({ key: 'luckyDrawEnabled', value: '0' });
      expect(r3.status).toBe(200);
      expect(r3.body.value).toBe('0');

      // 4. luckyTicketsPerGoldOrder
      const r4 = await request(app)
        .put('/api/config')
        .set(managerAuth())
        .send({ key: 'luckyTicketsPerGoldOrder', value: '3' });
      expect(r4.status).toBe(200);
      expect(r4.body.value).toBe('3');

      // 5. luckyTicketsPerStandardOrder
      const r5 = await request(app)
        .put('/api/config')
        .set(managerAuth())
        .send({ key: 'luckyTicketsPerStandardOrder', value: '2' });
      expect(r5.status).toBe(200);
      expect(r5.body.value).toBe('2');

      // Check GET /api/config
      const listRes = await request(app).get('/api/config');
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((c: any) => c.key === 'goldMinOrdersThreshold' && c.value === '5')).toBe(true);
      expect(listRes.body.some((c: any) => c.key === 'allowCashForStandard' && c.value === '1')).toBe(true);
    });
  });
});
