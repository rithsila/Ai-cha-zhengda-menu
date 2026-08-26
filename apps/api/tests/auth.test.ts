import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { clearSessions, clearLoginAttempts, issueToken, verifyToken } from '../src/auth';

const app = createApp();
let managerToken = '';

beforeAll(async () => {
  clearSessions();
  const session = issueToken('manager');
  managerToken = session.token;
});

describe('Staff Token Authentication', () => {
  it('issues valid token with role', () => {
    const staffSession = issueToken('staff');
    expect(verifyToken(staffSession.token)).toBe('staff');
  });

  it('verifies manager token correctly', () => {
    const mgrSession = issueToken('manager');
    expect(verifyToken(mgrSession.token)).toBe('manager');
  });

  it('rejects invalid or missing token', () => {
    expect(verifyToken('non-existent-token')).toBeNull();
    expect(verifyToken(undefined)).toBeNull();
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
