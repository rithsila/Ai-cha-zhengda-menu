import useSWR from 'swr';
import { apiFetch, hasIdentity, ME } from '../utils/api';

/**
 * Shared orders hook.  Replaces the duplicate polling in OrdersView and the
 * one-shot fetch in RewardsView — both hit the same `ME.orders()` endpoint.
 *
 * SWR's `refreshInterval` takes care of the 5-second polling that OrdersView
 * needs, and other callers simply get the latest cached data for free.
 */

async function fetchOrders(): Promise<any[]> {
  const res = await apiFetch(ME.orders());
  if (!res.ok) throw new Error(`Orders fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export function useMyOrders(opts?: { poll?: boolean }) {
  const signedIn = hasIdentity();
  const poll = opts?.poll ?? false;

  const { data, error, isLoading, mutate } = useSWR(
    signedIn ? 'user:orders' : null,
    fetchOrders,
    {
      refreshInterval: poll ? 5_000 : 0,
      dedupingInterval: 3_000,
      revalidateOnFocus: false,
    },
  );

  return {
    orders: data ?? [],
    ordersError: error,
    ordersLoading: signedIn ? isLoading : false,
    mutateOrders: mutate,
    signedIn,
  };
}
