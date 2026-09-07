import { useSyncExternalStore } from 'react';
import { API_BASE } from './api';

export interface SocialBadgeItem {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
}

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
  menuBannerUrl?: string;
  menuBannerUrls?: string;
  menuTabsConfig?: string;
  shopName?: string;
  shopAddress?: string;
  shopDeliveryNote?: string;
  shopSocialsEnabled?: boolean;
  shopSocialLinks?: string;
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
  menuBannerUrl: '/banner.webp',
  menuBannerUrls: JSON.stringify(['/banner.webp']),
  shopName: 'Our shop',
  shopAddress: 'J03, Ground Floor, Arakawa',
  shopDeliveryNote: 'Delivery inside Arakawa is free',
  shopSocialsEnabled: true,
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

let inflightRefresh: Promise<StoreStatusData> | null = null;
let lastRefreshTime = 0;

export function refreshStoreStatus(force = false): Promise<StoreStatusData> {
  // If recently refreshed (within 15s) and not forced, return cached status immediately
  if (!force && Date.now() - lastRefreshTime < 15_000) {
    return Promise.resolve(currentStatus);
  }

  // If a refresh is already in-flight, join it instead of firing a duplicate.
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/store/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        lastRefreshTime = Date.now();
        return data;
      }
    } catch {
      // Network offline or server down - retain last known status
    }
    return currentStatus;
  })().finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
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
