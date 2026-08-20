import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { clearLoginAttempts } from '../src/auth';

const app = createApp();
let managerToken = '';

beforeAll(async () => {
  process.env.STAFF_PIN = '1234';
  process.env.MANAGER_PIN = '9999';
  const login = await request(app).post('/api/auth/staff-login').send({ pin: '9999', role: 'manager' });
  managerToken = login.body.token;
});

describe('POST /api/auth/staff-login', () => {
  it('accepts correct staff pin', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '1234', role: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
  it('rejects wrong manager pin', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '0000', role: 'manager' });
    expect(res.status).toBe(401);
    clearLoginAttempts(); // do not let this one failure creep towards the lockout
  });
  it('rejects missing role', async () => {
    const res = await request(app).post('/api/auth/staff-login').send({ pin: '1234' });
    expect(res.status).toBe(400);
  });
});

describe('manager-protected routes', () => {
  it('blocks PUT /api/config without a token', async () => {
    const res = await request(app).put('/api/config').send({ key: 'pointsPerDollar', value: '100' });
    expect(res.status).toBe(401);
  });
  it('allows PUT /api/config with a manager token', async () => {
    const res = await request(app).put('/api/config')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ key: 'pointsPerDollar', value: '100' });
    expect(res.status).toBe(200);
  });
  it('blocks GET /api/analytics/sales without a token', async () => {
    const res = await request(app).get('/api/analytics/sales');
    expect(res.status).toBe(401);
  });
});
