import { useSyncExternalStore } from 'react';
import { API_BASE } from './api';

/**
 * Is online (KHQR) payment usable right now?
 *
 * ABA PayWay only works once the shop puts its credentials on the server, and
 * until then `POST /api/payment/aba/create` answers 503. Instead of hardcoding
 * a flag we learn it from that answer: one 503 hides the KHQR option, and a
 * successful payment turns it back on. The "off" state also expires by itself,
 * so KHQR reappears on its own after credentials are added — no new build.
 */

const KEY = 'aicha:khqrUnavailableUntil';
/** How long to keep KHQR hidden before quietly trying it again. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

export type OnlinePaymentState = 'unknown' | 'available' | 'unavailable';

function readStored(): OnlinePaymentState {
  try {
    const until = Number(localStorage.getItem(KEY));
    if (Number.isFinite(until) && until > Date.now()) return 'unavailable';
  } catch {
    // Storage disabled — behave as if we never checked.
  }
  return 'unknown';
}

let state: OnlinePaymentState = readStored();
const listeners = new Set<() => void>();

function setState(next: OnlinePaymentState) {
  if (next === state) return;
  state = next;
  listeners.forEach(listener => listener());
}

export function getOnlinePaymentState(): OnlinePaymentState {
  return state;
}

/**
 * Should the KHQR option be shown?
 *
 * Only when we have positive confirmation the shop can take it. "unknown" counts
 * as no, because offering a payment method that then fails is worse than not
 * offering it: `refreshOnlinePaymentState()` settles the question before the
 * payment step is drawn, so "unknown" only lasts until that answer arrives.
 */
export function isOnlinePaymentOffered(): boolean {
  return state === 'available';
}

export function markOnlinePaymentAvailable(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  setState('available');
}

export function markOnlinePaymentUnavailable(): void {
  try {
    localStorage.setItem(KEY, String(Date.now() + RETRY_AFTER_MS));
  } catch {
    // ignore
  }
  setState('unavailable');
}

/**
 * Ask the server whether it can take an online payment today.
 *
 * This is the authoritative answer — the server knows whether ABA credentials
 * are set. Call it before showing payment options. It also means KHQR switches
 * itself back on the moment credentials are added, with no new build.
 */
export async function refreshOnlinePaymentState(): Promise<OnlinePaymentState> {
  try {
    const res = await fetch(`${API_BASE}/api/payment/methods`);
    if (!res.ok) return state;
    const data = await res.json();
    if (data?.online) markOnlinePaymentAvailable();
    else markOnlinePaymentUnavailable();
  } catch {
    // Offline or the server is down. Leave the last known answer in place;
    // the checkout call itself will still fail loudly if KHQR is picked.
  }
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders a component whenever KHQR availability changes. */
export function useOnlinePaymentState(): OnlinePaymentState {
  return useSyncExternalStore(subscribe, getOnlinePaymentState, getOnlinePaymentState);
}
