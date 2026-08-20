import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();
let managerToken = '';
const auth = (r: request.Test) => r.set('Authorization', `Bearer ${managerToken}`);

beforeAll(async () => {
  process.env.MANAGER_PIN = '9999';
  const login = await request(app).post('/api/auth/staff-login').send({ pin: '9999', role: 'manager' });
  managerToken = login.body.token;
});

describe('rewards API', () => {
  it('rejects a reward without a name', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ pointsCost: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects empty or whitespace name', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ name: '   ', pointsCost: 100 });
    expect(res.status).toBe(400);
  });

  it('rejects non-positive pointsCost', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ name: 'Free Tea', pointsCost: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects negative pointsCost', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ name: 'Free Tea', pointsCost: -50 });
    expect(res.status).toBe(400);
  });

  it('rejects non-integer pointsCost', async () => {
    const res = await auth(request(app).post('/api/rewards')).send({ name: 'Free Tea', pointsCost: 12.5 });
    expect(res.status).toBe(400);
  });

  it('creates, hides on deactivate, and still shows to managers', async () => {
    const created = await auth(request(app).post('/api/rewards')).send({ name: 'Free Milk Tea', pointsCost: 500 });
    expect(created.status).toBe(200);
    const id = created.body.id;

    await auth(request(app).put(`/api/rewards/${id}`)).send({ isActive: false });

    const publicList = await request(app).get('/api/rewards');
    expect(publicList.body.find((r: any) => r.id === id)).toBeUndefined();

    const managerList = await request(app).get('/api/rewards?includeInactive=1');
    expect(managerList.body.find((r: any) => r.id === id)?.isActive).toBe(false);

    // Reactivate reward
    const reactivated = await auth(request(app).put(`/api/rewards/${id}`)).send({ isActive: true });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.isActive).toBe(true);

    const publicListAfter = await request(app).get('/api/rewards');
    expect(publicListAfter.body.find((r: any) => r.id === id)?.isActive).toBe(true);
  });
});
