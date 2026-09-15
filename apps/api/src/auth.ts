import { randomUUID, randomInt, timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { redis } from './redis';

export type StaffRole = 'staff' | 'manager';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * In-memory staff sessions. Restarting the API logs everyone out, which is
 * acceptable for a single-server shop deployment and keeps tokens out of the DB.
 */
const sessions = new Map<string, { role: StaffRole; expiresAt: number; name?: string; telegramUserId?: string; phoneNumber?: string; id?: string }>();

export const staffTelegramIds = () =>
  (process.env.STAFF_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => id.replace(/["']/g, '').trim())
    .filter(Boolean);

export const adminTelegramIds = () => {
  const raw = `${process.env.ADMIN_TELEGRAM_IDS || ''},${process.env.ADMIN_TELEGRAM_ID || ''},${process.env.MANAGER_TELEGRAM_IDS || ''}`;
  return raw
    .split(',')
    .map((id) => id.replace(/[@"']/g, '').trim())
    .filter(Boolean);
};

export const adminTelegramUsernames = () => {
  const raw = `${process.env.ADMIN_TELEGRAM_USERNAMES || ''},${process.env.ADMIN_USERNAMES || ''},${process.env.ADMIN_USERNAME || ''},${process.env.ADMIN_TELEGRAM_IDS || ''},${process.env.ADMIN_TELEGRAM_ID || ''}`;
  return raw
    .split(',')
    .map((u) => u.replace(/[@"']/g, '').trim().toLowerCase())
    .filter(Boolean);
};

export const adminPhoneNumbers = () => {
  const raw = `${process.env.ADMIN_PHONE_NUMBERS || ''},${process.env.ADMIN_PHONE || ''},${process.env.MANAGER_PHONE_NUMBERS || ''}`;
  return raw
    .split(',')
    .map((p) => canonicalPhone(p.replace(/["']/g, '').trim()))
    .filter(Boolean);
};

export function canonicalPhone(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('855')) return `+${digits}`;
  if (digits.startsWith('0')) return `+855${digits.slice(1)}`;
  return `+${digits}`;
}

export const managerTelegramIds = adminTelegramIds;

export function roleForTelegramId(telegramUserId: string): StaffRole | null {
  const admins = adminTelegramIds();
  if (admins.includes(telegramUserId)) return 'manager';
  const staff = staffTelegramIds();
  if (staff.includes(telegramUserId)) return 'staff';
  return null;
}

export async function resolveStaffAccount(
  telegramUserId: string,
  prisma: any,
  username?: string
): Promise<{ role: StaffRole; name: string } | null> {
  const cleanId = String(telegramUserId).replace(/[@"']/g, '').trim();
  const admins = adminTelegramIds();
  if (admins.includes(cleanId)) {
    return { role: 'manager', name: 'Admin' };
  }

  if (username) {
    const cleanUser = username.replace(/[@"']/g, '').trim().toLowerCase();
    const adminUsers = adminTelegramUsernames();
    if (adminUsers.includes(cleanUser)) {
      return { role: 'manager', name: username };
    }
  }

  // Also check if cleanId matches an admin username string
  const adminUsers = adminTelegramUsernames();
  if (adminUsers.includes(cleanId.toLowerCase())) {
    return { role: 'manager', name: 'Admin' };
  }

  try {
    const account = await prisma.staffAccount.findUnique({
      where: { telegramUserId },
    });
    if (account && account.isActive) {
      return { role: (account.role === 'manager' ? 'manager' : 'staff') as StaffRole, name: account.name };
    }
  } catch (err) {
    console.error('Error fetching staff account:', err);
  }

  const staff = staffTelegramIds();
  if (staff.includes(telegramUserId)) {
    return { role: 'staff', name: 'Staff' };
  }

  return null;
}

export async function resolveStaffByPhone(
  rawPhone: string,
  prisma: any
): Promise<{ role: StaffRole; name: string; phoneNumber: string; telegramUserId?: string | null; id?: string } | null> {
  const phone = canonicalPhone(rawPhone);
  if (!phone) return null;

  const admins = adminPhoneNumbers();
  if (admins.includes(phone)) {
    return { role: 'manager', name: 'Admin', phoneNumber: phone };
  }

  try {
    // Check exact canonical match or without plus
    const withoutPlus = phone.replace(/^\+/, '');
    const account = await prisma.staffAccount.findFirst({
      where: {
        OR: [
          { phoneNumber: phone },
          { phoneNumber: withoutPlus },
          { phoneNumber: `+${withoutPlus}` },
          { phoneNumber: `0${withoutPlus.replace(/^855/, '')}` },
        ],
        isActive: true,
      },
    });

    if (account) {
      let linkedTelegramId = account.telegramUserId || null;

      // If telegramUserId not in staffAccount, check if linked in customer User table
      if (!linkedTelegramId) {
        const linkedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { phoneNumber: phone },
              { phoneNumber: withoutPlus },
              { phoneNumber: `+${withoutPlus}` },
            ],
          },
        });
        if (linkedUser?.telegramUserId) {
          linkedTelegramId = linkedUser.telegramUserId;
        }
      }

      return {
        role: (account.role === 'manager' ? 'manager' : 'staff') as StaffRole,
        name: account.name,
        phoneNumber: account.phoneNumber || phone,
        telegramUserId: linkedTelegramId,
        id: account.id,
      };
    }
  } catch (err) {
    console.error('Error finding staff by phone:', err);
  }

  return null;
}

// ---------------------------------------------------------------------------
// In-memory OTP storage
// ---------------------------------------------------------------------------
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}



export async function createStaffOtp(rawPhone: string): Promise<{ code: string; allowed: boolean; waitSeconds?: number }> {
  const phone = canonicalPhone(rawPhone);
  const now = Date.now();
  
  const data = await redis.get(`otp:${phone}`);
  const existing = data ? JSON.parse(data) : null;

  // Rate limit: must wait 60 seconds between resends
  if (existing && now - existing.lastSentAt < 60 * 1000) {
    const waitSeconds = Math.ceil((60 * 1000 - (now - existing.lastSentAt)) / 1000);
    return { code: '', allowed: false, waitSeconds };
  }

  const code = randomInt(100000, 1000000).toString();
  await redis.setex(`otp:${phone}`, Math.floor(OTP_TTL_MS / 1000), JSON.stringify({
    code,
    attempts: 0,
    lastSentAt: now,
  }));

  return { code, allowed: true };
}

export async function verifyStaffOtpCode(
  rawPhone: string,
  inputCode: string
): Promise<{ valid: boolean; reason?: string }> {
  const phone = canonicalPhone(rawPhone);
  
  const data = await redis.get(`otp:${phone}`);
  if (!data) {
    return { valid: false, reason: 'No OTP code found for this phone number. Please request a new one.' };
  }

  const entry = JSON.parse(data);

  // Use entry.expiresAt for expiration check, even if Redis handles TTL
  // because we might have fetched it right before it expires, though redis string TTL is usually enough.
  // Actually, wait, the original had entry.expiresAt. 
  // Let's just rely on Redis TTL. Wait, let's keep it if we need it. 
  
  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    await redis.del(`otp:${phone}`);
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP code.' };
  }

  entry.attempts += 1;
  await redis.setex(`otp:${phone}`, Math.floor(OTP_TTL_MS / 1000), JSON.stringify(entry));

  const trimmed = inputCode.trim();
  const isMatch =
    entry.code.length === trimmed.length &&
    timingSafeEqual(Buffer.from(entry.code), Buffer.from(trimmed));

  if (isMatch) {
    await redis.del(`otp:${phone}`);
    return { valid: true };
  }

  return { valid: false, reason: 'Invalid verification code. Please check and try again.' };
}

export async function clearOtps() {
  const keys = await redis.keys('otp:*');
  if (keys.length > 0) await redis.del(...keys);
}

export async function issueToken(role: StaffRole, meta?: { telegramUserId?: string; phoneNumber?: string; name?: string; id?: string }) {
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await redis.setex(`staff_session:${token}`, Math.floor(SESSION_TTL_MS / 1000), JSON.stringify({ role, expiresAt, ...meta }));
  return { token, expiresAt };
}

/** Returns the role for a live token, or null when missing/expired. */
export async function verifyToken(token: string | undefined): Promise<StaffRole | null> {
  if (!token) return null;
  const data = await redis.get(`staff_session:${token}`);
  if (!data) return null;
  const session = JSON.parse(data);
  return session.role;
}

export async function revokeToken(token: string) {
  await redis.del(`staff_session:${token}`);
}

/** Test helper: drop every session. */
export async function clearSessions() {
  const keys = await redis.keys('staff_session:*');
  if (keys.length > 0) await redis.del(keys);
}

function bearerToken(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

/** The staff role behind this request, or null. Used for owner-or-staff checks. */
export async function staffRoleOf(req: { headers: Record<string, unknown> }): Promise<StaffRole | null> {
  return await verifyToken(bearerToken(req.headers.authorization));
}

/** Returns session info for a staff/manager request, or null if unauthenticated. */
export async function getStaffSessionInfo(req: { headers: Record<string, unknown> }): Promise<{ role: StaffRole; name?: string; telegramUserId?: string; phoneNumber?: string; id?: string } | null> {
  const token = bearerToken(req.headers.authorization);
  if (!token) return null;
  const data = await redis.get(`staff_session:${token}`);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Any logged-in staff member (staff or manager).
 *
 * Only a session token is accepted. The old `x-manager-pin` header was a second
 * way in that never expired and was one guessable value away from the whole
 * manager API, so it is gone.
 */
export const requireStaff: RequestHandler = async (req, res, next) => {
  const role = await verifyToken(bearerToken(req.headers.authorization));
  if (role) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/** Manager only — analytics, loyalty, rewards, config. */
export const requireManager: RequestHandler = async (req, res, next) => {
  const role = await verifyToken(bearerToken(req.headers.authorization));
  if (role === 'manager') return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// ---------------------------------------------------------------------------
// Staff login rate limit
//
// A 4-digit PIN falls in seconds if the login route answers as fast as it can.
// Count failures per IP and lock that IP out for a while. In memory, like the
// sessions above: a restart forgives everyone, which is acceptable here.
// ---------------------------------------------------------------------------

const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 minutes



function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Blocks a caller that has already failed too many times. */
export const loginRateLimit: RequestHandler = async (req, res, next) => {
  const key = clientKey(req);
  const data = await redis.get(`login_attempts:${key}`);
  if (data) {
    const entry = JSON.parse(data);
    if (entry.lockedUntil > Date.now()) {
      const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.', retryAfter });
    }
  }
  next();
};

/** Call after a failed login. Locks the IP once it runs out of attempts. */
export async function recordFailedLogin(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  const key = clientKey(req);
  const data = await redis.get(`login_attempts:${key}`);
  const entry = data ? JSON.parse(data) : { failures: 0, lockedUntil: 0 };
  
  entry.failures += 1;
  if (entry.failures >= MAX_FAILED_LOGINS) entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  
  await redis.setex(`login_attempts:${key}`, Math.floor(LOGIN_LOCK_MS / 1000) * 2, JSON.stringify(entry));
}

/** Call after a successful login — a real staff member should not stay locked out. */
export async function clearFailedLogins(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  await redis.del(`login_attempts:${clientKey(req)}`);
}

/** Test helper: forget every failed attempt. */
export async function clearLoginAttempts() {
  const keys = await redis.keys('login_attempts:*');
  if (keys.length > 0) await redis.del(...keys);
}

/** General IP sliding window rate limiter */
export function createRateLimiter(options: { windowMs: number; max: number; message: string }): RequestHandler {
  return async (req, res, next) => {
    // In test environment, skip unless testing rate limiting explicitly
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const key = `ratelimit:${clientKey(req)}:${options.message.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`;
    const now = Date.now();
    
    const data = await redis.get(key);
    const record = data ? JSON.parse(data) : null;

    if (!record || now > record.resetAt) {
      await redis.setex(key, Math.ceil(options.windowMs / 1000), JSON.stringify({ count: 1, resetAt: now + options.windowMs }));
      return next();
    }

    if (record.count >= options.max) {
      const retryAfter = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: options.message, retryAfter });
    }

    record.count += 1;
    await redis.setex(key, Math.ceil((record.resetAt - now) / 1000), JSON.stringify(record));
    next();
  };
}

/** Order creation rate limiter: max 15 orders per minute per IP */
export const orderRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many orders created from your connection. Please wait a minute before placing another order.',
});

/** Feedback submission rate limiter: max 5 messages per 5 minutes per IP */
export const feedbackRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: 'Too many feedback messages submitted. Please wait 5 minutes before sending another report.',
});

