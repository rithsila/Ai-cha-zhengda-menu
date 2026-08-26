import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

export type StaffRole = 'staff' | 'manager';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * In-memory staff sessions. Restarting the API logs everyone out, which is
 * acceptable for a single-server shop deployment and keeps tokens out of the DB.
 */
const sessions = new Map<string, { role: StaffRole; expiresAt: number }>();

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

const phoneOtps = new Map<string, OtpEntry>();

export function createStaffOtp(rawPhone: string): { code: string; allowed: boolean; waitSeconds?: number } {
  const phone = canonicalPhone(rawPhone);
  const now = Date.now();
  const existing = phoneOtps.get(phone);

  // Rate limit: must wait 60 seconds between resends
  if (existing && now - existing.lastSentAt < 60 * 1000) {
    const waitSeconds = Math.ceil((60 * 1000 - (now - existing.lastSentAt)) / 1000);
    return { code: '', allowed: false, waitSeconds };
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  phoneOtps.set(phone, {
    code,
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: now,
  });

  return { code, allowed: true };
}

export function verifyStaffOtpCode(
  rawPhone: string,
  inputCode: string
): { valid: boolean; reason?: string } {
  const phone = canonicalPhone(rawPhone);
  const entry = phoneOtps.get(phone);

  if (!entry) {
    return { valid: false, reason: 'No OTP code found for this phone number. Please request a new one.' };
  }

  if (Date.now() > entry.expiresAt) {
    phoneOtps.delete(phone);
    return { valid: false, reason: 'OTP code has expired. Please request a new one.' };
  }

  if (entry.attempts >= MAX_OTP_ATTEMPTS) {
    phoneOtps.delete(phone);
    return { valid: false, reason: 'Too many failed attempts. Please request a new OTP code.' };
  }

  entry.attempts += 1;

  if (entry.code === inputCode.trim()) {
    phoneOtps.delete(phone);
    return { valid: true };
  }

  return { valid: false, reason: 'Invalid verification code. Please check and try again.' };
}

export function clearOtps() {
  phoneOtps.clear();
}

export function issueToken(role: StaffRole, meta?: { telegramUserId?: string; phoneNumber?: string; name?: string }) {
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { role, expiresAt, ...meta });
  return { token, expiresAt };
}

/** Returns the role for a live token, or null when missing/expired. */
export function verifyToken(token: string | undefined): StaffRole | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.role;
}

export function revokeToken(token: string) {
  sessions.delete(token);
}

/** Test helper: drop every session. */
export function clearSessions() {
  sessions.clear();
}

function bearerToken(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : undefined;
}

/** The staff role behind this request, or null. Used for owner-or-staff checks. */
export function staffRoleOf(req: { headers: Record<string, unknown> }): StaffRole | null {
  return verifyToken(bearerToken(req.headers.authorization));
}

/**
 * Any logged-in staff member (staff or manager).
 *
 * Only a session token is accepted. The old `x-manager-pin` header was a second
 * way in that never expired and was one guessable value away from the whole
 * manager API, so it is gone.
 */
export const requireStaff: RequestHandler = (req, res, next) => {
  const role = verifyToken(bearerToken(req.headers.authorization));
  if (role) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/** Manager only — analytics, loyalty, rewards, config. */
export const requireManager: RequestHandler = (req, res, next) => {
  const role = verifyToken(bearerToken(req.headers.authorization));
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

const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();

function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Blocks a caller that has already failed too many times. */
export const loginRateLimit: RequestHandler = (req, res, next) => {
  const entry = loginAttempts.get(clientKey(req));
  if (entry && entry.lockedUntil > Date.now()) {
    const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.', retryAfter });
  }
  next();
};

/** Call after a failed login. Locks the IP once it runs out of attempts. */
export function recordFailedLogin(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  const key = clientKey(req);
  const entry = loginAttempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILED_LOGINS) entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  loginAttempts.set(key, entry);
}

/** Call after a successful login — a real staff member should not stay locked out. */
export function clearFailedLogins(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  loginAttempts.delete(clientKey(req));
}

/** Test helper: forget every failed attempt. */
export function clearLoginAttempts() {
  loginAttempts.clear();
}

