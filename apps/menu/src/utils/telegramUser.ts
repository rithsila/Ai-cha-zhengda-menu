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
  const globalTg = (window as any)?.Telegram?.WebApp;
  if (typeof globalTg?.initData === 'string' && globalTg.initData.length > 0) {
    return globalTg.initData;
  }
  const raw = WebApp?.initData;
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  try {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const fromHash = params.get('tgWebAppData');
    if (fromHash) return fromHash;

    const searchParams = new URLSearchParams(window.location.search);
    const fromSearch = searchParams.get('tgWebAppData');
    if (fromSearch) return fromSearch;
  } catch {
    // ignore parsing errors
  }
  return null;
}

/**
 * The Telegram user object for **display only** (a first name in the header).
 * Telegram itself calls it "unsafe": it is not signed, so it must never be sent
 * to the API as an identity.
 */
export function getTelegramDisplayUser(): { firstName?: string; lastName?: string; photoUrl?: string } | null {
  const globalTg = (window as any)?.Telegram?.WebApp;
  const user = globalTg?.initDataUnsafe?.user || WebApp?.initDataUnsafe?.user;
  if (user) return { firstName: user.first_name, lastName: user.last_name, photoUrl: user.photo_url };

  const initData = getInitData();
  if (initData) {
    try {
      const p = new URLSearchParams(initData);
      const userRaw = p.get('user');
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        return { firstName: parsed.first_name, lastName: parsed.last_name, photoUrl: parsed.photo_url };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * The caller's own Telegram id, used **only** to fill in a URL path segment.
 */
export function getSelfIdHint(): string | null {
  const globalTg = (window as any)?.Telegram?.WebApp;
  const fromTelegram = (globalTg?.initDataUnsafe?.user?.id || WebApp?.initDataUnsafe?.user?.id)?.toString();
  if (fromTelegram && getInitData()) return fromTelegram;

  const initData = getInitData();
  if (initData) {
    try {
      const p = new URLSearchParams(initData);
      const userRaw = p.get('user');
      if (userRaw) {
        const parsed = JSON.parse(userRaw);
        if (parsed?.id) return String(parsed.id);
      }
    } catch {
      // ignore
    }
  }
  return getDevUserId();
}

/**
 * Development-only identity. The API accepts `X-Telegram-User-Id` only when it
 * has no bot token to verify signatures with, so this can never work against a
 * real deployment. Set VITE_DEV_TELEGRAM_USER_ID to test outside Telegram.
 */
export function getDevUserId(): string | null {
  if (!import.meta.env.DEV) return null;
  const globalTg = (window as any)?.Telegram?.WebApp;
  const fromTelegram = (globalTg?.initDataUnsafe?.user?.id || WebApp?.initDataUnsafe?.user?.id)?.toString();
  if (fromTelegram) return fromTelegram;
  return (import.meta.env.VITE_DEV_TELEGRAM_USER_ID as string | undefined) || null;
}
