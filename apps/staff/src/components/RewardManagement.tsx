import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Award,
  CircleAlert,
  Coins,
  Dices,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { apiFetch, resolveImageUrl } from '../lib/api';
import type { MenuItemFull } from './MenuItemEditModal';
import { LuckyDrawManagement } from './crm/LuckyDrawManagement';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from './ui';

export type Reward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  image?: string | null;
  isActive: boolean;
};

type RewardSubTab = 'catalog' | 'luckydraw';

export function RewardManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<RewardSubTab>('catalog');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewardsError, setRewardsError] = useState(false);

  // Add reward modal/form state
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newImage, setNewImage] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Catalog items for reward selector
  const [catalogItems, setCatalogItems] = useState<MenuItemFull[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<MenuItemFull | null>(null);
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchRewards = useCallback(async () => {
    setLoading(true);
    setRewardsError(false);
    try {
      const [rewardsData, catalogData] = await Promise.all([
        apiFetch<Reward[]>('/api/rewards?includeInactive=1'),
        apiFetch<MenuItemFull[]>('/api/catalog?includeInactive=false').catch(() => []),
      ]);
      setRewards(rewardsData);
      setCatalogItems(catalogData);
    } catch {
      setRewardsError(true);
      toast({ title: "Couldn't load rewards", variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setItemDropdownOpen(false);
      }
    }
    if (itemDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [itemDropdownOpen]);

  const filteredCatalogItems = useMemo(() => {
    if (!catalogSearch.trim()) return catalogItems.slice(0, 10);
    const q = catalogSearch.toLowerCase();
    return catalogItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.brand && item.brand.toLowerCase().includes(q)),
    );
  }, [catalogItems, catalogSearch]);

  const handleSelectCatalogItem = (item: MenuItemFull) => {
    setSelectedCatalogItem(item);
    setNewName(`Free ${item.name}`);
    setNewDescription(item.description || `${item.category} • Redeemable for loyalty points`);
    setNewImage(item.image || null);
    setItemDropdownOpen(false);
    setCatalogSearch('');
  };

  const handleAddReward = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const cost = Number(newCost);
    if (!name) {
      setAddError('Enter a reward name.');
      return;
    }
    if (!Number.isInteger(cost) || cost < 1) {
      setAddError('Stamps cost must be a whole number of 1 or more.');
      return;
    }
    const pointsCost = cost <= 50 ? cost * 10 : cost;
    setAdding(true);
    setAddError(null);
    try {
      const created = await apiFetch<Reward>('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newDescription.trim() || undefined,
          pointsCost,
          image: newImage || undefined,
          isActive: true,
        }),
      });
      setRewards((prev) => [created, ...prev]);
      toast({ title: 'Reward added', variant: 'success' });
      setNewName('');
      setNewDescription('');
      setNewCost('');
      setNewImage(null);
      setSelectedCatalogItem(null);
      setCatalogSearch('');
      setAddOpen(false);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: "Couldn't add reward",
        description:
          status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleToggleReward = async (reward: Reward) => {
    setTogglingId(reward.id);
    const nextActive = !reward.isActive;
    try {
      const updated = await apiFetch<Reward>(`/api/rewards/${reward.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      setRewards((prev) => prev.map((r) => (r.id === reward.id ? updated : r)));
      toast({
        title: nextActive ? 'Reward activated' : 'Reward deactivated',
        variant: 'success',
      });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: `Couldn't ${nextActive ? 'activate' : 'deactivate'} reward`,
        description:
          status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sub navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'catalog'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'bg-surface text-ink-soft hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            <Award className="size-4" />
            <span>Reward Catalog</span>
            {rewards.length > 0 && (
              <span
                className={`ml-1 rounded-none px-2 py-0.5 text-xs font-bold ${
                  activeTab === 'catalog'
                    ? 'bg-white/20 text-on-accent'
                    : 'bg-surface-sunken text-ink-soft'
                }`}
              >
                {rewards.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('luckydraw')}
            className={`inline-flex items-center gap-2 rounded-none px-4 py-2 text-sm font-bold transition-all ${
              activeTab === 'luckydraw'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'bg-surface text-ink-soft hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            <Dices className="size-4" />
            <span>Lucky Draw Wheel</span>
          </button>
        </div>
      </div>

      {activeTab === 'luckydraw' ? (
        <LuckyDrawManagement />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-ink">Rewards Catalog</h3>
              <p className="text-xs text-ink-soft">Manage loyalty prizes customer can redeem</p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" />
              Add New Reward
            </Button>
          </div>

          {addOpen && (
            <Card padding="lg" className="border-2 border-accent bg-surface shadow-md">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h4 className="font-bold text-ink">Create New Reward</h4>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false);
                    setAddError(null);
                    setSelectedCatalogItem(null);
                    setNewImage(null);
                    setCatalogSearch('');
                  }}
                  className="rounded-none p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>

              <form onSubmit={handleAddReward} className="mt-4 space-y-4">
                {/* Quick Menu Item Picker */}
                <div ref={dropdownRef} className="rounded-none border border-border bg-surface-sunken/40 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-ink flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-accent" />
                      Quick Select from Menu
                    </label>
                    {selectedCatalogItem ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCatalogItem(null);
                          setNewName('');
                          setNewDescription('');
                          setNewImage(null);
                        }}
                        className="text-xs font-bold text-danger hover:underline"
                      >
                        Clear selected item
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink-faint">Pick an item to auto-fill</span>
                    )}
                  </div>

                  <div className="relative">
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 size-4 text-ink-faint pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search menu item (e.g. Milk Tea, Sundae, Fries...)"
                        value={catalogSearch}
                        onFocus={() => setItemDropdownOpen(true)}
                        onChange={(e) => {
                          setCatalogSearch(e.target.value);
                          setItemDropdownOpen(true);
                        }}
                        className="h-10 w-full rounded-none border border-border bg-surface pl-9 pr-3 text-xs font-medium text-ink outline-none focus:border-accent"
                      />
                    </div>

                    {itemDropdownOpen && (
                      <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-none border border-border bg-surface shadow-xl p-1 space-y-1">
                        {catalogItems.length === 0 ? (
                          <p className="p-3 text-center text-xs text-ink-soft">No menu items found</p>
                        ) : filteredCatalogItems.length === 0 ? (
                          <p className="p-3 text-center text-xs text-ink-soft">No matching items</p>
                        ) : (
                          filteredCatalogItems.map((item) => (
                            <button
                              key={item.id || item.name}
                              type="button"
                              onClick={() => handleSelectCatalogItem(item)}
                              className="flex w-full items-center justify-between rounded-none p-2 text-left hover:bg-surface-sunken transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative size-8 shrink-0 overflow-hidden rounded-none border border-border/50 bg-surface-sunken flex items-center justify-center">
                                  {item.image ? (
                                    <img
                                      src={resolveImageUrl(item.image)}
                                      alt={item.name}
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : null}
                                  <Award className="size-4 text-ink-faint absolute pointer-events-none -z-10" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold text-ink">{item.name}</p>
                                  <p className="text-[10px] text-ink-soft capitalize">
                                    {item.brand} • {item.category}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <span className="text-xs font-bold text-ink">
                                  ${Number(item.basePrice || 0).toFixed(2)}
                                </span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {selectedCatalogItem && (
                    <div className="flex items-center gap-3 rounded-none border border-accent/30 bg-accent/10 p-2.5">
                      <div className="relative size-10 shrink-0 overflow-hidden rounded-none border border-accent/40 bg-accent/20 flex items-center justify-center">
                        {selectedCatalogItem.image ? (
                          <img
                            src={resolveImageUrl(selectedCatalogItem.image)}
                            alt={selectedCatalogItem.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <Sparkles className="size-5 text-accent absolute pointer-events-none -z-10" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-ink truncate">
                          Selected: {selectedCatalogItem.name}
                        </p>
                        <p className="text-[10px] text-ink-soft capitalize">
                          {selectedCatalogItem.brand} • {selectedCatalogItem.category} • Base Price: ${Number(selectedCatalogItem.basePrice || 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label htmlFor="reward-name" className="block text-xs font-bold uppercase text-ink">
                      Reward Name <span className="text-danger">*</span>
                    </label>
                    <input
                      id="reward-name"
                      type="text"
                      placeholder="e.g. Free Passion Fruit Tea (M)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="mt-1.5 h-11 w-full rounded-none border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label htmlFor="reward-cost" className="block text-xs font-bold uppercase text-ink">
                      Stamps Cost <span className="text-danger">*</span>
                    </label>
                    <input
                      id="reward-cost"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="10"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      className="mt-1.5 h-11 w-full rounded-none border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <p className="mt-1 text-[10px] text-ink-faint">10 stamps = 1 full reward card</p>
                  </div>
                </div>

                <div>
                  <label htmlFor="reward-description" className="block text-xs font-bold uppercase text-ink">
                    Description <span className="text-xs font-normal text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="reward-description"
                    type="text"
                    placeholder="e.g. Medium size cup, choice of toppings"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-none border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>

                {addError && (
                  <p className="text-xs font-semibold text-danger">{addError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAddOpen(false);
                      setAddError(null);
                      setSelectedCatalogItem(null);
                      setNewImage(null);
                      setCatalogSearch('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={adding}>
                    Save &amp; Publish Reward
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-44 w-full rounded-none" />
              <Skeleton className="h-44 w-full rounded-none" />
              <Skeleton className="h-44 w-full rounded-none" />
            </div>
          ) : rewardsError ? (
            <Card padding="lg" className="text-center">
              <CircleAlert className="mx-auto size-8 text-danger" />
              <p className="mt-2 text-sm text-danger">Failed to load rewards list.</p>
              <Button variant="secondary" className="mt-3" onClick={fetchRewards}>
                Retry
              </Button>
            </Card>
          ) : rewards.length === 0 ? (
            <EmptyState
              icon={<Award className="size-10" />}
              title="No Rewards Configured"
              description="Click 'Add New Reward' to create redemption prizes."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rewards.map((reward) => (
                <Card
                  key={reward.id}
                  padding="lg"
                  className={`flex flex-col justify-between transition-all ${
                    reward.isActive ? 'border-border bg-surface' : 'border-border/60 bg-surface-sunken/40 opacity-75'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="relative size-9 shrink-0 overflow-hidden rounded-none border border-border bg-accent-soft flex items-center justify-center">
                        {reward.image ? (
                          <img
                            src={resolveImageUrl(reward.image)}
                            alt={reward.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <Coins className="size-4 text-accent absolute pointer-events-none -z-10" />
                      </div>
                      <Badge variant={reward.isActive ? 'success' : 'default'} dot>
                        {reward.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <h4 className="mt-3 font-bold text-ink">{reward.name}</h4>
                    {reward.description && (
                      <p className="mt-1 text-xs text-ink-soft line-clamp-2">{reward.description}</p>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-ink-faint">Redeem For</span>
                      <p className="text-base font-extrabold text-accent">
                        {Math.round(reward.pointsCost / 10)} stamps{' '}
                        <span className="text-xs font-normal text-ink-faint">
                          ({reward.pointsCost} pts)
                        </span>
                      </p>
                    </div>
                    <Button
                      variant={reward.isActive ? 'secondary' : 'success'}
                      size="md"
                      loading={togglingId === reward.id}
                      onClick={() => handleToggleReward(reward)}
                    >
                      {reward.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
