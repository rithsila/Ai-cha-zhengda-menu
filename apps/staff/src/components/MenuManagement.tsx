import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CornerDownLeft, Search, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  Skeleton,
  useToast,
} from './ui';

type MenuItem = {
  id: string;
  brand: string;
  category: string;
  name: string;
  isSoldOut: boolean;
};

type AvailabilityFilter = 'all' | 'available' | 'soldout';
type BrandFilter = 'all' | 'ai-cha' | 'zhengda';

export function MenuManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchCatalog = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiFetch<MenuItem[]>('/api/catalog');
      setItems(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  // Staff open this tab for one reason: something just ran out. Put the cursor
  // where the fix starts.
  useEffect(() => {
    if (!loading && !loadError) searchRef.current?.focus();
  }, [loading, loadError]);

  const setSoldOut = async (item: MenuItem, nextSoldOut: boolean) => {
    setPendingIds((prev) => new Set(prev).add(item.id));
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, isSoldOut: nextSoldOut } : i)),
    );
    try {
      await apiFetch(`/api/catalog/${item.id}/sold-out`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSoldOut: nextSoldOut }),
      });
      toast({
        title: nextSoldOut
          ? `${item.name} is now sold out`
          : `${item.name} is back on the menu`,
        variant: nextSoldOut ? 'info' : 'success',
        action: {
          label: 'Undo',
          onClick: () => setSoldOut({ ...item, isSoldOut: nextSoldOut }, !nextSoldOut),
        },
      });
    } catch {
      // Revert on failure
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      toast({
        title: `Couldn't update ${item.name}`,
        description: 'The menu was not changed.',
        variant: 'error',
        action: { label: 'Retry', onClick: () => setSoldOut(item, nextSoldOut) },
      });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q),
    );
  }, [items, search]);

  const filteredItems = useMemo(
    () =>
      searched.filter((item) => {
        const matchesAvailability =
          availability === 'all' ||
          (availability === 'available' && !item.isSoldOut) ||
          (availability === 'soldout' && item.isSoldOut);
        const matchesBrand = brand === 'all' || item.brand.toLowerCase() === brand;
        return matchesAvailability && matchesBrand;
      }),
    [searched, availability, brand],
  );

  const soldOutCount = items.filter((i) => i.isSoldOut).length;
  const isFiltered = search !== '' || availability !== 'all' || brand !== 'all';
  const clearFilters = () => {
    setSearch('');
    setAvailability('all');
    setBrand('all');
    searchRef.current?.focus();
  };

  /* The whole point of the search box is to reach one item fast, so when the
     search has narrowed to exactly one, Enter flips it. */
  const soleMatch = filteredItems.length === 1 ? filteredItems[0] : null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="sr-only">Menu availability</h2>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <label className="sr-only" htmlFor="menu-search">
            Search menu items
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            id="menu-search"
            type="search"
            placeholder="Search items, categories, brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && soleMatch && !pendingIds.has(soleMatch.id)) {
                e.preventDefault();
                setSoldOut(soleMatch, !soleMatch.isSoldOut);
              }
            }}
            aria-describedby="menu-search-hint"
            className="h-11 w-full rounded-xl border border-border bg-surface pr-4 pl-10 text-base text-ink transition-colors placeholder:text-ink-faint focus:border-accent"
          />
        </div>

        <Segmented
          options={[
            { id: 'all', label: 'All' },
            { id: 'available', label: 'Available' },
            { id: 'soldout', label: 'Sold out', count: soldOutCount },
          ]}
          value={availability}
          onChange={setAvailability}
          ariaLabel="Filter by availability"
        />

        <Segmented
          options={[
            { id: 'all', label: 'Both' },
            { id: 'ai-cha', label: 'Ai-Cha' },
            { id: 'zhengda', label: 'Zhengda' },
          ]}
          value={brand}
          onChange={setBrand}
          ariaLabel="Filter by brand"
        />

        {isFiltered ? (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="size-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>

      <p id="menu-search-hint" className="text-sm text-ink-soft" aria-live="polite">
        {isFiltered
          ? `${filteredItems.length} of ${items.length} items · ${soldOutCount} sold out`
          : `${items.length} items · ${soldOutCount} sold out`}
        {soleMatch ? (
          <span className="ml-2 inline-flex items-center gap-1.5 font-semibold text-accent">
            <CornerDownLeft className="size-3.5" aria-hidden="true" />
            Enter to mark {soleMatch.isSoldOut ? 'available' : 'sold out'}
          </span>
        ) : null}
      </p>

      {loading ? (
        <Card padding="none" className="overflow-hidden">
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : loadError ? (
        <EmptyState
          icon={<CircleAlert className="size-10" />}
          title="Couldn't load the menu"
          description="Check your connection and try again."
          action={
            <Button variant="secondary" onClick={fetchCatalog}>
              Try again
            </Button>
          }
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<Search className="size-10" />}
          title="No items match"
          description="Try a different search or clear the filters."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="max-h-[calc(100dvh-16rem)] overflow-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Menu items and availability</caption>
              <thead>
                {/* Sticky: a hundred items is a long scroll to lose the columns. */}
                <tr className="sticky top-0 z-10 bg-surface-sunken">
                  <th scope="col" className="p-3.5 text-sm font-semibold text-ink-soft">
                    Item
                  </th>
                  <th
                    scope="col"
                    className="hidden p-3.5 text-sm font-semibold text-ink-soft sm:table-cell"
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="p-3.5 text-right text-sm font-semibold text-ink-soft"
                  >
                    Availability
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const zhengda = item.brand.toLowerCase() === 'zhengda';
                  const busy = pendingIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`border-t border-border transition-colors hover:bg-surface-sunken/60 ${
                        item.isSoldOut ? 'bg-surface-sunken/30' : ''
                      }`}
                    >
                      <td className="p-3.5">
                        <span className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`size-2.5 shrink-0 rounded-full ${
                              zhengda ? 'bg-zhengda' : 'bg-accent'
                            }`}
                          />
                          <span
                            className={`font-medium ${
                              item.isSoldOut ? 'text-ink-faint' : 'text-ink'
                            }`}
                          >
                            <span className="sr-only">
                              {zhengda ? 'Zhengda' : 'Ai-Cha'}:{' '}
                            </span>
                            {item.name}
                          </span>
                        </span>
                      </td>
                      <td className="hidden p-3.5 text-sm text-ink-soft sm:table-cell">
                        {item.category}
                      </td>
                      <td className="p-3.5">
                        <span className="flex items-center justify-end gap-3">
                          {/* Available is the default for 48 of 48 items, so only
                              the exception is labelled. */}
                          {item.isSoldOut ? (
                            <Badge variant="danger" dot>
                              Sold out
                            </Badge>
                          ) : null}
                          {/*
                           * The control names the action, not the state. The old
                           * switch was labelled "<item> is available" and had to be
                           * turned OFF to mark something sold out — a double negative
                           * that is easy to flip the wrong way mid-rush.
                           */}
                          <Button
                            variant={item.isSoldOut ? 'success' : 'secondary'}
                            loading={busy}
                            onClick={() => setSoldOut(item, !item.isSoldOut)}
                          >
                            {item.isSoldOut ? 'Mark available' : 'Mark sold out'}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
