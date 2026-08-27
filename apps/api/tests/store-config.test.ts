import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';
import { asCustomer } from './helpers/customer';
import { isTimeInRange, validateConfig } from '../src/store-config';

const app = createApp();
const uid = `test-user-${randomUUID()}`;
const itemId = `test-item-${randomUUID()}`;
let managerToken = '';

beforeAll(async () => {
  managerToken = issueToken('manager').token;
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 100, tier: 'gold' } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Tea', name: 'Store Test Drink', basePrice: 2.5 },
  });
});

beforeEach(async () => {
  // Reset store config to default before each test
  await prisma.systemConfig.deleteMany();
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany();
});

describe('Store Config - Helpers & Validation', () => {
  it('checks daytime and overnight time ranges accurately', () => {
    // Normal day: 08:00 to 21:00
    expect(isTimeInRange('07:59', '08:00', '21:00')).toBe(false);
    expect(isTimeInRange('08:00', '08:00', '21:00')).toBe(true);
    expect(isTimeInRange('12:30', '08:00', '21:00')).toBe(true);
    expect(isTimeInRange('20:59', '08:00', '21:00')).toBe(true);
    expect(isTimeInRange('21:00', '08:00', '21:00')).toBe(false);

    // Overnight schedule: 18:00 to 02:00
    expect(isTimeInRange('17:59', '18:00', '02:00')).toBe(false);
    expect(isTimeInRange('18:00', '18:00', '02:00')).toBe(true);
    expect(isTimeInRange('23:30', '18:00', '02:00')).toBe(true);
    expect(isTimeInRange('01:59', '18:00', '02:00')).toBe(true);
    expect(isTimeInRange('02:00', '18:00', '02:00')).toBe(false);

    // 24 hours: 00:00 to 00:00
    expect(isTimeInRange('14:00', '00:00', '00:00')).toBe(true);
  });

  it('validates config keys and values', () => {
    expect(validateConfig('storeStatus', 'auto').valid).toBe(true);
    expect(validateConfig('storeStatus', 'open').valid).toBe(true);
    expect(validateConfig('storeStatus', 'closed').valid).toBe(true);
    expect(validateConfig('storeStatus', 'invalid').valid).toBe(false);

    expect(validateConfig('openTime', '08:00').valid).toBe(true);
    expect(validateConfig('openTime', '23:59').valid).toBe(true);
    expect(validateConfig('openTime', '25:00').valid).toBe(false);
    expect(validateConfig('closeTime', 'invalid').valid).toBe(false);

    expect(validateConfig('enablePickup', '1').valid).toBe(true);
    expect(validateConfig('enablePickup', true).valid).toBe(true);
    expect(validateConfig('enablePickup', false).valid).toBe(true);
    expect(validateConfig('enablePickup', '0').valid).toBe(true);
    expect(validateConfig('enablePickup', 'xyz').valid).toBe(false);

    expect(validateConfig('deliveryFee', '0').valid).toBe(true);
    expect(validateConfig('deliveryFee', '1.5').valid).toBe(true);
    expect(validateConfig('deliveryFee', '-1').valid).toBe(false);
  });
});

describe('GET /api/store/status and PUT /api/config', () => {
  const putConfig = (body: object) =>
    request(app).put('/api/config').set('Authorization', `Bearer ${managerToken}`).send(body);

  it('returns default status with all toggles enabled in auto mode', async () => {
    const res = await request(app).get('/api/store/status');
    expect(res.status).toBe(200);
    expect(res.body.storeStatus).toBe('auto');
    expect(res.body.openTime).toBe('08:00');
    expect(res.body.closeTime).toBe('21:00');
    expect(res.body.enablePickup).toBe(true);
    expect(res.body.enableDelivery).toBe(true);
    expect(res.body.enableCash).toBe(true);
    expect(res.body.enableKhqr).toBe(true);
  });

  it('allows manager to update operating hours and mode', async () => {
    const res1 = await putConfig({ key: 'storeStatus', value: 'closed' });
    expect(res1.status).toBe(200);

    const statusRes = await request(app).get('/api/store/status');
    expect(statusRes.body.isOpen).toBe(false);
    expect(statusRes.body.storeStatus).toBe('closed');
    expect(statusRes.body.reason).toBe('manual_closed');
  });

  it('allows manager to update order type and payment toggles', async () => {
    await putConfig({ key: 'enableDelivery', value: '0' });
    await putConfig({ key: 'enableCash', value: '0' });

    const statusRes = await request(app).get('/api/store/status');
    expect(statusRes.body.enableDelivery).toBe(false);
    expect(statusRes.body.enableCash).toBe(false);
    expect(statusRes.body.enablePickup).toBe(true);
    expect(statusRes.body.enableKhqr).toBe(true);

    const payRes = await request(app).get('/api/payment/methods');
    expect(payRes.body.cash).toBe(false);
  });

  afterEach(async () => {
    await prisma.systemConfig.deleteMany();
  });
});

describe('POST /api/orders enforcement', () => {
  const putConfig = (body: object) =>
    request(app).put('/api/config').set('Authorization', `Bearer ${managerToken}`).send(body);

  const placeOrder = (opts: { orderType?: string; paymentMethod?: string } = {}) =>
    request(app)
      .post('/api/orders')
      .set(asCustomer(uid))
      .send({
        items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.5, selectedModifiers: {} }],
        orderType: opts.orderType ?? 'pickup',
        paymentMethod: opts.paymentMethod ?? 'cash',
        contactName: 'Test Door',
        contactPhone: '012345678',
        building: 'A',
        roomNumber: '1110',
      });

  it('allows order when store is open', async () => {
    await putConfig({ key: 'storeStatus', value: 'open' });
    const res = await placeOrder();
    expect(res.status).toBe(200);
    expect(res.body.pickupCode).toBeTruthy();
  });

  it('blocks orders when store is force closed', async () => {
    await putConfig({ key: 'storeStatus', value: 'closed' });
    const res = await placeOrder();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('closed');
  });

  it('blocks pickup orders when pickup is disabled', async () => {
    await putConfig({ key: 'storeStatus', value: 'open' });
    await putConfig({ key: 'enablePickup', value: '0' });

    const res = await placeOrder({ orderType: 'pickup' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Pickup orders are currently turned off');
  });

  it('blocks delivery orders when delivery is disabled', async () => {
    await putConfig({ key: 'storeStatus', value: 'open' });
    await putConfig({ key: 'enableDelivery', value: '0' });

    const res = await placeOrder({ orderType: 'delivery' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Delivery orders are currently turned off');
  });

  it('blocks cash payment when cash is disabled', async () => {
    await putConfig({ key: 'storeStatus', value: 'open' });
    await putConfig({ key: 'enableCash', value: '0' });

    const res = await placeOrder({ paymentMethod: 'cash' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cash payment is currently turned off');
  });

  afterEach(async () => {
    await prisma.systemConfig.deleteMany();
  });

  afterAll(async () => {
    await prisma.systemConfig.deleteMany();
  });
});
