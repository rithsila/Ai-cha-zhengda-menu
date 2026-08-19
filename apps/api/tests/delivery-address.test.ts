import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';

const app = createApp();
const uid = `addr-${randomUUID()}`;
const itemId = `addr-item-${randomUUID()}`;

const VALID = { contactName: 'Sok Dara', phoneNumber: '+85512345678', building: 'G', roomNumber: '1110' };
const ORDER_ITEMS = [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }];

beforeAll(async () => {
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Address Tea', basePrice: 3.0 },
  });
});

describe('PUT /api/user/:id/profile', () => {
  it('saves a valid Arakawa address', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.building).toBe('G');
    expect(res.body.roomNumber).toBe('1110');
    expect(res.body.contactName).toBe('Sok Dara');
    expect(res.body.phoneNumber).toBe('+85512345678');
  });

  it('upper-cases the building letter', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send({ building: 'c' });
    expect(res.status).toBe(200);
    expect(res.body.building).toBe('C');
    await request(app).put(`/api/user/${uid}/profile`).send({ building: 'G' });
  });

  it('rejects a building outside A-G', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send({ ...VALID, building: 'H' });
    expect(res.status).toBe(400);
  });

  it('rejects a floor above 22', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send({ ...VALID, roomNumber: '2301' });
    expect(res.status).toBe(400);
  });

  it('rejects a ground-floor room (there are none)', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send({ ...VALID, roomNumber: '0010' });
    expect(res.status).toBe(400);
  });

  it('rejects a room that is not 4 digits', async () => {
    for (const roomNumber of ['abc1', '111', '11101']) {
      const res = await request(app).put(`/api/user/${uid}/profile`).send({ ...VALID, roomNumber });
      expect(res.status).toBe(400);
    }
  });

  it('rejects an empty name and a short phone number', async () => {
    expect((await request(app).put(`/api/user/${uid}/profile`).send({ contactName: ' ' })).status).toBe(400);
    expect((await request(app).put(`/api/user/${uid}/profile`).send({ phoneNumber: '12345' })).status).toBe(400);
  });

  it('leaves untouched fields alone', async () => {
    const res = await request(app).put(`/api/user/${uid}/profile`).send({ roomNumber: '0105' });
    expect(res.status).toBe(200);
    expect(res.body.roomNumber).toBe('0105');
    expect(res.body.phoneNumber).toBe('+85512345678'); // still there
    await request(app).put(`/api/user/${uid}/profile`).send({ roomNumber: '1110' });
  });
});

describe('POST /api/orders — delivery', () => {
  it('falls back to the saved profile when the body has no address', async () => {
    const res = await request(app).post('/api/orders').send({
      items: ORDER_ITEMS, paymentMethod: 'cash', orderType: 'delivery', telegramUserId: uid,
    });
    expect(res.status).toBe(200);
    expect(res.body.deliveryAddress).toContain('G1110');
    expect(res.body.deliveryBuilding).toBe('G');
    expect(res.body.deliveryRoom).toBe('1110');
    expect(res.body.contactPhone).toBe('+85512345678');
    expect(res.body.deliveryFee).toBe(0);
  });

  it('rejects a delivery order with no address anywhere', async () => {
    const res = await request(app).post('/api/orders').send({
      items: ORDER_ITEMS, paymentMethod: 'cash', orderType: 'delivery',
      telegramUserId: `no-addr-${randomUUID()}`,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid room sent in the body', async () => {
    const res = await request(app).post('/api/orders').send({
      items: ORDER_ITEMS, paymentMethod: 'cash', orderType: 'delivery', telegramUserId: uid,
      building: 'G', roomNumber: '2301', contactName: 'Sok Dara', contactPhone: '+85512345678',
    });
    expect(res.status).toBe(400);
  });

  it('ignores a deliveryAddress string sent by the client', async () => {
    const res = await request(app).post('/api/orders').send({
      items: ORDER_ITEMS, paymentMethod: 'cash', orderType: 'delivery', telegramUserId: uid,
      deliveryAddress: 'Somewhere else entirely',
    });
    expect(res.status).toBe(200);
    expect(res.body.deliveryAddress).toContain('G1110');
    expect(res.body.deliveryAddress).not.toContain('Somewhere else');
  });

  it('keeps a pickup order free of delivery details', async () => {
    const res = await request(app).post('/api/orders').send({
      items: ORDER_ITEMS, paymentMethod: 'cash', orderType: 'pickup', telegramUserId: uid,
    });
    expect(res.status).toBe(200);
    expect(res.body.deliveryAddress).toBeNull();
    expect(res.body.deliveryFee).toBe(0);
  });
});
