import { getDevUserId, getInitData, getSelfIdHint, getWebLoginToken } from './telegramUser';

/**
 * Base URL of the backend API.
 *
 * Set VITE_API_URL when the API is not on localhost — every deployed build
 * needs it, because the browser cannot reach the developer's machine.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';

/**
 * Path segment standing for "whoever is making this request".
 *
 * The server derives the real customer from the identity headers below and
 * rejects a path id that is not the caller's own, so this segment is only
 * routing — never a claim. Inside Telegram we can fill in the id; a browser
 * login holds an opaque token and asks for "me" instead.
 */
function meSegment(): string {
  const hint = getSelfIdHint();
  return hint ? encodeURIComponent(hint) : 'me';
}

/** The signed-in customer's own resources. */
export const ME = {
  profile: () => `/api/user/${meSegment()}`,
  saveProfile: () => `/api/user/${meSegment()}/profile`,
  orders: () => `/api/orders/user/${meSegment()}`,
} as const;

/**
 * Headers that tell the API who the customer is, best proof first:
 *
 * 1. `X-Telegram-Init-Data` — the signed string Telegram gives a Mini App.
 * 2. `Authorization: Bearer` — the token from the browser login redirect.
 * 3. `X-Telegram-User-Id` — development only; the API accepts it just when it
 *    has no bot token to verify anything with.
 *
 * Empty when nobody is signed in. That is a valid state: a guest can still
 * order for pickup and pay cash, they only lose points and order history.
 */
export function authHeaders(): Record<string, string> {
  const initData = getInitData();
  if (initData) return { 'X-Telegram-Init-Data': initData };

  const token = getWebLoginToken();
  if (token) return { Authorization: `Bearer ${token}` };

  const devId = getDevUserId();
  if (devId) return { 'X-Telegram-User-Id': devId };

  return {};
}

/** True when the app can prove who the customer is. */
export function hasIdentity(): boolean {
  return Object.keys(authHeaders()).length > 0;
}

/**
 * `fetch` against the API with the identity headers attached. Returns the raw
 * Response so callers keep checking `res.ok` and status codes as before.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
}
