import useSWR from 'swr';
import { apiFetch } from '../utils/api';

/**
 * Shared config hook.  `/api/config` returns store-wide settings such as
 * pointsPerDollar, deliveryFee and allowCashForStandard.  These only change
 * when the manager saves new values — not between tab switches — so a long
 * deduplication interval is safe and saves 2-3 redundant calls per session.
 */

export interface ConfigRow {
  key: string;
  value: string;
}

async function fetchConfig(): Promise<ConfigRow[]> {
  const res = await apiFetch('/api/config');
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Parse one numeric config value from the rows. */
export function configNumber(rows: ConfigRow[], key: string, fallback: number): number {
  const n = Number(rows.find((r) => r.key === key)?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Parse one string config value from the rows. */
export function configString(rows: ConfigRow[], key: string, fallback: string): string {
  return rows.find((r) => r.key === key)?.value ?? fallback;
}

export function useConfig() {
  const { data, error, isLoading, mutate } = useSWR('store:config', fetchConfig, {
    // Config rarely changes — 60s dedup is safe.
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
  });

  return {
    configRows: data ?? [],
    configError: error,
    configLoading: isLoading,
    mutateConfig: mutate,
  };
}
