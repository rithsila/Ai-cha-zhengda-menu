import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { calculateNextPickupCode, getCambodiaDateKey } from '../src/loyalty';

const app = createApp();
const itemId = `test-item-pickup-${randomUUID()}`;

beforeAll(async () => {
  await prisma.systemConfig.upsert({
    where: { key: 'allowCashForStandard' },
    update: { value: '1' },
    create: { key: 'allowCashForStandard', value: '1' },
  });
  await prisma.menuItem.create({
    data: {
      id: itemId,
      brand: 'ai-cha',
      category: 'Test',
      name: 'Queue Test Tea',
      basePrice: 2.0,
    },
  });
});

describe('calculateNextPickupCode', () => {
  it('returns AI-01 when no prior order exists', () => {
    expect(calculateNextPickupCode(null, null)).toBe('AI-01');
    expect(calculateNextPickupCode(undefined, undefined)).toBe('AI-01');
  });

  it('resets to AI-01 when previous code does not match AI-XX format', () => {
    expect(calculateNextPickupCode('A-543', new Date())).toBe('AI-01');
    expect(calculateNextPickupCode('RANDOM', new Date())).toBe('AI-01');
  });

  it('increments sequentially within the same day', () => {
    const today = new Date();
    expect(calculateNextPickupCode('AI-01', today, today)).toBe('AI-02');
    expect(calculateNextPickupCode('AI-09', today, today)).toBe('AI-10');
    expect(calculateNextPickupCode('AI-50', today, today)).toBe('AI-51');
    expect(calculateNextPickupCode('AI-98', today, today)).toBe('AI-99');
  });

  it('rolls over from AI-99 back to AI-01', () => {
    const today = new Date();
    expect(calculateNextPickupCode('AI-99', today, today)).toBe('AI-01');
  });

  it('resets to AI-01 on a new day', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const today = new Date();
    if (getCambodiaDateKey(yesterday) !== getCambodiaDateKey(today)) {
      expect(calculateNextPickupCode('AI-35', yesterday, today)).toBe('AI-01');
    }
  });
});

describe('API sequential order pickupCode', () => {
  it('assigns sequential AI-XX codes to consecutive orders', async () => {
    const res1 = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      totalAmount: 2.0,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res1.status).toBe(200);
    const code1 = res1.body.pickupCode;
    expect(code1).toMatch(/^AI-\d{2}$/);

    const res2 = await request(app).post('/api/orders').send({
      items: [{ menuItemId: itemId, quantity: 1, totalPrice: 2.0, selectedModifiers: {} }],
      totalAmount: 2.0,
      paymentMethod: 'cash',
      orderType: 'pickup',
    });
    expect(res2.status).toBe(200);
    const code2 = res2.body.pickupCode;
    expect(code2).toMatch(/^AI-\d{2}$/);

    const num1 = parseInt(code1.replace('AI-', ''), 10);
    const num2 = parseInt(code2.replace('AI-', ''), 10);
    const expectedNum2 = (num1 % 99) + 1;
    expect(num2).toBe(expectedNum2);
  });
});
