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

  it('allows manager to update menu banner URL and menu tabs config', async () => {
    const defaultRes = await request(app).get('/api/store/status');
    expect(defaultRes.body.menuBannerUrl).toBe('/banner.webp');
    expect(defaultRes.body.menuTabsConfig).toContain('ai-cha');

    await putConfig({ key: 'menuBannerUrl', value: '/custom-banner.jpg' });
    const customTabs = [
      { id: 'tea', label: 'Milk Tea', icon: '/tea.png', enabled: true },
      { id: 'chicken', label: 'Fried Chicken', icon: '/chicken.png', enabled: true },
      { id: 'coffee', label: 'Coffee', icon: '/coffee.png', enabled: true },
    ];
    await putConfig({ key: 'menuTabsConfig', value: JSON.stringify(customTabs) });

    const updatedRes = await request(app).get('/api/store/status');
    expect(updatedRes.body.menuBannerUrl).toBe('/custom-banner.jpg');
    const parsedTabs = JSON.parse(updatedRes.body.menuTabsConfig);
    expect(parsedTabs).toHaveLength(3);
    expect(parsedTabs[2].label).toBe('Coffee');
  });

  it('allows manager to update shop info and social media badges', async () => {
    const defaultRes = await request(app).get('/api/store/status');
    expect(defaultRes.body.shopName).toBe('Our shop');
    expect(defaultRes.body.shopAddress).toBe('J03, Ground Floor, Arakawa');

    await putConfig({ key: 'shopName', value: 'Ai-Cha & Zhengda Arakawa Flagship' });
    await putConfig({ key: 'shopAddress', value: 'Building B, Ground Floor, Unit J03' });
    await putConfig({ key: 'shopDeliveryNote', value: 'Free express delivery to all rooms' });
    await putConfig({ key: 'shopSocialsEnabled', value: '1' });
    const socials = [
      { id: 'telegram', label: 'Telegram', url: 'https://t.me/mybot', enabled: true },
      { id: 'facebook', label: 'Facebook', url: 'https://facebook.com/aicha', enabled: true },
    ];
    await putConfig({ key: 'shopSocialLinks', value: JSON.stringify(socials) });

    const statusRes = await request(app).get('/api/store/status');
    expect(statusRes.body.shopName).toBe('Ai-Cha & Zhengda Arakawa Flagship');
    expect(statusRes.body.shopAddress).toBe('Building B, Ground Floor, Unit J03');
    expect(statusRes.body.shopDeliveryNote).toBe('Free express delivery to all rooms');
    expect(statusRes.body.shopSocialsEnabled).toBe(true);
    const parsedSocials = JSON.parse(statusRes.body.shopSocialLinks);
    expect(parsedSocials).toHaveLength(2);
    expect(parsedSocials[1].id).toBe('facebook');
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
