import useSWR from 'swr';
import { apiFetch } from '../utils/api';

/**
 * Shared catalog + categories hook.  Replaces the manual fetch + 60s poll +
 * focus listener in App.tsx.  SWR deduplicates so CheckoutModal and App.tsx
 * share the same cached catalog without extra network calls.
 *
 * Refreshes every 60s in the background (stale-while-revalidate).
 */

export interface RawCatalogItem {
  id: string;
  brand?: string;
  category?: string;
  name: string;
  description?: string;
  basePrice: number;
  image?: string;
  isSoldOut?: boolean;
  modifiers?: any[];
}

export interface CategoryRow {
  brand: string;
  name: string;
  sortOrder: number;
}

async function fetchCatalogAndCategories(): Promise<{
  items: RawCatalogItem[];
  categories: CategoryRow[];
}> {
  const [res, catRes] = await Promise.all([
    apiFetch('/api/catalog'),
    apiFetch('/api/categories').catch(() => null),
  ]);

  let items: RawCatalogItem[] = [];
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data)) items = data;
  }

  let categories: CategoryRow[] = [];
  if (catRes && catRes.ok) {
    const catData = await catRes.json();
    if (Array.isArray(catData)) {
      categories = catData.map((c: any) => ({
        brand: c.brand,
        name: c.name,
        sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : 999,
      }));
    }
  }

  return { items, categories };
}

export function useCatalog() {
  const { data, error, isLoading, mutate } = useSWR(
    'store:catalog',
    fetchCatalogAndCategories,
    {
      // Poll every 60s in background — replaces the old setInterval.
      refreshInterval: 60_000,
      // Don't re-fetch on every window focus — was causing repeated calls.
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 10_000,
    },
  );

  return {
    catalogItems: data?.items ?? [],
    categoriesList: data?.categories ?? [],
    catalogError: error,
    catalogLoading: isLoading,
    mutateCatalog: mutate,
  };
}
