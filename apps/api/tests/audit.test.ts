import { describe, it, expect, beforeEach, afterEach, afterAll, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { randomUUID, createHmac } from 'crypto';
import { createApp, prisma } from '../src/app';
import { recordAuditLog } from '../src/audit';
import { issueToken, clearSessions, getStaffSessionInfo } from '../src/auth';
import { enableAba, disableAba, stubAbaFetch, approvedStatus, ABA_ENV } from './helpers/aba';
import { asCustomer } from './helpers/customer';

describe('Audit Logging System', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    clearSessions();
  });

  it('records an audit log entry successfully', async () => {
    await recordAuditLog(prisma, {
      actorType: 'manager',
      actorId: 'admin-1',
      actorName: 'Admin',
      action: 'PRICE_UPDATE',
      entityType: 'menu_item',
      entityId: 'a1',
      oldValue: { basePrice: 2.0 },
      newValue: { basePrice: 2.5 },
      metadata: { reason: 'Sugar inflation' },
    });

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('PRICE_UPDATE');
    expect(logs[0].actorName).toBe('Admin');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ basePrice: 2.0 });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ basePrice: 2.5 });
    expect(JSON.parse(logs[0].metadata!)).toEqual({ reason: 'Sugar inflation' });
  });

  it('handles string or undefined values for oldValue, newValue, and metadata', async () => {
    await recordAuditLog(prisma, {
      actorType: 'staff',
      action: 'ITEM_SOLD_OUT_TOGGLED',
      entityType: 'menu_item',
      entityId: 'item-2',
      oldValue: 'false',
      newValue: 'true',
    });

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('ITEM_SOLD_OUT_TOGGLED');
    expect(logs[0].oldValue).toBe('false');
    expect(logs[0].newValue).toBe('true');
    expect(logs[0].metadata).toBeNull();
    expect(logs[0].actorId).toBeNull();
    expect(logs[0].actorName).toBeNull();
  });

  it('never throws even if writing to database fails', async () => {
    const mockPrisma = {
      auditLog: {
        create: () => Promise.reject(new Error('DB connection failed')),
      },
    };

    await expect(
      recordAuditLog(mockPrisma as any, {
        actorType: 'system',
        action: 'TEST_ERROR',
        entityType: 'order',
      })
    ).resolves.not.toThrow();
  });

  it('extracts staff session info correctly via getStaffSessionInfo', () => {
    const { token } = issueToken('manager', { name: 'Manager Bob', telegramUserId: '12345' });
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const sessionInfo = getStaffSessionInfo(req);
    expect(sessionInfo).not.toBeNull();
    expect(sessionInfo?.role).toBe('manager');
    expect(sessionInfo?.name).toBe('Manager Bob');
    expect(sessionInfo?.telegramUserId).toBe('12345');
  });

  it('returns null from getStaffSessionInfo when token is missing or invalid', () => {
    expect(getStaffSessionInfo({ headers: {} })).toBeNull();
    expect(getStaffSessionInfo({ headers: { authorization: 'Bearer invalid-token' } })).toBeNull();
  });
});

