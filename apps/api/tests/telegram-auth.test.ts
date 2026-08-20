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
