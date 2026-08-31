import { useSyncExternalStore } from 'react';

export type LayoutStyle = 'compact-sidebar' | 'classic-board';

export interface UseLayoutStyle {
  layoutStyle: LayoutStyle;
  setLayoutStyle: (style: LayoutStyle) => void;
}

const STORAGE_KEY = 'staff-layout-style';
const DEFAULT_STYLE: LayoutStyle = 'compact-sidebar';

function readStoredStyle(): LayoutStyle {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'compact-sidebar' || value === 'classic-board' ? value : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

let currentStyle: LayoutStyle = readStoredStyle();

function applyToDocument(style: LayoutStyle): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.layout = style;
  }
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): LayoutStyle {
  return currentStyle;
}

export function setStoredLayoutStyle(style: LayoutStyle): void {
  currentStyle = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // Storage unavailable
  }
  applyToDocument(style);
  emit();
}

applyToDocument(currentStyle);

export function useLayoutStyle(): UseLayoutStyle {
  const layoutStyle = useSyncExternalStore(subscribe, getSnapshot);
  return {
    layoutStyle,
    setLayoutStyle: setStoredLayoutStyle,
  };
}
