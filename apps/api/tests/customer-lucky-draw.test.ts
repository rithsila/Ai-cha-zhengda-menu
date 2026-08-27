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
  });
});
