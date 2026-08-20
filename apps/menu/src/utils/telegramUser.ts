import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};

/** Token from the browser login redirect (#tg_token=...). */
const TOKEN_KEY = 'tg_web_token';
/** The old login stored a raw Telegram id here. The API no longer trusts it. */
const LEGACY_ID_KEY = 'tg_web_user_id';

/**
 * Store the token from the login redirect (#tg_token=...) and clean the URL.
 *
 * The redirect used to hand over a raw Telegram id, which anyone could type
 * into localStorage and become that customer. Now the server signs a token, so
 * the browser holds a secret it cannot make up. Any leftover raw id is deleted.
 */
export function captureWebLoginFromHash(): void {
  const hash = window.location.hash;
  const tokenMatch = hash.match(/tg_token=([^&]+)/);
  if (tokenMatch) {
    try {
      localStorage.setItem(TOKEN_KEY, decodeURIComponent(tokenMatch[1]));
    } catch {
      // Private mode — the login just will not survive a reload.
    }
  }
  // Clear the stale raw id (and old-style links) without ever using it.
  if (tokenMatch || /tg_id=/.test(hash)) {
    try {
      localStorage.removeItem(LEGACY_ID_KEY);
    } catch {
      // ignore
    }
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** The web-login token, or null when the customer never logged in here. */
export function getWebLoginToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearWebLoginToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * The raw, signed initData string Telegram gives a Mini App. The server checks
 * its signature, so this is the only trustworthy proof of who the caller is.
 */
export function getInitData(): string | null {
  const raw = WebApp?.initData;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * The Telegram user object for **display only** (a first name in the header).
 * Telegram itself calls it "unsafe": it is not signed, so it must never be sent
 * to the API as an identity.
 */
export function getTelegramDisplayUser(): { firstName?: string; lastName?: string } | null {
  const user = WebApp?.initDataUnsafe?.user;
  if (!user) return null;
  return { firstName: user.first_name, lastName: user.last_name };
}

/**
 * The caller's own Telegram id, used **only** to fill in a URL path segment.
 *
 * It reads the unsigned `initDataUnsafe`, so on its own it proves nothing. The
 * server verifies the signed header on the same request and refuses a path id
 * that is not the caller's own, which makes this a routing hint and never an
 * identity. A browser login holds only an opaque token and has no id to give,
 * so those requests ask the server for "me" instead.
 */
export function getSelfIdHint(): string | null {
  const fromTelegram = WebApp?.initDataUnsafe?.user?.id?.toString();
  if (fromTelegram && getInitData()) return fromTelegram;
  return getDevUserId();
}

/**
 * Development-only identity. The API accepts `X-Telegram-User-Id` only when it
 * has no bot token to verify signatures with, so this can never work against a
 * real deployment. Set VITE_DEV_TELEGRAM_USER_ID to test outside Telegram.
 */
export function getDevUserId(): string | null {
  if (!import.meta.env.DEV) return null;
  const fromTelegram = WebApp?.initDataUnsafe?.user?.id?.toString();
  if (fromTelegram) return fromTelegram;
  return (import.meta.env.VITE_DEV_TELEGRAM_USER_ID as string | undefined) || null;
}
