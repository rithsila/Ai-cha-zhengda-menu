import { useEffect } from 'react';
import twa from '@twa-dev/sdk';

const WebApp = (twa as any)?.WebApp || twa || {};

type ColorScheme = 'light' | 'dark';

const isTelegramWebApp = () =>
  typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;

const applyTheme = (scheme: ColorScheme) => {
  document.documentElement.dataset.theme = scheme;
};

/**
 * Keeps <html data-theme="light|dark"> in sync with the environment.
 *
 * - Inside Telegram: follows WebApp.colorScheme and updates live on the
 *   'themeChanged' event. (Telegram also updates its --tg-theme-* CSS
 *   variables on its own, so token-based colors switch automatically.)
 * - Plain browser: follows the OS prefers-color-scheme setting.
 *
 * The attribute powers the Tailwind `dark:` variant and the CSS fallback
 * palette (see index.css). There is no user toggle — the app always
 * mirrors its host (Telegram or the OS).
 */
export function useTelegramTheme() {
  useEffect(() => {
    if (isTelegramWebApp() && WebApp?.colorScheme) {
      applyTheme(WebApp.colorScheme as ColorScheme);
      const onThemeChanged = () => {
        applyTheme((WebApp.colorScheme as ColorScheme) || 'light');
      };
      WebApp.onEvent?.('themeChanged', onThemeChanged);
      return () => WebApp.offEvent?.('themeChanged', onThemeChanged);
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');
    const onChange = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
}
