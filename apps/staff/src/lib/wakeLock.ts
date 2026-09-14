/*
 * Screen Wake Lock utility for Staff tablet.
 * Keeps tablet screen awake to prevent browser sleep and ensure uninterrupted polling and chimes.
 */

const WAKE_LOCK_PREF_KEY = 'staff-wake-lock-enabled';

let sentinel: WakeLockSentinel | null = null;
const listeners = new Set<(active: boolean) => void>();

function notifyListeners(active: boolean) {
  listeners.forEach((fn) => fn(active));
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function getWakeLockPreference(): boolean {
  try {
    // Default to true (always on) for staff tablet POS display
    return localStorage.getItem(WAKE_LOCK_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setWakeLockPreference(enabled: boolean): void {
  try {
    localStorage.setItem(WAKE_LOCK_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore private mode errors */
  }
}

export function isWakeLockActive(): boolean {
  return sentinel !== null && !sentinel.released;
}

export async function requestWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported()) return false;

  try {
    if (sentinel && !sentinel.released) {
      notifyListeners(true);
      return true;
    }

    sentinel = await navigator.wakeLock.request('screen');
    notifyListeners(true);

    sentinel.addEventListener('release', () => {
      sentinel = null;
      notifyListeners(false);
    });

    return true;
  } catch {
    sentinel = null;
    notifyListeners(false);
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      /* ignore */
    }
    sentinel = null;
    notifyListeners(false);
  }
}

export function subscribeWakeLock(listener: (active: boolean) => void): () => void {
  listeners.add(listener);
  listener(isWakeLockActive());
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Initializes auto-reconnect for Wake Lock on visibility changes.
 * Call once when the staff app mounts.
 */
export function initWakeLockLifecycle(): () => void {
  if (typeof document === 'undefined') return () => {};

  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && getWakeLockPreference()) {
      await requestWakeLock();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // If enabled, request immediately
  if (getWakeLockPreference()) {
    void requestWakeLock();
  }

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    void releaseWakeLock();
  };
}
