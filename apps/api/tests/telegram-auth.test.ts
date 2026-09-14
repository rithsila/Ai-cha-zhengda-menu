import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { verifyTelegramLogin } from '../src/telegram-auth';

const app = createApp();
const BOT_TOKEN = 'test-bot-token-123';

function signLogin(fields: Record<string, string>, botToken: string) {
  const checkString = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  return { ...fields, hash };
}

beforeAll(() => { process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN; });

describe('verifyTelegramLogin', () => {
  const fields = { id: '42', first_name: 'Test', auth_date: String(Math.floor(Date.now() / 1000)) };

  it('accepts a correctly signed payload', () => {
    expect(verifyTelegramLogin(signLogin(fields, BOT_TOKEN), BOT_TOKEN)).toBe(true);
  });
  it('rejects a tampered payload', () => {
    const signed = signLogin(fields, BOT_TOKEN);
    expect(verifyTelegramLogin({ ...signed, id: '43' }, BOT_TOKEN)).toBe(false);
  });
  it('rejects a missing hash', () => {
    expect(verifyTelegramLogin(fields as any, BOT_TOKEN)).toBe(false);
  });
});

describe('GET /api/auth/telegram/callback', () => {
  it('redirects with a customer token on valid login', async () => {
    const signed = signLogin(
      { id: '4242', first_name: 'Web', auth_date: String(Math.floor(Date.now() / 1000)) },
      BOT_TOKEN
    );
    const res = await request(app).get('/api/auth/telegram/callback').query(signed);
    expect(res.status).toBe(302);
    // A raw id in the URL is only a claim; the callback hands back a session token.
    expect(res.headers.location).toContain('#tg_token=');
    expect(res.headers.location).not.toContain('#tg_id=');
  });
  it('rejects an invalid hash', async () => {
    const res = await request(app).get('/api/auth/telegram/callback')
      .query({ id: '1', auth_date: String(Math.floor(Date.now() / 1000)), hash: 'bad' });
    expect(res.status).toBe(401);
  });
  it('rejects an expired login', async () => {
    const signed = signLogin({ id: '1', auth_date: '1000000' }, BOT_TOKEN); // 2001
    const res = await request(app).get('/api/auth/telegram/callback').query(signed);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/staff-telegram/callback', () => {
  it('returns 503 without a bot token even when not in production', async () => {
    const saved = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    try {
      const res = await request(app).get('/api/auth/staff-telegram/callback').query({ id: '99999' });
      expect(res.status).toBe(503);
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = saved;
    }
  });
  it('rejects an unsigned id', async () => {
    const res = await request(app).get('/api/auth/staff-telegram/callback')
      .query({ id: '99999', auth_date: String(Math.floor(Date.now() / 1000)), hash: 'bad' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/staff-telegram-login', () => {
  const freshAuth = (id: string) =>
    signLogin({ id, first_name: 'First', auth_date: String(Math.floor(Date.now() / 1000)) }, BOT_TOKEN);

  it('does not bootstrap the first verified caller as manager without BOOTSTRAP_MANAGER_TELEGRAM_ID', async () => {
    const saved = { ...process.env };
    delete process.env.BOOTSTRAP_MANAGER_TELEGRAM_ID;
    delete process.env.ALLOW_UNVERIFIED_TELEGRAM;
    delete process.env.ADMIN_TELEGRAM_IDS;
    delete process.env.MANAGER_TELEGRAM_IDS;
    delete process.env.ADMIN_TELEGRAM_USERNAMES;
    try {
      const res = await request(app)
        .post('/api/auth/staff-telegram-login')
        .send({ telegramAuth: freshAuth('777001') });
      expect(res.status).toBe(403);
    } finally {
      process.env = saved;
    }
  });

  it('bootstraps only the configured BOOTSTRAP_MANAGER_TELEGRAM_ID', async () => {
    const saved = { ...process.env };
    process.env.BOOTSTRAP_MANAGER_TELEGRAM_ID = '777002';
    delete process.env.ALLOW_UNVERIFIED_TELEGRAM;
    try {
      const other = await request(app)
        .post('/api/auth/staff-telegram-login')
        .send({ telegramAuth: freshAuth('777003') });
      expect(other.status).toBe(403);

      const { prisma } = await import('../src/db');
      const totalStaff = await prisma.staffAccount.count();
      const res = await request(app)
        .post('/api/auth/staff-telegram-login')
        .send({ telegramAuth: freshAuth('777002') });
      if (totalStaff === 0) {
        expect(res.status).toBe(200);
        expect(res.body.role).toBe('manager');
        await prisma.staffAccount.deleteMany({ where: { telegramUserId: '777002' } });
      } else {
        expect(res.status).toBe(403);
      }
    } finally {
      process.env = saved;
    }
  });

  it('rejects raw unverified telegramUserId without signature', async () => {
    const res = await request(app)
      .post('/api/auth/staff-telegram-login')
      .send({ telegramUserId: '99999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/valid telegram sign-in is required/i);
  });

  it('rejects tampered telegramAuth signature', async () => {
    const fields = { id: '99999', first_name: 'Admin', auth_date: String(Math.floor(Date.now() / 1000)) };
    const signed = signLogin(fields, BOT_TOKEN);
    const res = await request(app)
      .post('/api/auth/staff-telegram-login')
      .send({ telegramAuth: { ...signed, id: '88888' } });
    expect(res.status).toBe(401);
  });
});
