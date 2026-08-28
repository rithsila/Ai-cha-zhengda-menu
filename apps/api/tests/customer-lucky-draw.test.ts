import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import { asCustomer } from './helpers/customer';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-lucky-draw';

describe('Customer Lucky Draw Spin Wheel Feature', () => {
  let managerToken: string;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    managerToken = issueToken('manager').token;
  });

  beforeEach(async () => {
    await prisma.systemConfig.deleteMany({});
    await prisma.prizeClaim.deleteMany({});
  });

  describe('GET /api/lucky-draw/config', () => {
    it('returns default lucky draw settings (cost 5, enabled, 8 prizes)', async () => {
      const res = await request(app).get('/api/lucky-draw/config');
      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(true);
      expect(res.body.costPerSpin).toBe(5);
      expect(Array.isArray(res.body.prizes)).toBe(true);
      expect(res.body.prizes.length).toBe(8);
    });

    it('reflects updated costPerSpin configured by manager', async () => {
      await request(app)
        .put('/api/config')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ key: 'luckyTicketsCostPerSpin', value: '3' });

      const res = await request(app).get('/api/lucky-draw/config');
      expect(res.status).toBe(200);
      expect(res.body.costPerSpin).toBe(3);
    });
  });

  describe('POST /api/lucky-draw/spin', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/lucky-draw/spin');
      expect(res.status).toBe(401);
    });

    it('rejects spin if user has fewer tickets than costPerSpin', async () => {
      const customerId = `cust-lucky-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          luckyTickets: 2, // Less than default 5
          loyaltyPoints: 0,
        },
      });

      const res = await request(app)
        .post('/api/lucky-draw/spin')
        .set(asCustomer(customerId));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Not enough lucky tickets/i);
      expect(res.body.requiredTickets).toBe(5);
      expect(res.body.currentTickets).toBe(2);
    });

    it('allows spin when user has enough tickets, deducts tickets and awards prize', async () => {
      const customerId = `cust-lucky-spin-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          luckyTickets: 10,
          loyaltyPoints: 50,
        },
      });

      const res = await request(app)
        .post('/api/lucky-draw/spin')
        .set(asCustomer(customerId));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.prize).toBeDefined();
      expect(typeof res.body.prize.segmentIndex).toBe('number');
      expect(res.body.prize.segmentIndex).toBeGreaterThanOrEqual(0);
      expect(res.body.prize.segmentIndex).toBeLessThanOrEqual(7);
      expect(res.body.costPerSpin).toBe(5);

      const updatedUser = await prisma.user.findUnique({
        where: { telegramUserId: customerId },
      });
      // User started with 10 tickets, spent 5 = 5 (unless +1 ticket was won, then 6)
      expect(updatedUser?.luckyTickets).toBeGreaterThanOrEqual(5);
    });

    it('rejects spin when luckyDrawEnabled is set to 0', async () => {
      await request(app)
        .put('/api/config')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ key: 'luckyDrawEnabled', value: '0' });

      const customerId = `cust-lucky-disabled-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          luckyTickets: 20,
        },
      });

      const res = await request(app)
        .post('/api/lucky-draw/spin')
        .set(asCustomer(customerId));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not active/i);
    });

    it('allows manager to customize luckyWheelPrizes via PUT /api/config', async () => {
      const customPrizes = [
        { id: 'custom_1', label: '+100 Pts', name: '+100 Jackpot Points', icon: '💎', color: '#10B981', type: 'points', value: 100, weight: 50 },
        { id: 'custom_2', label: '+5 Tix', name: '+5 Tickets', icon: '🎟️', color: '#EF4444', type: 'tickets', value: 5, weight: 50 },
      ];

      const putRes = await request(app)
        .put('/api/config')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ key: 'luckyWheelPrizes', value: JSON.stringify(customPrizes) });
      expect(putRes.status).toBe(200);

      const cfgRes = await request(app).get('/api/lucky-draw/config');
      expect(cfgRes.status).toBe(200);
      expect(cfgRes.body.prizes.length).toBe(2);
      expect(cfgRes.body.prizes[0].label).toBe('+100 Pts');
      expect(cfgRes.body.prizes[1].label).toBe('+5 Tix');
    });

    it('creates a PrizeClaim record when customer wins an item prize', async () => {
      // Set prizes to 100% chance of winning a physical item
      const itemPrize = [
        { id: 'blind_box', label: 'Blind Box', name: 'Mystery Blind Box Toy', icon: '🎁', color: '#8B5CF6', type: 'item', value: 0, weight: 100 },
      ];
      await request(app)
        .put('/api/config')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ key: 'luckyWheelPrizes', value: JSON.stringify(itemPrize) });

      const customerId = `cust-item-win-${randomUUID()}`;
      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          firstName: 'Alice',
          phoneNumber: '+85512345678',
          luckyTickets: 10,
        },
      });

      const spinRes = await request(app)
        .post('/api/lucky-draw/spin')
        .set(asCustomer(customerId));

      expect(spinRes.status).toBe(200);
      expect(spinRes.body.prize.type).toBe('item');
      expect(spinRes.body.prize.claimCode).toMatch(/^LUCKY-[A-Z0-9]{6}$/);

      // Verify PrizeClaim exists in DB
      const claim = await prisma.prizeClaim.findUnique({
        where: { code: spinRes.body.prize.claimCode },
      });
      expect(claim).toBeDefined();
      expect(claim?.telegramUserId).toBe(customerId);
      expect(claim?.prizeName).toBe('Mystery Blind Box Toy');
      expect(claim?.status).toBe('pending');
    });
  });

  describe('GET /api/me/prizes', () => {
    it('returns empty array when customer has no won prizes', async () => {
      const customerId = `cust-no-prizes-${randomUUID()}`;
      await prisma.user.create({
        data: { telegramUserId: customerId },
      });

      const res = await request(app)
        .get('/api/me/prizes')
        .set(asCustomer(customerId));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns list of won prizes and auto-expires past validity items', async () => {
      const customerId = `cust-prizes-${randomUUID()}`;
      const codeValid = `LUCKY-${randomUUID().slice(0, 6).toUpperCase()}`;
      const codeExpired = `LUCKY-${randomUUID().slice(0, 6).toUpperCase()}`;

      await prisma.user.create({
        data: { telegramUserId: customerId },
      });

      // 1 valid claim
      await prisma.prizeClaim.create({
        data: {
          code: codeValid,
          telegramUserId: customerId,
          prizeName: 'Fried Chicken Voucher',
          prizeIcon: '🍗',
          status: 'pending',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days in future
        },
      });

      // 1 expired claim
      await prisma.prizeClaim.create({
        data: {
          code: codeExpired,
          telegramUserId: customerId,
          prizeName: 'Mystery Toy',
          prizeIcon: '🎁',
          status: 'pending',
          expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        },
      });

      const res = await request(app)
        .get('/api/me/prizes')
        .set(asCustomer(customerId));

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);

      const validItem = res.body.find((p: any) => p.code === codeValid);
      const expiredItem = res.body.find((p: any) => p.code === codeExpired);

      expect(validItem.status).toBe('pending');
      expect(expiredItem.status).toBe('expired');
    });
  });

  describe('Staff Verification & Redemption Flow', () => {
    let staffToken: string;
    let customerId: string;
    let claimCode: string;

    beforeEach(async () => {
      staffToken = issueToken('staff').token;
      customerId = `cust-verify-${randomUUID()}`;
      claimCode = `LUCKY-${randomUUID().slice(0, 6).toUpperCase()}`;

      await prisma.user.create({
        data: {
          telegramUserId: customerId,
          firstName: 'Dara',
          lastName: 'Chan',
          phoneNumber: '+85599887766',
          building: 'C',
          roomNumber: '1204',
          tier: 'gold',
        },
      });

      await prisma.prizeClaim.create({
        data: {
          code: claimCode,
          telegramUserId: customerId,
          prizeName: 'Free Zhengda Fried Chicken',
          prizeIcon: '🍗',
          status: 'pending',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        },
      });
    });

    it('rejects verification if not staff/manager', async () => {
      const res = await request(app)
        .post('/api/lucky-draw/verify-claim')
        .send({ code: claimCode });
      expect(res.status).toBe(401);
    });

    it('verifies valid claim code (case-insensitive and prefix-tolerant)', async () => {
      // Test without LUCKY- prefix in lowercase
      const shortCode = claimCode.replace('LUCKY-', '').toLowerCase();

      const res = await request(app)
        .post('/api/lucky-draw/verify-claim')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: shortCode });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.status).toBe('pending');
      expect(res.body.claim.prizeName).toBe('Free Zhengda Fried Chicken');
      expect(res.body.claim.user.firstName).toBe('Dara');
      expect(res.body.claim.user.building).toBe('C');
      expect(res.body.claim.user.roomNumber).toBe('1204');
    });

    it('returns 404 for non-existent claim codes', async () => {
      const res = await request(app)
        .post('/api/lucky-draw/verify-claim')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: 'NONEXIST99' });

      expect(res.status).toBe(404);
      expect(res.body.valid).toBe(false);
    });

    it('allows staff to redeem gift, updating status to claimed', async () => {
      const res = await request(app)
        .post('/api/lucky-draw/redeem-claim')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: claimCode, staffName: 'Barista John', notes: 'Handed over 1x Spicy Chicken' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.claim.status).toBe('claimed');
      expect(res.body.claim.claimedByStaffName).toBe('Barista John');
      expect(res.body.claim.notes).toBe('Handed over 1x Spicy Chicken');

      // Verify DB updated
      const dbClaim = await prisma.prizeClaim.findUnique({ where: { code: claimCode } });
      expect(dbClaim?.status).toBe('claimed');
      expect(dbClaim?.claimedAt).toBeDefined();
    });

    it('prevents double-redemption of already claimed gifts', async () => {
      // Redeem first time
      await request(app)
        .post('/api/lucky-draw/redeem-claim')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: claimCode, staffName: 'Staff 1' });

      // Attempt redeem second time
      const secondRes = await request(app)
        .post('/api/lucky-draw/redeem-claim')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ code: claimCode, staffName: 'Staff 2' });

      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toMatch(/already claimed/i);
    });

    it('lists all claims with search & status filter for staff', async () => {
      const res = await request(app)
        .get(`/api/lucky-draw/claims?search=${customerId}`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].code).toBe(claimCode);
      expect(res.body[0].user.firstName).toBe('Dara');
    });
  });
});