describe('Payment & Order Lifecycle Audit Logging', () => {
  const app = createApp();
  const uid = `audit-user-${randomUUID()}`;
  const itemId = `audit-item-${randomUUID()}`;
  const ITEM_PRICE = 5.0;

  function signWebhookPayload(payload: Record<string, any>, key: string = ABA_ENV.ABA_API_KEY) {
    const sortedKeys = Object.keys(payload).sort();
    const concatenated = sortedKeys.map((k) => String(payload[k])).join('');
    return createHmac('sha512', key).update(concatenated).digest('base64');
  }

  async function makeOrder() {
    const res = await request(app).post('/api/orders').set(asCustomer(uid)).send({
      items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
      paymentMethod: 'khqr',
      orderType: 'pickup',
      pointsToUse: 0,
    });
    expect(res.status).toBe(200);
    return res.body as { id: string; totalAmount: number; pickupCode: string; status: string };
  }

  beforeAll(async () => {
    await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 0 } });
    await prisma.menuItem.create({
      data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Audit Test Tea', basePrice: ITEM_PRICE },
    });
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    clearSessions();
    enableAba();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    disableAba();
  });

  it('records PAYMENT_INITIATED when creating ABA payment', async () => {
    stubAbaFetch();
    const order = await makeOrder();
    const res = await request(app)
      .post('/api/payment/aba/create')
      .set(asCustomer(uid))
      .send({ orderId: order.id });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'PAYMENT_INITIATED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe('payment');
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.amount).toBe(order.totalAmount);
    expect(metadata.tranId).toBeDefined();
  });

  it('records PAYMENT_APPROVED when ABA payment is confirmed', async () => {
    const order = await makeOrder();
    const transactionId = `tx-${randomUUID()}`;
    await prisma.order.update({
      where: { id: order.id },
      data: { transactionId, paymentExpiresAt: new Date(Date.now() + 3 * 60 * 1000) },
    });
    stubAbaFetch({ status: approvedStatus(order.totalAmount) });

    const res = await request(app)
      .get(`/api/payment/aba/status/${order.id}`)
      .set(asCustomer(uid));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const logs = await prisma.auditLog.findMany({
      where: { action: 'PAYMENT_APPROVED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe('payment');
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.tranId).toBe(transactionId);
    expect(metadata.amount).toBe(order.totalAmount);
    expect(metadata.pickupCode).toBe(order.pickupCode);
  });

  it('records PAYMENT_MISMATCH when paid amount does not match', async () => {
    const order = await makeOrder();
    const transactionId = `tx-${randomUUID()}`;
    await prisma.order.update({
      where: { id: order.id },
      data: { transactionId, paymentExpiresAt: new Date(Date.now() + 3 * 60 * 1000) },
    });
    stubAbaFetch({ status: approvedStatus(order.totalAmount + 2.0) });

    const res = await request(app)
      .get(`/api/payment/aba/status/${order.id}`)
      .set(asCustomer(uid));
    expect(res.status).toBe(400);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'PAYMENT_MISMATCH', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityType).toBe('payment');
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.tranId).toBe(transactionId);
    expect(metadata.expectedAmount).toBe(order.totalAmount);
    expect(metadata.receivedAmount).toBe(order.totalAmount + 2.0);
  });

  it('records PAYMENT_WEBHOOK_RECEIVED when webhook callback is processed', async () => {
    const order = await makeOrder();
    const transactionId = `tx-${randomUUID()}`;
    await prisma.order.update({
      where: { id: order.id },
      data: { transactionId, paymentExpiresAt: new Date(Date.now() + 3 * 60 * 1000) },
    });
    stubAbaFetch({ status: approvedStatus(order.totalAmount) });

    const payload = {
      tran_id: transactionId,
      return_params: order.id,
      status: '0',
    };
    const signature = signWebhookPayload(payload);

    const res = await request(app)
      .post('/api/payment/aba/callback')
      .set('X-PayWay-HMAC-SHA512', signature)
      .send(payload);
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'PAYMENT_WEBHOOK_RECEIVED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('system');
    expect(logs[0].actorId).toBe('aba-webhook');
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.tranId || metadata.tran_id).toBe(transactionId);
  });

  it('records ORDER_STATUS_CHANGED with staff actor details on PUT /api/orders/:id/status', async () => {
    const order = await makeOrder();
    const { token } = issueToken('staff', { name: 'Sophea Staff', telegramUserId: 'staff-tg-1' });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'preparing' });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ORDER_STATUS_CHANGED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('staff');
    expect(logs[0].actorName).toBe('Sophea Staff');
    expect(logs[0].oldValue).toBe('pending');
    expect(logs[0].newValue).toBe('preparing');
  });

  it('records ORDER_STATUS_CHANGED with cancelReason when staff cancels order', async () => {
    const order = await makeOrder();
    const { token } = issueToken('manager', { name: 'Admin Alice', telegramUserId: 'mgr-tg-1' });

    const res = await request(app)
      .put(`/api/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled', cancelReason: 'Out of ingredients' });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ORDER_STATUS_CHANGED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('manager');
    expect(logs[0].actorName).toBe('Admin Alice');
    expect(logs[0].oldValue).toBe('pending');
    expect(logs[0].newValue).toBe('cancelled');
    const metadata = JSON.parse(logs[0].metadata!);
    expect(metadata.cancelReason).toBe('Out of ingredients');
  });

  it('records ORDER_CANCELLED when customer cancels unpaid order via POST /api/payment/aba/cancel', async () => {
    const order = await makeOrder();
    const res = await request(app)
      .post('/api/payment/aba/cancel')
      .set(asCustomer(uid))
      .send({ orderId: order.id });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ORDER_CANCELLED', entityId: order.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('customer');
    expect(logs[0].oldValue).toBe('pending');
    expect(logs[0].newValue).toBe('cancelled');
  });
});

describe('Catalog & Menu Audit Logging', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
  });

  it('records ITEM_PRICE_UPDATE when manager updates basePrice', async () => {
    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Classic Milk Tea',
        basePrice: 2.0,
      },
    });

    const { token } = issueToken('manager', { name: 'Manager Alice', telegramUserId: 'mgr-1' });

    const res = await request(app)
      .put(`/api/catalog/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ basePrice: 2.50 });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_PRICE_UPDATE', entityId: item.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('manager');
    expect(logs[0].actorName).toBe('Manager Alice');
    expect(logs[0].entityType).toBe('menu_item');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ basePrice: 2.0 });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ basePrice: 2.5 });
  });

  it('records ITEM_UPDATE when manager updates name or other attributes without basePrice', async () => {
    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Original Milk Tea',
        basePrice: 2.0,
      },
    });

    const { token } = issueToken('manager', { name: 'Manager Bob', telegramUserId: 'mgr-2' });

    const res = await request(app)
      .put(`/api/catalog/${item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Milk Tea', description: 'Freshly brewed' });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_UPDATE', entityId: item.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('manager');
    expect(logs[0].actorName).toBe('Manager Bob');
    expect(logs[0].entityType).toBe('menu_item');
    expect(JSON.parse(logs[0].oldValue!)).toMatchObject({ name: 'Original Milk Tea' });
    expect(JSON.parse(logs[0].newValue!)).toMatchObject({ name: 'Renamed Milk Tea', description: 'Freshly brewed' });

    const priceLogs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_PRICE_UPDATE', entityId: item.id },
    });
    expect(priceLogs).toHaveLength(0);
  });

  it('records ITEM_SOLD_OUT_TOGGLED when staff toggles sold-out status', async () => {
    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Milk Tea',
        name: 'Sold Out Tea',
        basePrice: 2.0,
        isSoldOut: false,
      },
    });

    const { token } = issueToken('staff', { name: 'Staff Charlie', telegramUserId: 'staff-1' });

    const res = await request(app)
      .put(`/api/catalog/${item.id}/sold-out`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isSoldOut: true });
    expect(res.status).toBe(200);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_SOLD_OUT_TOGGLED', entityId: item.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('staff');
    expect(logs[0].actorName).toBe('Staff Charlie');
    expect(logs[0].entityType).toBe('menu_item');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ isSoldOut: false });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ isSoldOut: true });
  });

  it('records ITEM_DELETED when manager deletes an un-ordered item', async () => {
    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Snack',
        name: 'Temporary Snack',
        basePrice: 1.5,
      },
    });

    const { token } = issueToken('manager', { name: 'Manager Dan', telegramUserId: 'mgr-3' });

    const res = await request(app)
      .delete(`/api/catalog/${item.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_DELETED', entityId: item.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('manager');
    expect(logs[0].actorName).toBe('Manager Dan');
    expect(logs[0].entityType).toBe('menu_item');
    expect(JSON.parse(logs[0].oldValue!)).toMatchObject({ name: 'Temporary Snack', basePrice: 1.5 });
  });

  it('records ITEM_ARCHIVED when manager deletes an item with order history (soft delete)', async () => {
    const item = await prisma.menuItem.create({
      data: {
        brand: 'ai-cha',
        category: 'Snack',
        name: 'Ordered Snack',
        basePrice: 1.5,
      },
    });

    await prisma.order.create({
      data: {
        totalAmount: 1.5,
        pickupCode: '999',
        status: 'completed',
        orderType: 'pickup',
        paymentMethod: 'cash',
        items: {
          create: [{
            menuItemId: item.id,
            price: 1.5,
            quantity: 1,
            modifiers: '{}',
          }],
        },
      },
    });

    const { token } = issueToken('manager', { name: 'Manager Dan', telegramUserId: 'mgr-3' });

    const res = await request(app)
      .delete(`/api/catalog/${item.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.softDeleted).toBe(true);

    const logs = await prisma.auditLog.findMany({
      where: { action: 'ITEM_ARCHIVED', entityId: item.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorType).toBe('manager');
    expect(logs[0].actorName).toBe('Manager Dan');
    expect(logs[0].entityType).toBe('menu_item');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ isActive: true });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ isActive: false });
  });
});


