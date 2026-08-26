import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { issueToken } from '../src/auth';

const app = createApp();
const uid = `test-${randomUUID()}`;

let managerToken = '';
const managerAuth = () => ({ Authorization: `Bearer ${managerToken}` });

beforeAll(async () => {
  managerToken = issueToken('manager').token;
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: 50 } });
});

describe('GET /api/users/:id (find-only)', () => {
  it('returns 401 without a manager token', async () => {
    const res = await request(app).get(`/api/users/${uid}`);
    expect(res.status).toBe(401);
  });
  it('returns 404 for unknown user', async () => {
    const res = await request(app)
      .get(`/api/users/no-such-${randomUUID()}`)
      .set(managerAuth());
    expect(res.status).toBe(404);
  });
  it('returns an existing user', async () => {
    const res = await request(app).get(`/api/users/${uid}`).set(managerAuth());
    expect(res.status).toBe(200);
    expect(res.body.loyaltyPoints).toBe(50);
  });
});

describe('PUT /api/users/:id/points validation', () => {
  const put = (body: unknown) =>
    request(app).put(`/api/users/${uid}/points`).set(managerAuth()).send(body as object);

  it('rejects negative points', async () => {
    expect((await put({ points: -500 })).status).toBe(400);
  });
  it('rejects non-integer points', async () => {
    expect((await put({ points: 1.5 })).status).toBe(400);
  });
  it('rejects string points', async () => {
    expect((await put({ points: 'abc' })).status).toBe(400);
  });
  it('accepts a valid value', async () => {
    const res = await put({ points: 120 });
    expect(res.status).toBe(200);
    expect(res.body.loyaltyPoints).toBe(120);
  });
});
