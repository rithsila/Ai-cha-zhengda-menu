import crypto from 'crypto';

const MAX_LOGIN_AGE_SECONDS = 24 * 60 * 60;

/** Verify a Telegram Login Widget payload (https://core.telegram.org/widgets/login). */
export function verifyTelegramLogin(data: Record<string, string>, botToken: string): boolean {
  const { hash, ...fields } = data;
  if (!hash || typeof hash !== 'string') return false;

  const checkString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export function isLoginFresh(authDate: string | undefined): boolean {
  const ts = Number(authDate);
  return Number.isFinite(ts) && Date.now() / 1000 - ts <= MAX_LOGIN_AGE_SECONDS;
}
