import { useState, useEffect, useCallback } from 'react';
import twa from '@twa-dev/sdk';

const WebApp = (twa as any)?.WebApp || twa || {};

export type ColorScheme = 'light' | 'dark';

const isTelegramWebApp = () =>
  typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;

const getSystemTheme = (): ColorScheme => {
  if (isTelegramWebApp() && WebApp?.colorScheme) {
    return WebApp.colorScheme as ColorScheme;
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

const applyTheme = (scheme: ColorScheme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = scheme;
    try {
      if (WebApp?.setHeaderColor) {
        WebApp.setHeaderColor(scheme === 'dark' ? '#0f172a' : '#f8fafc');
      }
      if (WebApp?.setBackgroundColor) {
        WebApp.setBackgroundColor(scheme === 'dark' ? '#0f172a' : '#f8fafc');
      }
    } catch {
      // ignore
    }
  }
};

/**
 * Keeps <html data-theme="light|dark"> in sync with user preference or environment.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<ColorScheme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_theme') as ColorScheme | null;
      if (saved === 'light' || saved === 'dark') {
        applyTheme(saved);
        return saved;
      }
    }
    const sys = getSystemTheme();
    applyTheme(sys);
    return sys;
  });

  const setTheme = useCallback((newTheme: ColorScheme) => {
    setThemeState(newTheme);
    localStorage.setItem('app_theme', newTheme);
    applyTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  }, [theme, setTheme]);

  useEffect(() => {
    if (isTelegramWebApp() && WebApp?.colorScheme) {
      const onThemeChanged = () => {
        if (!localStorage.getItem('app_theme')) {
          const sys = (WebApp.colorScheme as ColorScheme) || 'light';
          setThemeState(sys);
          applyTheme(sys);
        }
      };
      WebApp.onEvent?.('themeChanged', onThemeChanged);
      return () => WebApp.offEvent?.('themeChanged', onThemeChanged);
    }

    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq) {
      const onChange = (e: MediaQueryListEvent) => {
        if (!localStorage.getItem('app_theme')) {
          const sys = e.matches ? 'dark' : 'light';
          setThemeState(sys);
          applyTheme(sys);
        }
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  };
}

export function useTelegramTheme() {
  return useTheme();
}

