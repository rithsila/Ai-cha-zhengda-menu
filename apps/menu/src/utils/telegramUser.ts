import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};

const STORAGE_KEY = 'tg_web_user_id';

/** Store the id from the login redirect (#tg_id=...) and clean the URL. */
export function captureWebLoginFromHash(): void {
  const match = window.location.hash.match(/tg_id=([^&]+)/);
  if (match) {
    localStorage.setItem(STORAGE_KEY, decodeURIComponent(match[1]));
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

/** Current user id: Telegram Mini App first, then browser login, else null. */
export function getTelegramUserId(): string | null {
  const fromTelegram = WebApp?.initDataUnsafe?.user?.id?.toString();
  if (fromTelegram) return fromTelegram;
  return localStorage.getItem(STORAGE_KEY);
}
