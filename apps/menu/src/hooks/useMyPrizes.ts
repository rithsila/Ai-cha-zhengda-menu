import useSWR from 'swr';
import { apiFetch, hasIdentity } from '../utils/api';

/**
 * Shared hook for the user's lucky-draw prize claims (`/api/me/prizes`).
 * Replaces separate fetches in RewardsView and CheckoutModal.
 */

export interface PrizeClaim {
  id: string;
  code: string;
  prizeName: string;
  prizeIcon?: string;
  status: 'pending' | 'claimed' | 'expired';
  createdAt: string;
}

async function fetchPrizes(): Promise<PrizeClaim[]> {
  const res = await apiFetch('/api/me/prizes');
  if (!res.ok) throw new Error(`Prizes fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function useMyPrizes() {
  const signedIn = hasIdentity();

  const { data, error, isLoading, mutate } = useSWR(
    signedIn ? 'user:prizes' : null,
    fetchPrizes,
    {
      dedupingInterval: 10_000,
      revalidateOnFocus: true,
    },
  );

  return {
    prizes: data ?? [],
    prizesError: error,
    prizesLoading: signedIn ? isLoading : false,
    mutatePrizes: mutate,
    signedIn,
  };
}
