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

export function issueToken(role: StaffRole) {
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { role, expiresAt });
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

/** Any logged-in staff member (staff or manager). */
export const requireStaff: RequestHandler = (req, res, next) => {
  const role = verifyToken(bearerToken(req.headers.authorization));
  if (role) return next();
  // The manager PIN header is still accepted so manager tooling keeps working.
  if (req.headers['x-manager-pin'] === managerPin()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

/** Manager only — analytics, loyalty, rewards, config. */
export const requireManager: RequestHandler = (req, res, next) => {
  const role = verifyToken(bearerToken(req.headers.authorization));
  if (role === 'manager') return next();
  if (req.headers['x-manager-pin'] === managerPin()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};
