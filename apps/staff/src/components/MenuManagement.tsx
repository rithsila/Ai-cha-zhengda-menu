import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, CornerDownLeft, Edit, Layers, Plus, Search, X } from 'lucide-react';
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
import { MenuItemEditModal, type MenuItemFull } from './MenuItemEditModal';
import { CategoryManagementModal } from './CategoryManagementModal';

type AvailabilityFilter = 'all' | 'available' | 'soldout';
type BrandFilter = 'all' | 'ai-cha' | 'zhengda';

export function MenuManagement() {
  const { toast } = useToast();
  const [items, setItems] = useState<MenuItemFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [brand, setBrand] = useState<BrandFilter>('all');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemFull | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const fetchCatalog = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await apiFetch<MenuItemFull[]>('/api/catalog?includeInactive=false');
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

  const setSoldOut = async (item: MenuItemFull, nextSoldOut: boolean) => {
    if (!item.id) return;
    setPendingIds((prev) => new Set(prev).add(item.id!));
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
      if (item.id) {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id!);
          return next;
        });
      }
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
              if (e.key === 'Enter' && soleMatch && soleMatch.id && !pendingIds.has(soleMatch.id)) {
                e.preventDefault();
                setSoldOut(soleMatch, !soleMatch.isSoldOut);
              }
            }}
            aria-describedby="menu-search-hint"
            className="h-10 w-full bg-surface border border-border pr-4 pl-10 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent font-sans transition-colors"
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

        <Button
          variant="secondary"
          onClick={() => setCategoryModalOpen(true)}
          className="font-medium text-xs h-10"
        >
          <Layers className="size-4" />
          Manage Categories
        </Button>

        <Button
          variant="primary"
          onClick={() => {
            setEditingItem(null);
            setModalOpen(true);
          }}
          className="font-medium text-xs h-10"
        >
          <Plus className="size-4" />
          Add Item
        </Button>

        {isFiltered ? (
          <Button variant="ghost" onClick={clearFilters} className="h-10 text-xs">
            <X className="size-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>

      <p id="menu-search-hint" className="text-xs font-mono text-ink-soft" aria-live="polite">
        {isFiltered
          ? `${filteredItems.length} of ${items.length} items · ${soldOutCount} sold out`
          : `${items.length} items · ${soldOutCount} sold out`}
        {soleMatch ? (
          <span className="ml-2 inline-flex items-center gap-1.5 font-sans font-medium text-accent">
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
          icon={<CircleAlert className="size-10 text-danger" />}
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
          icon={<Search className="size-10 text-ink-faint" />}
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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Menu items and availability</caption>
              <thead>
                <tr className="sticky top-0 z-10 bg-surface-sunken border-b border-border">
                  <th scope="col" className="p-3 text-[11px] font-mono uppercase tracking-wider text-ink-soft">
                    Item
                  </th>
                  <th
                    scope="col"
                    className="hidden p-3 text-[11px] font-mono uppercase tracking-wider text-ink-soft sm:table-cell"
                  >
                    Category
                  </th>
                  <th
                    scope="col"
                    className="hidden p-3 text-[11px] font-mono uppercase tracking-wider text-ink-soft sm:table-cell"
                  >
                    Price
                  </th>
                  <th
                    scope="col"
                    className="p-3 text-right text-[11px] font-mono uppercase tracking-wider text-ink-soft"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredItems.map((item) => {
                  const zhengda = item.brand.toLowerCase() === 'zhengda';
                  const busy = pendingIds.has(item.id!);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-surface-sunken/60 ${
                        item.isSoldOut ? 'bg-danger-soft/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`size-2 shrink-0 rounded-none ${
                                zhengda ? 'bg-zhengda shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-accent shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                              }`}
                            />
                            <span
                              className={`font-medium text-sm ${
                                item.isSoldOut ? 'text-ink-faint line-through' : 'text-ink'
                              }`}
                            >
                              <span className="sr-only">
                                {zhengda ? 'Zhengda' : 'Ai-Cha'}:{' '}
                              </span>
                              {item.name}
                            </span>
                          </span>
                          <div className="flex items-center gap-1.5 pl-4.5">
                            {item.earnsStamp !== false ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold bg-success-soft border border-success/30 text-success">
                                +1 Stamp
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium bg-surface-sunken border border-border text-ink-faint">
                                No Stamp
                              </span>
                            )}
                            {item.canClaim && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-500 dark:text-purple-400">
                                🎁 Free Claim
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden p-3 text-xs text-ink-soft sm:table-cell font-sans">
                        {item.category}
                      </td>
                      <td className="hidden p-3 text-sm font-mono font-bold text-ink sm:table-cell">
                        ${Number(item.basePrice ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3">
                        <span className="flex items-center justify-end gap-2">
                          {item.isSoldOut ? (
                            <Badge variant="danger" dot className="font-mono text-[10px]">
                              Sold out
                            </Badge>
                          ) : null}

                          <Button
                            variant="secondary"
                            size="md"
                            onClick={() => {
                              setEditingItem(item);
                              setModalOpen(true);
                            }}
                            className="font-mono text-xs h-8 px-2.5"
                          >
                            <Edit className="size-3" />
                            Edit
                          </Button>

                          <Button
                            variant={item.isSoldOut ? 'success' : 'secondary'}
                            loading={busy}
                            onClick={() => setSoldOut(item, !item.isSoldOut)}
                            className="font-mono text-xs h-8 px-2.5"
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

      {/* Item Create / Edit Modal */}
      <MenuItemEditModal
        isOpen={modalOpen}
        item={editingItem}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        onSaved={fetchCatalog}
      />

      {/* Category Management Modal */}
      <CategoryManagementModal
        isOpen={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          fetchCatalog();
        }}
        items={items}
        onUpdated={fetchCatalog}
      />
    </div>
  );
}
