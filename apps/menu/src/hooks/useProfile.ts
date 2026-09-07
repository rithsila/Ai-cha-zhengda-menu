import useSWR from 'swr';
import { apiFetch, hasIdentity, ME } from '../utils/api';

/**
 * Shared profile hook.  Every component that needs the signed-in customer's
 * profile imports this instead of rolling its own `useEffect + fetch`.
 *
 * SWR deduplicates concurrent callers and caches the result, so even when
 * AccountView, RewardsView, CheckoutModal and DevPersonaBar are all mounted
 * at once, only **one** network request leaves the browser.
 */

async function fetchProfile(): Promise<any> {
  const res = await apiFetch(ME.profile());
  if (!res.ok) {
    const err = new Error(`Profile fetch failed: ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

export function useProfile() {
  const signedIn = hasIdentity();

  const { data, error, isLoading, mutate } = useSWR(
    signedIn ? 'user:profile' : null,
    fetchProfile,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    },
  );

  return {
    profile: data ?? null,
    profileError: error,
    profileLoading: signedIn ? isLoading : false,
    mutateProfile: mutate,
    signedIn,
  };
}
