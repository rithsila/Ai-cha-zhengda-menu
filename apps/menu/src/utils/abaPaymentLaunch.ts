export const ABA_MOBILE_OPEN_PATH = '/aba-mobile-open';

type TelegramWebApp = {
  initData?: string;
  platform?: string;
  openLink?: (url: string, options?: Record<string, unknown>) => void;
};

export type AbaPaymentLaunchResult =
  | { ok: true; mode: 'telegram-external-browser' | 'direct-deeplink' }
  | { ok: false; reason: 'invalid-deeplink' };

function getTelegramWebApp(): TelegramWebApp | null {
  const telegram = (globalThis as any).Telegram?.WebApp;
  return telegram || null;
}

export function isValidAbaMobileDeeplink(url: string): boolean {
  try {
    return new URL(url).protocol === 'abamobilebank:';
  } catch {
    return false;
  }
}

export function isTelegramMiniApp(): boolean {
  const tg = getTelegramWebApp();
  if (!tg?.openLink) return false;
  return Boolean(tg.initData) || /Telegram/i.test(navigator.userAgent);
}

export function buildAbaMobileOpenUrl(deeplink: string, origin = window.location.origin): string {
  const url = new URL(ABA_MOBILE_OPEN_PATH, origin);
  url.searchParams.set('deeplink', deeplink);
  return url.toString();
}

function openDirectDeeplink(deeplink: string): void {
  const anchor = document.createElement('a');
  anchor.href = deeplink;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.location.assign(deeplink);
  }, 100);
}

export function launchAbaPayment(deeplink: string): AbaPaymentLaunchResult {
  if (!isValidAbaMobileDeeplink(deeplink)) {
    return { ok: false, reason: 'invalid-deeplink' };
  }

  const tg = getTelegramWebApp();
  if (isTelegramMiniApp() && tg?.openLink) {
    tg.openLink(buildAbaMobileOpenUrl(deeplink));
    return { ok: true, mode: 'telegram-external-browser' };
  }

  openDirectDeeplink(deeplink);
  return { ok: true, mode: 'direct-deeplink' };
}
