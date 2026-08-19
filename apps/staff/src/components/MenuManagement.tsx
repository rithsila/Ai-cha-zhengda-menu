import { useEffect, useState } from 'react';
import { CircleAlert, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  Switch,
  Tabs,
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

const BRANDS: Array<{ id: BrandFilter; label: string }> = [
  { id: 'all', label: 'All brands' },
  { id: 'ai-cha', label: 'Ai-Cha' },
  { id: 'zhengda', label: 'Zhengda' },
];

export function MenuManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

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

  const toggleSoldOut = async (id: string, nextSoldOut: boolean) => {
    setPendingIds((prev) => new Set(prev).add(id));
    const previous = items.find((i) => i.id === id);
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isSoldOut: nextSoldOut } : i)),
    );
    try {
      await apiFetch(`/api/catalog/${id}/sold-out`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSoldOut: nextSoldOut }),
      });
    } catch {
      // Revert on failure
      if (previous) {
        setItems((prev) => prev.map((i) => (i.id === id ? previous : i)));
      }
      toast({
        title: `Couldn't update ${previous?.name ?? 'item'}`,
        description: 'The menu was not changed.',
        variant: 'error',
        action: {
          label: 'Retry',
          onClick: () => toggleSoldOut(id, nextSoldOut),
        },
      });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch =
      q === '' ||
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q);
    const matchesAvailability =
      availability === 'all' ||
      (availability === 'available' && !item.isSoldOut) ||
      (availability === 'soldout' && item.isSoldOut);
    const matchesBrand = brand === 'all' || item.brand.toLowerCase() === brand;
    return matchesSearch && matchesAvailability && matchesBrand;
  });

  const soldOutCount = items.filter((i) => i.isSoldOut).length;
  const isFiltered = search !== '' || availability !== 'all' || brand !== 'all';

  const summary = isFiltered
    ? `${filteredItems.length} of ${items.length} items · ${soldOutCount} sold out`
    : `${items.length} items · ${soldOutCount} sold out`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 max-w-md flex-1">
          <label className="sr-only" htmlFor="menu-search">
            Search menu items
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            id="menu-search"
            type="text"
            placeholder="Search items, categories, brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-surface pr-4 pl-10 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
          />
        </div>

        <Tabs
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'available', label: 'Available' },
            { id: 'soldout', label: 'Sold out' },
          ]}
          active={availability}
          onChange={(id) => setAvailability(id as AvailabilityFilter)}
          ariaLabel="Filter by availability"
        />

        <Tabs
          tabs={BRANDS}
          active={brand}
          onChange={(id) => setBrand(id as BrandFilter)}
          ariaLabel="Filter by brand"
        />
      </div>

      <p className="mb-3 text-sm text-ink-soft">{summary}</p>

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
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setAvailability('all');
                setBrand('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Menu items and availability
              </caption>
              <thead>
                <tr className="bg-surface-sunken">
                  <th
                    scope="col"
                    className="p-3.5 text-sm font-semibold text-ink-soft"
                  >
                    Item
                  </th>
                  <th
                    scope="col"
                    className="p-3.5 text-sm font-semibold text-ink-soft"
                  >
                    Brand
                  </th>
                  <th
                    scope="col"
                    className="p-3.5 text-sm font-semibold text-ink-soft"
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="p-3.5 text-right text-sm font-semibold text-ink-soft"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-border transition-colors hover:bg-surface-sunken/60"
                  >
                    <td className="p-3.5 font-medium text-ink">{item.name}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
                        <span
                          className={`size-2 rounded-full ${
                            item.brand.toLowerCase() === 'zhengda'
                              ? 'bg-zhengda'
                              : 'bg-accent'
                          }`}
                          aria-hidden="true"
                        />
                        {item.brand.toLowerCase() === 'zhengda'
                          ? 'Zhengda'
                          : 'Ai-Cha'}
                      </span>
                    </td>
                    <td className="p-3.5 text-sm text-ink-soft">
                      {item.category}
                    </td>
                    <td className="p-3.5 text-right">
                      <span className="inline-flex items-center justify-end gap-3">
                        <Badge variant={item.isSoldOut ? 'danger' : 'ready'} dot>
                          {item.isSoldOut ? 'Sold out' : 'Available'}
                        </Badge>
                        <Switch
                          checked={!item.isSoldOut}
                          disabled={pendingIds.has(item.id)}
                          srLabel={`${item.name} is available`}
                          onChange={(next) => toggleSoldOut(item.id, !next)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
