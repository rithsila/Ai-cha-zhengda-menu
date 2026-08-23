import { randomUUID } from 'crypto';
import type { RequestHandler } from 'express';

export type StaffRole = 'staff' | 'manager';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * In-memory staff sessions. Restarting the API logs everyone out, which is
 * acceptable for a single-server shop deployment and keeps tokens out of the DB.
 */
const sessions = new Map<string, { role: StaffRole; expiresAt: number }>();

export const staffPin = () => process.env.STAFF_PIN || '1234';
export const managerPin = () => process.env.MANAGER_PIN || '9999';

export const staffTelegramIds = () =>
  (process.env.STAFF_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

export const adminTelegramIds = () => {
  const raw = `${process.env.ADMIN_TELEGRAM_IDS || ''},${process.env.ADMIN_TELEGRAM_ID || ''},${process.env.MANAGER_TELEGRAM_IDS || ''}`;
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

export const managerTelegramIds = adminTelegramIds;

export function roleForTelegramId(telegramUserId: string): StaffRole | null {
  const admins = adminTelegramIds();
  if (admins.includes(telegramUserId)) return 'manager';
  const staff = staffTelegramIds();
  if (staff.includes(telegramUserId)) return 'staff';
  return null;
}

export async function resolveStaffAccount(telegramUserId: string, prisma: any): Promise<{ role: StaffRole; name: string } | null> {
  const admins = adminTelegramIds();
  if (admins.includes(telegramUserId)) {
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

export function issueToken(role: StaffRole, meta?: { telegramUserId?: string; name?: string }) {
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

/** Call after a wrong PIN. Locks the IP once it runs out of attempts. */
export function recordFailedLogin(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  const key = clientKey(req);
  const entry = loginAttempts.get(key) ?? { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_FAILED_LOGINS) entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  loginAttempts.set(key, entry);
}

/** Call after a correct PIN — a real staff member should not stay locked out. */
export function clearFailedLogins(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  loginAttempts.delete(clientKey(req));
}

/** Test helper: forget every failed attempt. */
export function clearLoginAttempts() {
  loginAttempts.clear();
}

/**
 * Boot check. In production a missing PIN must stop the server, because the
 * fallback would silently be the published default (1234 / 9999).
 */
export function assertPinsConfigured() {
  const missing = ['STAFF_PIN', 'MANAGER_PIN'].filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Refusing to start: ${missing.join(' and ')} must be set in production. ` +
      'Without them the dashboard would accept the default PINs 1234 / 9999.'
    );
  }
  console.warn(
    `WARNING: ${missing.join(' and ')} not set — using the development default PINs ` +
    '(staff 1234, manager 9999). Set real PINs before deploying.'
  );
}
