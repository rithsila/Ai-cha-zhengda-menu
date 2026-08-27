import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { clearSessions, clearLoginAttempts, clearOtps, issueToken } from '../src/auth';

const app = createApp();

describe('Staff Phone Number & OTP Authentication (Plasgate)', () => {
  beforeEach(async () => {
    clearSessions();
    clearLoginAttempts();
    clearOtps();
    await prisma.staffAccount.deleteMany();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects OTP request for unauthorized phone number', async () => {
    const res = await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '+85512999999' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not authorized/i);
  });

  it('sends OTP code for admin-authorized staff phone number', async () => {
    // 1. Create authorized staff in database
    await prisma.staffAccount.create({
      data: {
        name: 'Sokha Staff',
        phoneNumber: '+85512345678',
        role: 'staff',
        isActive: true,
      },
    });

    // 2. Request OTP
    const sendRes = await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '012345678' }); // tests phone normalization

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.ok).toBe(true);
  });

  it('calls Plasgate REST API when credentials are provided', async () => {
    process.env.PLASGATE_PRIVATE_KEY = 'test_private_key';
    process.env.PLASGATE_SECRET_KEY = 'test_secret_key';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).includes('cloudapi.plasgate.com/rest/send')) {
        return new Response(JSON.stringify({ status: 'success', id: 'plasgate-123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    await prisma.staffAccount.create({
      data: {
        name: 'Sokha Staff',
        phoneNumber: '+85570433443',
        role: 'staff',
        isActive: true,
      },
    });

    const sendRes = await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '070433443' });

    expect(sendRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalled();
    const calledUrl = fetchSpy.mock.calls[0][0];
    expect(String(calledUrl)).toContain('cloudapi.plasgate.com/rest/send?private_key=test_private_key');

    delete process.env.PLASGATE_PRIVATE_KEY;
    delete process.env.PLASGATE_SECRET_KEY;
  });

  it('handles Plasgate error object cleanly without showing [object Object]', async () => {
    process.env.PLASGATE_PRIVATE_KEY = 'test_private_key';
    process.env.PLASGATE_SECRET_KEY = 'test_secret_key';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ message: { sender: 'Invalid sender' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await prisma.staffAccount.create({
      data: {
        name: 'Sokha Staff',
        phoneNumber: '+85570433443',
        role: 'staff',
        isActive: true,
      },
    });

    const sendRes = await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '070433443' });

    expect(sendRes.status).toBe(500);
    expect(typeof sendRes.body.error).toBe('string');
    expect(sendRes.body.error).toContain('sender: Invalid sender');

    delete process.env.PLASGATE_PRIVATE_KEY;
    delete process.env.PLASGATE_SECRET_KEY;
  });

  it('rejects invalid or wrong OTP code', async () => {
    await prisma.staffAccount.create({
      data: {
        name: 'Sokha Staff',
        phoneNumber: '+85512345678',
        role: 'staff',
        isActive: true,
      },
    });

    await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '+85512345678' });

    const verifyRes = await request(app)
      .post('/api/auth/staff/verify-otp')
      .send({ phoneNumber: '+85512345678', code: '000000' });

    expect(verifyRes.status).toBe(400);
    expect(verifyRes.body.error).toMatch(/Invalid verification code/i);
  });

  it('allows manager to create staff account with phone number and login', async () => {
    const { token: managerToken } = issueToken('manager');

    // Create staff account with phone
    const createRes = await request(app)
      .post('/api/staff-accounts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Dara Manager',
        phoneNumber: '+85598765432',
        role: 'manager',
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.name).toBe('Dara Manager');
    expect(createRes.body.phoneNumber).toBe('+85598765432');

    // Send OTP
    const sendRes = await request(app)
      .post('/api/auth/staff/send-otp')
      .send({ phoneNumber: '+85598765432' });

    expect(sendRes.status).toBe(200);
  });
});
