import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface UseTheme {
  /** The theme actually applied to the document right now. */
  theme: ResolvedTheme;
  /** The user's selected mode. 'system' follows the OS preference live. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Pin the opposite of the current resolved theme (light <-> dark, away from system). */
  toggle: () => void;
}

const STORAGE_KEY = 'staff-theme';

/*
 * Persistence contract: localStorage only ever holds an explicit pin
 * ('light' | 'dark'). 'system' is represented by the key being ABSENT —
 * the inline boot script in index.html reads it the same way.
 */

const media = window.matchMedia('(prefers-color-scheme: dark)');

function readStoredMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let currentMode: ThemeMode = readStoredMode();

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  return media.matches ? 'dark' : 'light';
}

function applyToDocument(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolve(mode);
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

// Follow the OS live, but only while the user hasn't pinned a choice.
media.addEventListener('change', () => {
  if (currentMode === 'system') emit();
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Composite snapshot so an OS-level flip re-renders even when mode stays 'system'.
function getSnapshot(): `${ThemeMode}:${ResolvedTheme}` {
  return `${currentMode}:${resolve(currentMode)}`;
}

function setMode(mode: ThemeMode): void {
  currentMode = mode;
  try {
    if (mode === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable (private mode, etc.) — theme still applies for the session.
  }
  applyToDocument(mode);
  emit();
}

function toggle(): void {
  setMode(resolve(currentMode) === 'dark' ? 'light' : 'dark');
}

// Keep the document in sync if this module is (re)loaded after the boot script.
applyToDocument(currentMode);

export function useTheme(): UseTheme {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const separator = snapshot.lastIndexOf(':');
  const mode = snapshot.slice(0, separator) as ThemeMode;
  const theme = snapshot.slice(separator + 1) as ResolvedTheme;
  return { theme, mode, setMode, toggle };
}
