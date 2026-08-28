import { PrismaClient } from '@prisma/client';

export type StoreMode = 'auto' | 'open' | 'closed';

export interface StoreStatus {
  isOpen: boolean;
  storeStatus: StoreMode;
  openTime: string;
  closeTime: string;
  enablePickup: boolean;
  enableDelivery: boolean;
  enableCash: boolean;
  enableKhqr: boolean;
  currentTime: string;
  reason: 'manual_open' | 'manual_closed' | 'schedule_open' | 'schedule_closed';
}

export const CONFIG_DEFAULTS: Record<string, string | number> = {
  pointsPerDollar: 100,
  // Free inside Arakawa for now. The shop can raise it later via PUT /api/config.
  deliveryFee: 0,
  storeStatus: 'auto',
  openTime: '08:00',
  closeTime: '21:00',
  enablePickup: '1',
  enableDelivery: '1',
  enableCash: '1',
  enableKhqr: '1',
  goldMinOrdersThreshold: 3,
  allowCashForStandard: '0',
  luckyDrawEnabled: '1',
  luckyTicketsPerGoldOrder: 2,
  luckyTicketsPerStandardOrder: 1,
  luckyTicketsCostPerSpin: 5,
  luckyWheelPrizes: '[]',
};

/**
 * Returns current hours and minutes formatted as "HH:mm" in Cambodia timezone (UTC+7).
 */
export function getCambodiaTime(date: Date = new Date()): { hour: number; minute: number; timeStr: string } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { hour, minute, timeStr };
}

/**
 * Checks whether current HH:mm falls between openTime and closeTime.
 * Handles normal daytime hours (e.g. 08:00 to 21:00) and overnight hours (e.g. 20:00 to 04:00).
 */
export function isTimeInRange(currentTime: string, openTime: string, closeTime: string): boolean {
  if (openTime === closeTime) {
    // If open and close are identical, shop is open 24 hours
    return true;
  }
  if (openTime < closeTime) {
    return currentTime >= openTime && currentTime < closeTime;
  }
  // Overnight schedule (openTime > closeTime)
  return currentTime >= openTime || currentTime < closeTime;
}

export async function getConfigValue(prisma: PrismaClient, key: string, fallback: string): Promise<string> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function getConfigNumber(prisma: PrismaClient, key: string, fallback: number): Promise<number> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n >= (key === 'deliveryFee' ? 0 : 1) ? n : fallback;
}

/**
 * Evaluates the full live status of the store.
 */
export async function getStoreStatus(prisma: PrismaClient, now: Date = new Date()): Promise<StoreStatus> {
  const configs = await prisma.systemConfig.findMany();
  const configMap = new Map<string, string>();
  for (const c of configs) {
    configMap.set(c.key, c.value);
  }

  const storeStatus = (configMap.get('storeStatus') ?? CONFIG_DEFAULTS.storeStatus) as StoreMode;
  const openTime = configMap.get('openTime') ?? (CONFIG_DEFAULTS.openTime as string);
  const closeTime = configMap.get('closeTime') ?? (CONFIG_DEFAULTS.closeTime as string);
  const enablePickup = (configMap.get('enablePickup') ?? CONFIG_DEFAULTS.enablePickup) === '1';
  const enableDelivery = (configMap.get('enableDelivery') ?? CONFIG_DEFAULTS.enableDelivery) === '1';
  const enableCash = (configMap.get('enableCash') ?? CONFIG_DEFAULTS.enableCash) === '1';
  const enableKhqr = (configMap.get('enableKhqr') ?? CONFIG_DEFAULTS.enableKhqr) === '1';

  const { timeStr: currentTime } = getCambodiaTime(now);

  let isOpen = false;
  let reason: StoreStatus['reason'] = 'schedule_closed';

  if (storeStatus === 'open') {
    isOpen = true;
    reason = 'manual_open';
  } else if (storeStatus === 'closed') {
    isOpen = false;
    reason = 'manual_closed';
  } else {
    // 'auto' mode: check time of day
    isOpen = isTimeInRange(currentTime, openTime, closeTime);
    reason = isOpen ? 'schedule_open' : 'schedule_closed';
  }

  return {
    isOpen,
    storeStatus,
    openTime,
    closeTime,
    enablePickup,
    enableDelivery,
    enableCash,
    enableKhqr,
    currentTime,
    reason,
  };
}

/**
 * Validates a configuration key/value pair before writing to database.
 */
export function validateConfig(key: string, value: unknown): { valid: boolean; normalizedValue: string; error?: string } {
  if (!(key in CONFIG_DEFAULTS)) {
    return {
      valid: false,
      normalizedValue: '',
      error: `Unknown config key. Allowed: ${Object.keys(CONFIG_DEFAULTS).join(', ')}`,
    };
  }

  const strVal = String(value ?? '').trim();

  // Numeric keys
  if (
    key === 'pointsPerDollar' ||
    key === 'deliveryFee' ||
    key === 'goldMinOrdersThreshold' ||
    key === 'luckyTicketsPerGoldOrder' ||
    key === 'luckyTicketsPerStandardOrder' ||
    key === 'luckyTicketsCostPerSpin'
  ) {
    const num = Number(strVal);
    const nonNegativeKeys = ['deliveryFee', 'goldMinOrdersThreshold', 'luckyTicketsPerGoldOrder', 'luckyTicketsPerStandardOrder'];
    const min = nonNegativeKeys.includes(key) ? 0 : 1;
    if (!Number.isFinite(num) || num < min) {
      return { valid: false, normalizedValue: '', error: `${key} must be a number of at least ${min}` };
    }
    return { valid: true, normalizedValue: String(num) };
  }

  // Store status mode
  if (key === 'storeStatus') {
    if (strVal !== 'auto' && strVal !== 'open' && strVal !== 'closed') {
      return { valid: false, normalizedValue: '', error: 'storeStatus must be "auto", "open", or "closed"' };
    }
    return { valid: true, normalizedValue: strVal };
  }

  // Time format (HH:mm)
  if (key === 'openTime' || key === 'closeTime') {
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(strVal)) {
      return { valid: false, normalizedValue: '', error: `${key} must be in 24-hour HH:mm format (e.g. 08:00 or 21:30)` };
    }
    return { valid: true, normalizedValue: strVal };
  }

  // Boolean toggles ('1' or '0')
  if (
    key === 'enablePickup' ||
    key === 'enableDelivery' ||
    key === 'enableCash' ||
    key === 'enableKhqr' ||
    key === 'allowCashForStandard' ||
    key === 'luckyDrawEnabled'
  ) {
    if (strVal === '1' || strVal === 'true' || value === true) {
      return { valid: true, normalizedValue: '1' };
    }
    if (strVal === '0' || strVal === 'false' || value === false) {
      return { valid: true, normalizedValue: '0' };
    }
    return { valid: false, normalizedValue: '', error: `${key} must be "1" (enabled) or "0" (disabled)` };
  }

  // JSON lucky wheel prizes array
  if (key === 'luckyWheelPrizes') {
    if (!strVal || strVal === '[]') {
      return { valid: true, normalizedValue: '[]' };
    }
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) {
        return { valid: false, normalizedValue: '', error: 'luckyWheelPrizes must be a JSON array' };
      }
      return { valid: true, normalizedValue: JSON.stringify(parsed) };
    } catch {
      return { valid: false, normalizedValue: '', error: 'luckyWheelPrizes must be valid JSON array' };
    }
  }

  return { valid: true, normalizedValue: strVal };
}

export async function getConfigString(prisma: PrismaClient, key: string, fallback: string): Promise<string> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

