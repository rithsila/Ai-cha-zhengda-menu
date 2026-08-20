import crypto, { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

/**
 * Customer identity.
 *
 * A request proves who the customer is in one of two ways:
 *   - `X-Telegram-Init-Data: <WebApp.initData>` — the raw string Telegram hands
 *     the Mini App. It is signed with the bot token, so it cannot be forged.
 *   - `Authorization: Bearer <customerToken>` — issued by
 *     GET /api/auth/telegram/callback after the Login Widget HMAC check.
 *
 * Never trust a telegram user id that arrives in a body or a URL on its own.
 */

const MAX_INITDATA_AGE_SECONDS = 24 * 60 * 60;
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type TelegramInitDataUser = {
  id: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
};

/**
 * Verify a Telegram **Mini App** initData string
 * (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 *
 * Note this is NOT the Login Widget algorithm in telegram-auth.ts: here the
 * secret key is HMAC_SHA256("WebAppData", botToken), there it is SHA256(botToken).
 *
 * Returns the parsed `user` object, or null when anything does not check out.
 */
export function verifyInitData(initData: string, botToken: string): TelegramInitDataUser | null {
  if (!initData || typeof initData !== 'string' || !botToken) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  // timingSafeEqual throws on a length mismatch, which would surface as a 500.
  // Checking the shape first keeps a malformed hash a plain "not authorised".
  if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(hash.toLowerCase(), 'hex');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  // A signature stays valid forever, so an old initData string copied off one
  // device would work for good. Expire it like a login.
  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate)) return null;
  if (Date.now() / 1000 - authDate > MAX_INITDATA_AGE_SECONDS) return null;

  const rawUser = params.get('user');
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser) as TelegramInitDataUser;
    if (!user || user.id === undefined || user.id === null || user.id === '') return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * In-memory customer sessions, same pattern as the staff sessions in auth.ts:
 * a restart logs everyone out, which is fine for a single-server shop and keeps
 * tokens out of the database.
 */
const customerSessions = new Map<string, { telegramUserId: string; expiresAt: number }>();

export function issueCustomerToken(telegramUserId: string) {
  const token = randomUUID();
  const expiresAt = Date.now() + CUSTOMER_SESSION_TTL_MS;
  customerSessions.set(token, { telegramUserId, expiresAt });
  return { token, expiresAt };
}

/** Returns the telegram user id for a live token, or null when missing/expired. */
export function verifyCustomerToken(token: string | undefined): string | null {
  if (!token) return null;
  const session = customerSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    customerSessions.delete(token);
    return null;
  }
  return session.telegramUserId;
}

export function revokeCustomerToken(token: string) {
  customerSessions.delete(token);
}

/** Test helper: drop every customer session. */
export function clearCustomerSessions() {
  customerSessions.clear();
}

function bearerToken(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

/**
 * Development escape hatch: with no bot token there is nothing to verify a
 * signature against, so a local machine may opt in to a plain
 * `X-Telegram-User-Id` header. Three conditions must all hold, and one of them
 * is "not production", so no environment variable can turn this on in prod.
 */
export function devIdentityAllowed(): boolean {
  return (
    !process.env.TELEGRAM_BOT_TOKEN &&
    process.env.ALLOW_UNVERIFIED_TELEGRAM === '1' &&
    process.env.NODE_ENV !== 'production'
  );
}

let warned = false;

/** Print the loud warning once, at startup. */
export function warnIfDevIdentityAllowed() {
  if (warned || !devIdentityAllowed()) return;
  warned = true;
  console.warn(
    '\n**************************************************************\n' +
    '* ALLOW_UNVERIFIED_TELEGRAM=1 — the API trusts a plain        *\n' +
    '* X-Telegram-User-Id header. ANY caller can act as ANY        *\n' +
    '* customer. Development only. Never set this in production.   *\n' +
    '**************************************************************\n'
  );
}

/** The verified telegram user id for this request, or null when anonymous. */
export function resolveTelegramUserId(req: {
  headers: Record<string, unknown>;
}): string | null {
  const initData = req.headers['x-telegram-init-data'];
  if (typeof initData === 'string' && initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const user = verifyInitData(initData, botToken);
    // A failed check is not fatal on its own — the caller may also be carrying
    // a login token. Each path is verified separately, so trying the next one
    // gives nothing away.
    if (user) return String(user.id);
  }

  const token = bearerToken(req.headers.authorization);
  const fromToken = verifyCustomerToken(token);
  if (fromToken) return fromToken;

  if (devIdentityAllowed()) {
    const devId = req.headers['x-telegram-user-id'];
    if (typeof devId === 'string' && devId.trim()) return devId.trim();
  }

  return null;
}

/** Attaches `req.telegramUserId` when the caller proved who they are. Never blocks. */
export const resolveCustomer: RequestHandler = (req, res, next) => {
  (req as any).telegramUserId = resolveTelegramUserId(req as any);
  next();
};

/** Customer routes: the caller must have proved who they are. */
export const requireCustomer: RequestHandler = (req, res, next) => {
  const id = resolveTelegramUserId(req as any);
  if (!id) return res.status(401).json({ error: 'Telegram sign-in required' });
  (req as any).telegramUserId = id;
  next();
};

/**
 * Customer routes keyed by a path id: it must be the caller's own id.
 *
 * "me" is accepted as an alias for that id. A browser that signed in through the
 * Login Widget only ever receives a session token (see the callback redirect), so
 * it never learns its own numeric Telegram id and has nothing else to put in the
 * path. The id is only ever taken from the verified identity, never from the URL.
 */
export const requireSelf: RequestHandler = (req, res, next) => {
  const id = (req as any).telegramUserId as string | undefined;
  if (!id) return res.status(401).json({ error: 'Telegram sign-in required' });
  const asked = String(req.params.telegramUserId);
  if (asked !== 'me' && asked !== id) {
    return res.status(403).json({ error: 'You can only access your own account' });
  }
  // Downstream handlers read the path param, so rewrite the alias to the real id.
  req.params.telegramUserId = id;
  next();
};
