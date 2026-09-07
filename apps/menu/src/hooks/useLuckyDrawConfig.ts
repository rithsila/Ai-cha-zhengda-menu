import useSWR from 'swr';
import { apiFetch } from '../utils/api';

/**
 * Shared lucky draw config hook.  Replaces separate fetches in App.tsx
 * (on mount) and RewardsView (on tab switch).
 */

export interface LuckyDrawConfig {
  enabled: boolean;
  costPerSpin?: number;
  prizes?: Array<{
    id: string;
    name: string;
    emoji?: string;
    weight: number;
    type: string;
  }>;
}

async function fetchLuckyDrawConfig(): Promise<LuckyDrawConfig> {
  const res = await apiFetch('/api/lucky-draw/config');
  if (!res.ok) throw new Error(`Lucky draw config fetch failed: ${res.status}`);
  return res.json();
}

export function useLuckyDrawConfig() {
  const { data, error, isLoading } = useSWR(
    'store:lucky-draw-config',
    fetchLuckyDrawConfig,
    {
      dedupingInterval: 30_000,
      revalidateOnFocus: false,
      revalidateIfStale: false,
    },
  );

  return {
    luckyDrawEnabled: data?.enabled ?? true,
    luckyCostPerSpin: data?.costPerSpin ?? 5,
    luckyPrizes: data?.prizes ?? [],
    luckyDrawError: error,
    luckyDrawLoading: isLoading,
  };
}
