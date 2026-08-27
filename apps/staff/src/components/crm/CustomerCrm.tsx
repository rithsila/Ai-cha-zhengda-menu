import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Dices,
  Lock,
  Phone,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from '../ui';
import { CustomerDetailDrawer } from './CustomerDetailDrawer';
import { LuckyDrawModal } from './LuckyDrawModal';
import { TrustConfigModal } from './TrustConfigModal';
import type { CustomerSummary, CustomersResponse } from './types';

type CustomerCrmProps = {
  onSummaryChange?: (totalCustomers: number) => void;
};

export function CustomerCrm({ onSummaryChange }: CustomerCrmProps) {
  const { toast } = useToast();
  const onSummaryChangeRef = useRef(onSummaryChange);
  onSummaryChangeRef.current = onSummaryChange;

  // Search & Filter state
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'gold' | 'standard'>('all');
  const [page, setPage] = useState(1);

  // Data state
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [summary, setSummary] = useState<CustomersResponse['summary'] | null>(null);
  const [pagination, setPagination] = useState<CustomersResponse['pagination'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Selected customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [luckyDrawOpen, setLuckyDrawOpen] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        search: debouncedSearch,
        tier: tierFilter,
        page: String(page),
        limit: '50',
      });

      const data = await apiFetch<CustomersResponse>(`/api/customers?${queryParams.toString()}`);
      setCustomers(data.customers);
      setSummary(data.summary);
      setPagination(data.pagination);
      onSummaryChangeRef.current?.(data.summary.totalCustomers);
    } catch (err: any) {
      setError(err.message || "Couldn't load customer CRM data");
      toast({
        title: "Couldn't load customer CRM data",
        description: 'Check server connection and retry.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, tierFilter, page, toast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDebouncedSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  };

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return customers.find((c) => c.telegramUserId === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const handleCustomerUpdated = (updated: CustomerSummary) => {
    setCustomers((prev) =>
      prev.map((c) => (c.telegramUserId === updated.telegramUserId ? { ...c, ...updated } : c))
    );
  };

  const handleSelectCustomerFromDraw = (telegramUserId: string) => {
    setSelectedCustomerId(telegramUserId);
    // If user not in current list, search specifically for them
    const found = customers.find((c) => c.telegramUserId === telegramUserId);
    if (!found) {
      setSearchInput(telegramUserId);
      setDebouncedSearch(telegramUserId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Metrics Summary Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* 1. Total Customers */}
        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Total Customers
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-ink">
                {summary ? summary.totalCustomers : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Registered customer CRM profiles</p>
        </Card>

        {/* 2. Standard Tier */}
        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Standard Tier
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-ink">
                {summary ? summary.standardCount : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-surface-sunken text-ink-soft">
              <Lock className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Must pay upfront with KHQR</p>
        </Card>

        {/* 3. ⭐ Gold Tier */}
        <Card padding="md" className="border-amber-500/30 bg-amber-500/5 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                ⭐ Gold Tier
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                {summary ? summary.goldCount : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Sparkles className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Trusted for Cash on Delivery</p>
        </Card>

        {/* 4. Active Stamps */}
        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Active Stamps
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                {summary ? summary.totalStamps : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Coins className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            {summary ? `${summary.totalStamps * 10} loyalty points` : 'Loyalty points'}
          </p>
        </Card>

        {/* 5. Lucky Tickets */}
        <Card padding="md" className="border-border bg-surface shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Lucky Tickets
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                🎟️ {summary ? summary.totalLuckyTickets : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Dices className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Active tickets in draw pool</p>
        </Card>
      </div>

      {/* Action Header & Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Dynamic Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by phone, name, @username, or Telegram ID..."
            className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-10 text-sm font-medium text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:bg-surface-sunken hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        {/* Tier Filter Buttons & Action Modal Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tier Segmented Buttons */}
          <div className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => {
                setTierFilter('all');
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                tierFilter === 'all'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              All {summary ? `(${summary.totalCustomers})` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setTierFilter('gold');
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1 ${
                tierFilter === 'gold'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              <Star className="size-3 fill-current" />
              ⭐ Gold {summary ? `(${summary.goldCount})` : ''}
            </button>
            <button
              type="button"
              onClick={() => {
                setTierFilter('standard');
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                tierFilter === 'standard'
                  ? 'bg-surface-sunken text-ink shadow-xs'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              Standard {summary ? `(${summary.standardCount})` : ''}
            </button>
          </div>

          {/* Action Modals */}
          <Button
            variant="secondary"
            size="md"
            onClick={() => setConfigModalOpen(true)}
            className="h-10 gap-1.5 font-bold text-xs"
          >
            <Settings className="size-3.5" />
            Settings
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => setLuckyDrawOpen(true)}
            className="h-10 gap-1.5 font-bold text-xs bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white border-0 shadow-sm"
          >
            <Dices className="size-4" />
            Lucky Draw
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchCustomers}
            aria-label="Refresh customer list"
            className="size-10 rounded-xl"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-accent' : 'text-ink-soft'}`} />
          </Button>
        </div>
      </div>

      {/* Main Content Area: Selected Customer Drawer OR Customer Table List */}
      {selectedCustomer ? (
        <CustomerDetailDrawer
          customerSummary={selectedCustomer}
          onClose={() => setSelectedCustomerId(null)}
          onCustomerUpdated={handleCustomerUpdated}
        />
      ) : null}

      {/* Customer List Card & Table */}
      <Card padding="none" className="overflow-hidden border-border bg-surface shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <h3 className="font-bold text-ink">Customers</h3>
            <Badge variant="default" className="text-[11px]">
              {pagination ? `${pagination.total} matching` : `${customers.length} records`}
            </Badge>
          </div>
          {debouncedSearch && (
            <span className="text-xs text-ink-soft">
              Filtered by &ldquo;<strong className="text-ink">{debouncedSearch}</strong>&rdquo;
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <CircleAlert className="mx-auto size-10 text-danger" />
            <p className="mt-2 text-sm font-bold text-ink">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={fetchCustomers}>
              Retry Loading
            </Button>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Users className="size-10" />}
              title="No customers found"
              description={
                debouncedSearch
                  ? `No customer records matched "${debouncedSearch}". Try a different name, phone, or Telegram ID.`
                  : 'Customer records will appear here as orders and Telegram interactions occur.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-sunken/40 font-bold uppercase tracking-wider text-ink-soft">
                  <th className="py-3.5 pl-5 pr-3">Customer</th>
                  <th className="py-3.5 px-3">Phone</th>
                  <th className="py-3.5 px-3">Trust Tier</th>
                  <th className="py-3.5 px-3">Orders &amp; Spend</th>
                  <th className="py-3.5 px-3">Stamps</th>
                  <th className="py-3.5 px-3">Lucky Tickets</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 font-medium">
                {customers.map((c) => {
                  const isGold = c.tier === 'gold';
                  const isSelected = selectedCustomerId === c.telegramUserId;
                  const nameDisplay =
                    c.contactName ||
                    [c.firstName, c.lastName].filter(Boolean).join(' ') ||
                    (c.username ? `@${c.username}` : `Customer #${c.telegramUserId}`);

                  const stamps = Math.floor((c.loyaltyPoints || 0) / 10);

                  return (
                    <tr
                      key={c.telegramUserId}
                      className={`transition-colors hover:bg-surface-sunken/40 ${
                        isSelected ? 'bg-accent/10 border-l-4 border-l-accent' : ''
                      }`}
                    >
                      {/* Customer Info */}
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs ${
                              isGold
                                ? 'bg-amber-500 text-white ring-1 ring-amber-400'
                                : 'bg-surface-sunken text-ink ring-1 ring-border'
                            }`}
                          >
                            {isGold ? '⭐' : (c.firstName?.[0] || c.contactName?.[0] || 'U').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink text-xs">{nameDisplay}</p>
                            <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                              <span className="font-mono">ID: {c.telegramUserId}</span>
                              {c.username && <span className="font-mono text-accent">@{c.username}</span>}
                            </div>
                            {(c.building || c.roomNumber) && (
                              <p className="text-[10px] text-ink-soft truncate">
                                {c.building ? `Bldg ${c.building}` : ''} {c.roomNumber ? `Rm ${c.roomNumber}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-3">
                        {c.phoneNumber ? (
                          <a
                            href={`tel:${c.phoneNumber}`}
                            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                          >
                            <Phone className="size-3" />
                            <span>{c.phoneNumber}</span>
                          </a>
                        ) : (
                          <span className="text-ink-faint">No phone</span>
                        )}
                      </td>

                      {/* Trust Tier Badge */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isGold
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                              : 'bg-surface-sunken text-ink-soft border border-border'
                          }`}
                        >
                          {isGold ? (
                            <>
                              <Star className="size-3 fill-current text-amber-500" />
                              ⭐ Gold (Trusted)
                            </>
                          ) : (
                            <>
                              <Shield className="size-3 text-ink-soft" />
                              Standard (Pay First)
                            </>
                          )}
                        </span>
                      </td>

                      {/* Orders & Spend */}
                      <td className="py-3.5 px-3">
                        <div>
                          <p className="font-bold text-ink">
                            {c.totalOrders} {c.totalOrders === 1 ? 'order' : 'orders'}{' '}
                            <span className="text-accent">(${Number(c.totalSpent || 0).toFixed(2)})</span>
                          </p>
                          {c.lastOrderDate && (
                            <p className="text-[10px] text-ink-faint">
                              Last: {new Date(c.lastOrderDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Stamps */}
                      <td className="py-3.5 px-3">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {stamps} {stamps === 1 ? 'stamp' : 'stamps'}
                        </span>
                        <span className="text-[10px] text-ink-faint block">
                          ({c.loyaltyPoints || 0} pts)
                        </span>
                      </td>

                      {/* Lucky Tickets */}
                      <td className="py-3.5 px-3">
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          🎟️ {c.luckyTickets || 0}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <Button
                          type="button"
                          variant={isSelected ? 'primary' : 'secondary'}
                          size="md"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedCustomerId(null);
                            } else {
                              setSelectedCustomerId(c.telegramUserId);
                            }
                          }}
                          className="h-8 px-3 text-xs font-bold"
                        >
                          {isSelected ? 'Close' : 'Edit'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-ink-soft">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total customers)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2.5"
              >
                <ChevronLeft className="size-3.5" /> Prev
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-2.5"
              >
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Configuration Modal */}
      <TrustConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSaved={fetchCustomers}
      />

      {/* Lucky Draw Modal */}
      <LuckyDrawModal
        isOpen={luckyDrawOpen}
        onClose={() => setLuckyDrawOpen(false)}
        onSelectCustomer={handleSelectCustomerFromDraw}
        summaryData={
          summary
            ? {
                totalCustomers: summary.totalCustomers,
                goldCount: summary.goldCount,
                standardCount: summary.standardCount,
                totalLuckyTickets: summary.totalLuckyTickets,
              }
            : undefined
        }
      />
    </div>
  );
}
