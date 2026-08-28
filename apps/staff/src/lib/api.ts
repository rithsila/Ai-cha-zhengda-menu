/**
 * Shared API client for the staff dashboard.
 *
 * Set VITE_API_URL when the API is not on localhost. Every deployed build needs
 * it, because a tablet in the shop cannot reach the developer's machine.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const SESSION_KEY = 'staff-session';

export type StaffSession = { token: string; role: 'staff' | 'manager'; expiresAt: number };

/** Store the login token so a page reload does not send staff back to the PIN screen. */
export function saveSession(session: StaffSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private browsing or storage disabled — the session simply won't survive a reload.
  }
}

/** Returns the stored session, or null when it is missing or has expired. */
export function loadSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StaffSession;
    if (!session?.token || typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Authorization header for the current session, or {} when logged out. */
export function authHeaders(): Record<string, string> {
  const session = loadSession();
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}

/** Listeners fired when the API rejects the session, so the UI can show the PIN screen. */
const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(listener: () => void) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** Clears the session and tells the app to lock itself. */
export function handleUnauthorized() {
  clearSession();
  unauthorizedListeners.forEach((listener) => listener());
}

/**
 * Fetch from the API with the staff token attached. Throws on any non-2xx
 * response so callers can rely on try/catch for error handling.
 * A 401 also drops the stored session and locks the dashboard.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    const err = new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * Resolve an image URL so relative paths (e.g. /images/... or /uploads/...)
 * work cleanly across both local dev and production builds.
 */
export function resolveImageUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/')) {
    return API_BASE ? `${API_BASE}${url}`.replace(/([^:]\/)\/+/g, '$1') : url;
  }
  return url;
}
