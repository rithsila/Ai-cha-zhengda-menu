import { useSyncExternalStore } from 'react';
import { API_BASE } from './api';

export interface StoreStatusData {
  isOpen: boolean;
  storeStatus: 'auto' | 'open' | 'closed';
  openTime: string;
  closeTime: string;
  enablePickup: boolean;
  enableDelivery: boolean;
  enableCash: boolean;
  enableKhqr: boolean;
  currentTime?: string;
  reason?: string;
}

const DEFAULT_STORE_STATUS: StoreStatusData = {
  isOpen: true,
  storeStatus: 'auto',
  openTime: '08:00',
  closeTime: '21:00',
  enablePickup: true,
  enableDelivery: true,
  enableCash: true,
  enableKhqr: true,
};

let currentStatus: StoreStatusData = DEFAULT_STORE_STATUS;
const listeners = new Set<() => void>();

function setStatus(next: StoreStatusData) {
  currentStatus = next;
  listeners.forEach((listener) => listener());
}

export function getStoreStatusSnapshot(): StoreStatusData {
  return currentStatus;
}

export async function refreshStoreStatus(): Promise<StoreStatusData> {
  try {
    const res = await fetch(`${API_BASE}/api/store/status`);
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      return data;
    }
  } catch {
    // Network offline or server down - retain last known status
  }
  return currentStatus;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStoreStatus(): StoreStatusData {
  return useSyncExternalStore(subscribe, getStoreStatusSnapshot, getStoreStatusSnapshot);
}
