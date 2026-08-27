import { useEffect } from 'react';
import twa from '@twa-dev/sdk';

const WebApp = (twa as any)?.WebApp || twa || {};

const applyLightTheme = () => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = 'light';
    try {
      if (WebApp?.setHeaderColor) {
        WebApp.setHeaderColor('#f8fafc');
      }
      if (WebApp?.setBackgroundColor) {
        WebApp.setBackgroundColor('#f8fafc');
      }
    } catch {
      // ignore
    }
  }
};

/**
 * Enforces light mode across the app and Telegram WebApp container.
 */
export function useTheme() {
  useEffect(() => {
    applyLightTheme();
  }, []);

  return {
    theme: 'light' as const,
    isDark: false,
  };
}

export function useTelegramTheme() {
  return useTheme();
}

