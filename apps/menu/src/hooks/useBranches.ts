import useSWR from 'swr';
import { apiFetch } from '../utils/api';

/**
 * Shared branches hook.
 * Caches store branches in memory so opening CheckoutModal does not re-fetch.
 */

async function fetchBranches(): Promise<any[]> {
  const res = await apiFetch('/api/branches');
  if (!res.ok) throw new Error('Failed to fetch branches');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function useBranches() {
  const { data, error, isLoading } = useSWR('store:branches', fetchBranches, {
    dedupingInterval: 60_000,
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  return {
    branches: data ?? [],
    branchesError: error,
    branchesLoading: isLoading,
  };
}
