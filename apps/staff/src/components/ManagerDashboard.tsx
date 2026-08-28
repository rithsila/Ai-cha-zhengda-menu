import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Award,
  BarChart3,
  CheckCircle,
  CircleAlert,
  Clock,
  Coins,
  Dices,
  DollarSign,
  MessageSquare,
  Phone,
  Plus,
  Receipt,
  Search,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Users2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { MenuItemFull } from './MenuItemEditModal';
import { StoreSettings } from './StoreSettings';
import { CustomerCrm } from './crm/CustomerCrm';
import { LuckyDrawManagement } from './crm/LuckyDrawManagement';
import type { CustomersResponse } from './crm/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  Skeleton,
  useToast,
} from './ui';

type AnalyticsData = {
  totalRevenue: number;
  orderCount: number;
  byDate: Record<string, number>;
};

type Reward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  image?: string | null;
  isActive: boolean;
};

type FeedbackReport = {
  id: string;
  telegramUserId?: string | null;
  userName?: string | null;
  userPhone?: string | null;
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt: string;
};

type Range = 'today' | 'week' | 'month' | 'all';

const RANGES: Array<{ id: Range; label: string; days: string; caption: string }> = [
  { id: 'today', label: 'Today', days: '1', caption: 'Today' },
  { id: 'week', label: '7 days', days: '7', caption: 'Last 7 days' },
  { id: 'month', label: '30 days', days: '30', caption: 'Last 30 days' },
  { id: 'all', label: 'All Time', days: 'all', caption: 'All time' },
];

type StaffAccount = {
  id: string;
  telegramUserId?: string | null;
  phoneNumber?: string | null;
  name: string;
  role: 'staff' | 'manager';
  isActive: boolean;
  isEnvAdmin?: boolean;
  createdAt: string;
};

const PANEL_ID = 'manager-panel';

type ManagerSubTab = 'analytics' | 'settings' | 'feedback' | 'loyalty' | 'luckydraw' | 'rewards' | 'staff';

export function ManagerDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ManagerSubTab>('analytics');
  const [range, setRange] = useState<Range>('week');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [totalCustomers, setTotalCustomers] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<'session' | 'network' | null>(null);
  const [rewardsError, setRewardsError] = useState(false);

  const handleSummaryChange = useCallback((count: number) => {
    setTotalCustomers(count);
  }, []);

  // Rewards: add + toggle + menu item picker
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

  // Staff & Manager Accounts
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'staff' | 'manager'>('staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffActionId, setStaffActionId] = useState<string | null>(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);

  // Feedback & Reports
  const [feedbacks, setFeedbacks] = useState<FeedbackReport[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);

  const fetchStaffAccounts = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const data = await apiFetch<StaffAccount[]>('/api/staff-accounts');
      setStaffAccounts(data);
    } catch {
      toast({
        title: "Couldn't load staff accounts",
        variant: 'error',
      });
    } finally {
      setLoadingStaff(false);
    }
  }, [toast]);

  const fetchFeedbacks = useCallback(async () => {
    setLoadingFeedback(true);
    try {
      const data = await apiFetch<FeedbackReport[]>('/api/feedback');
      setFeedbacks(data);
    } catch {
      toast({
        title: "Couldn't load feedback reports",
        variant: 'error',
      });
    } finally {
      setLoadingFeedback(false);
    }
  }, [toast]);

  const handleUpdateFeedbackStatus = async (id: string, status: 'new' | 'reviewed' | 'resolved') => {
    setFeedbackActionId(id);
    try {
      const updated = await apiFetch<FeedbackReport>(`/api/feedback/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setFeedbacks((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast({
        title: status === 'resolved' ? 'Marked as Resolved' : 'Status updated',
        variant: 'success',
      });
    } catch {
      toast({ title: "Couldn't update status", variant: 'error' });
    } finally {
      setFeedbackActionId(null);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    setFeedbackActionId(id);
    try {
      await apiFetch(`/api/feedback/${id}`, { method: 'DELETE' });
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      toast({ title: 'Feedback report deleted', variant: 'info' });
    } catch {
      toast({ title: "Couldn't delete report", variant: 'error' });
    } finally {
      setFeedbackActionId(null);
    }
  };

  const fetchAnalytics = useCallback(async (selectedRange: Range) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await apiFetch<AnalyticsData>(
        `/api/analytics/sales?days=${RANGES.find((r) => r.id === selectedRange)!.days}`,
      );
      setAnalytics(data);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      setAnalyticsError(status === 401 ? 'session' : 'network');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const handleRangeChange = (newRange: Range) => {
    setRange(newRange);
    fetchAnalytics(newRange);
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setAnalyticsError(null);
    setRewardsError(false);
    const [analyticsResult, rewardsResult, catalogResult, customersResult] = await Promise.allSettled([
      apiFetch<AnalyticsData>(
        `/api/analytics/sales?days=${RANGES.find((r) => r.id === range)!.days}`,
      ),
      apiFetch<Reward[]>('/api/rewards?includeInactive=1'),
      apiFetch<MenuItemFull[]>('/api/catalog?includeInactive=false'),
      apiFetch<CustomersResponse>('/api/customers?limit=1'),
    ]);
    if (analyticsResult.status === 'fulfilled') {
      setAnalytics(analyticsResult.value);
    } else {
      const status = (analyticsResult.reason as Error & { status?: number }).status;
      setAnalyticsError(status === 401 ? 'session' : 'network');
    }
    if (rewardsResult.status === 'fulfilled') {
      setRewards(rewardsResult.value);
    } else {
      setRewardsError(true);
    }
    if (catalogResult.status === 'fulfilled') {
      setCatalogItems(catalogResult.value);
    }
    if (customersResult.status === 'fulfilled') {
      setTotalCustomers(customersResult.value.summary.totalCustomers);
    }
    fetchStaffAccounts();
    fetchFeedbacks();
    setLoading(false);
  }, [range, fetchStaffAccounts, fetchFeedbacks]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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

  const handleAddStaffAccount = async (e: FormEvent) => {
    e.preventDefault();
    const id = newStaffId.trim();
    const phone = newStaffPhone.trim();
    const name = newStaffName.trim();

    if (!name) {
      toast({ title: 'Please enter staff or manager name.', variant: 'error' });
      return;
    }
    if (!phone && !id) {
      toast({ title: 'Please provide either a Phone Number or Telegram User ID.', variant: 'error' });
      return;
    }
    if (id && !/^\d+$/.test(id)) {
      toast({ title: 'Telegram User ID must be numeric.', variant: 'error' });
      return;
    }

    setAddingStaff(true);
    try {
      const created = await apiFetch<StaffAccount>('/api/staff-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone || undefined,
          telegramUserId: id || undefined,
          name,
          role: newStaffRole,
        }),
      });
      setStaffAccounts((prev) => {
        const filtered = prev.filter((a) => a.id !== created.id && (!created.phoneNumber || a.phoneNumber !== created.phoneNumber));
        return [created, ...filtered];
      });
      toast({ title: `Added ${name} (${newStaffRole})`, variant: 'success' });
      setNewStaffId('');
      setNewStaffPhone('');
      setNewStaffName('');
      setNewStaffRole('staff');
      setAddStaffOpen(false);
    } catch (err: any) {
      toast({ title: "Couldn't add staff account", description: err.message, variant: 'error' });
    } finally {
      setAddingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (account: StaffAccount) => {
    if (account.isEnvAdmin) return;
    setStaffActionId(account.id);
    try {
      const updated = await apiFetch<StaffAccount>(`/api/staff-accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      setStaffAccounts((prev) => prev.map((a) => (a.id === account.id ? updated : a)));
      toast({
        title: updated.isActive ? 'Account activated' : 'Account deactivated',
        variant: 'info',
      });
    } catch {
      toast({ title: "Couldn't update status", variant: 'error' });
    } finally {
      setStaffActionId(null);
    }
  };

  const handleDeleteStaffAccount = async (account: StaffAccount) => {
    if (account.isEnvAdmin) return;
    setStaffActionId(account.id);
    try {
      await apiFetch(`/api/staff-accounts/${account.id}`, { method: 'DELETE' });
      setStaffAccounts((prev) => prev.filter((a) => a.id !== account.id));
      toast({ title: `Removed ${account.name}`, variant: 'info' });
    } catch {
      toast({ title: "Couldn't remove staff account", variant: 'error' });
    } finally {
      setStaffActionId(null);
    }
  };

  const rangeCaption = RANGES.find((r) => r.id === range)!.caption;
  const entries = analytics
    ? Object.entries(analytics.byDate).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const max = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0;
  const valueLabelEvery = entries.length <= 14 ? 1 : Math.ceil(entries.length / 14);
  const dateLabelEvery = Math.max(1, Math.ceil(entries.length / 10));

  const activeRewardsCount = rewards.filter((r) => r.isActive).length;
  const newFeedbackCount = feedbacks.filter((f) => f.status === 'new').length;

  const subTabs: Array<{ id: ManagerSubTab; label: string; icon: React.ReactNode; badge?: string | number }> = [
    { id: 'analytics', label: 'Sales & Analytics', icon: <BarChart3 className="size-4" /> },
    { id: 'settings', label: 'Store Settings', icon: <Sliders className="size-4" /> },
    { id: 'feedback', label: 'Issues & Feedback', icon: <MessageSquare className="size-4" />, badge: newFeedbackCount > 0 ? `${newFeedbackCount} new` : (feedbacks.length > 0 ? feedbacks.length : undefined) },
    { id: 'loyalty', label: 'Customers', icon: <Users className="size-4" />, badge: totalCustomers !== undefined && totalCustomers > 0 ? totalCustomers : undefined },
    { id: 'luckydraw', label: 'Lucky Draw', icon: <Dices className="size-4" /> },
    { id: 'rewards', label: 'Reward Catalog', icon: <Award className="size-4" />, badge: rewards.length },
    { id: 'staff', label: 'Staff & Accounts', icon: <Users2 className="size-4" />, badge: staffAccounts.length },
  ];


  return (
    <div className="flex flex-col gap-6">
      {/* Sub navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2">
          {subTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-accent text-on-accent shadow-sm'
                    : 'bg-surface text-ink-soft hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined ? (
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                      isActive
                        ? 'bg-white/20 text-on-accent'
                        : 'bg-surface-sunken text-ink-soft'
                    }`}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        tabIndex={-1}
        className="flex flex-col gap-6"
      >
        {activeTab === 'analytics' ? (
          loading || analyticsLoading ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink">Performance Overview</h3>
                  <p className="text-xs text-ink-soft">Metrics filtered by chosen date window</p>
                </div>
                <Segmented
                  options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
                  value={range}
                  onChange={handleRangeChange}
                  ariaLabel="Reporting period"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-80 w-full rounded-2xl sm:col-span-2 lg:col-span-4" />
              </div>
            </div>
          ) : analyticsError ? (
            <Card padding="lg" className="text-center">
              <CircleAlert className="mx-auto size-10 text-danger" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-ink">
                {analyticsError === 'session'
                  ? 'Manager session expired'
                  : "Couldn't load analytics data"}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {analyticsError === 'session'
                  ? 'Your manager authentication has expired. Please retry or sign in again.'
                  : 'Check your server connection and retry.'}
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={fetchDashboardData}
              >
                Try Again
              </Button>
            </Card>
          ) : analytics ? (
            <div className="space-y-6">
              {/* Range Selector & Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-ink">Performance Overview</h3>
                  <p className="text-xs text-ink-soft">Metrics filtered by chosen date window</p>
                </div>
                <Segmented
                  options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
                  value={range}
                  onChange={handleRangeChange}
                  ariaLabel="Reporting period"
                />
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card padding="lg" className="relative overflow-hidden border-border bg-surface">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        Gross Revenue
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                        ${analytics.totalRevenue.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
                      <DollarSign className="size-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
                    <TrendingUp className="size-3.5 text-success" />
                    <span>Calculated for {rangeCaption}</span>
                  </div>
                </Card>

                <Card padding="lg" className="relative overflow-hidden border-border bg-surface">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        Paid Orders
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                        {analytics.orderCount}
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-status-preparing-soft text-status-preparing">
                      <Receipt className="size-5" />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-ink-faint">
                    Total completed &amp; paid tickets
                  </div>
                </Card>

                <Card padding="lg" className="relative overflow-hidden border-border bg-surface">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        Average Ticket
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                        {analytics.orderCount > 0
                          ? `$${(analytics.totalRevenue / analytics.orderCount).toFixed(2)}`
                          : '—'}
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-status-pending-soft text-status-pending">
                      <BarChart3 className="size-5" />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-ink-faint">
                    Revenue per completed order
                  </div>
                </Card>

                <Card padding="lg" className="relative overflow-hidden border-border bg-surface">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        Active Rewards
                      </p>
                      <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                        {activeRewardsCount} <span className="text-sm font-normal text-ink-faint">/ {rewards.length}</span>
                      </p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Award className="size-5" />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-ink-faint">
                    Redeemable catalog perks
                  </div>
                </Card>
              </div>

              {/* Sales Chart Card */}
              <Card padding="lg" className="border-border bg-surface">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-ink">Daily Sales Trajectory</h4>
                    <p className="text-xs text-ink-soft">Revenue distribution per day across {rangeCaption}</p>
                  </div>
                  <Badge variant="default">{entries.length} data points</Badge>
                </div>

                {entries.length === 0 ? (
                  <EmptyState
                    icon={<BarChart3 className="size-10" />}
                    title="No paid sales recorded"
                    description="When orders are marked paid or completed, sales appear here automatically."
                  />
                ) : (
                  <div>
                    <div className="flex h-64 items-end gap-2 pt-4" aria-hidden="true">
                      {entries.map(([date, amount], i) => {
                        const pct = max > 0 ? (amount / max) * 100 : 0;
                        const showValue = i % valueLabelEvery === 0;
                        return (
                          <div
                            key={date}
                            className="group relative flex h-full flex-1 flex-col justify-end"
                          >
                            <span className="mb-1.5 h-4 shrink-0 text-center text-[10px] font-semibold tabular-nums text-ink-soft">
                              {showValue && amount > 0 ? `$${amount.toFixed(0)}` : ''}
                            </span>
                            <div
                              className="w-full rounded-t-md bg-accent/85 transition-all duration-200 group-hover:bg-accent group-hover:shadow-md"
                              style={{
                                height: `calc((100% - 1.5rem) * ${pct / 100})`,
                                minHeight: amount > 0 ? '6px' : '2px',
                              }}
                            />
                            {/* Hover Tooltip */}
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                              <p className="text-[10px] font-medium text-ink-soft">{date}</p>
                              <p className="text-sm font-bold text-accent">${amount.toFixed(2)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex gap-2 border-t border-border pt-2">
                      {entries.map(([date], i) => (
                        <div key={date} className="flex-1 text-center">
                          {i % dateLabelEvery === 0 && (
                            <span className="text-[10px] font-semibold tabular-nums text-ink-faint">
                              {date.slice(5)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          ) : null
        ) : activeTab === 'settings' ? (
          <StoreSettings />
        ) : activeTab === 'feedback' ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink">Customer Reports &amp; Feedback</h3>
                <p className="text-xs text-ink-soft">
                  Issues and feedback submitted by customers via Telegram bot (/report or /feedback)
                </p>
              </div>
              <Badge variant="default">
                {feedbacks.length} Total {newFeedbackCount > 0 ? `(${newFeedbackCount} new)` : ''}
              </Badge>
            </div>

            {loadingFeedback ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : feedbacks.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="size-10" />}
                title="No issue reports yet"
                description="When customers send /report or /feedback to the Telegram bot, their messages will arrive here."
              />
            ) : (
              <div className="space-y-3">
                {feedbacks.map((item) => {
                  const isNew = item.status === 'new';
                  const isResolved = item.status === 'resolved';

                  return (
                    <Card
                      key={item.id}
                      padding="lg"
                      className={`border transition-all duration-150 ${
                        isNew
                          ? 'border-accent/40 bg-accent-soft/20 shadow-xs'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                isNew
                                  ? 'danger'
                                  : isResolved
                                    ? 'ready'
                                    : 'preparing'
                              }
                            >
                              {item.status.toUpperCase()}
                            </Badge>

                            <span className="text-sm font-bold text-ink">
                              {item.userName || 'Customer'}
                            </span>

                            {item.telegramUserId && (
                              <span className="font-mono text-xs text-ink-faint">
                                (ID: {item.telegramUserId})
                              </span>
                            )}

                            {item.userPhone && (
                              <a
                                href={`tel:${item.userPhone}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                              >
                                <Phone className="size-3" />
                                <span>{item.userPhone}</span>
                              </a>
                            )}
                          </div>

                          <div className="rounded-xl bg-surface-sunken/50 p-3.5 text-sm font-medium text-ink leading-relaxed whitespace-pre-wrap">
                            {item.message}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                            <Clock className="size-3.5" />
                            <span>
                              Received: {new Date(item.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0">
                          {item.status !== 'resolved' ? (
                            <Button
                              variant="primary"
                              size="md"
                              loading={feedbackActionId === item.id}
                              onClick={() => handleUpdateFeedbackStatus(item.id, 'resolved')}
                              className="h-9 px-3 gap-1.5 text-xs font-bold"
                            >
                              <CheckCircle className="size-3.5" />
                              Mark Resolved
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="md"
                              loading={feedbackActionId === item.id}
                              onClick={() => handleUpdateFeedbackStatus(item.id, 'new')}
                              className="h-9 px-3 text-xs"
                            >
                              Reopen
                            </Button>
                          )}

                          {item.status === 'new' && (
                            <Button
                              variant="secondary"
                              size="md"
                              loading={feedbackActionId === item.id}
                              onClick={() => handleUpdateFeedbackStatus(item.id, 'reviewed')}
                              className="h-9 px-3 text-xs"
                            >
                              Mark Reviewed
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon"
                            loading={feedbackActionId === item.id}
                            onClick={() => handleDeleteFeedback(item.id)}
                            className="size-9 text-danger hover:bg-danger-soft hover:text-danger text-xs"
                            aria-label="Delete report"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>

                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'loyalty' ? (
          <CustomerCrm onSummaryChange={handleSummaryChange} />
        ) : activeTab === 'luckydraw' ? (
          <LuckyDrawManagement />
        ) : activeTab === 'rewards' ? (
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
                    className="rounded-lg p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form onSubmit={handleAddReward} className="mt-4 space-y-4">
                  {/* Quick Menu Item Picker */}
                  <div ref={dropdownRef} className="rounded-xl border border-border bg-surface-sunken/40 p-3.5 space-y-2.5">
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
                          className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-xs font-medium text-ink outline-none focus:border-accent"
                        />
                      </div>

                      {itemDropdownOpen && (
                        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-xl p-1 space-y-1">
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
                                className="flex w-full items-center justify-between rounded-lg p-2 text-left hover:bg-surface-sunken transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {item.image ? (
                                    <img
                                      src={item.image}
                                      alt={item.name}
                                      className="size-8 rounded-lg object-cover shrink-0 border border-border/50"
                                    />
                                  ) : (
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-faint">
                                      <Award className="size-4" />
                                    </div>
                                  )}
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
                      <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 p-2.5">
                        {selectedCatalogItem.image ? (
                          <img
                            src={selectedCatalogItem.image}
                            alt={selectedCatalogItem.name}
                            className="size-10 rounded-lg object-cover border border-accent/40"
                          />
                        ) : (
                          <div className="flex size-10 items-center justify-center rounded-lg bg-accent/20 text-accent">
                            <Sparkles className="size-5" />
                          </div>
                        )}
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
                        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
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
                        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
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
                      className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
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

            {rewardsError ? (
              <Card padding="lg" className="text-center">
                <CircleAlert className="mx-auto size-8 text-danger" />
                <p className="mt-2 text-sm text-danger">Failed to load rewards list.</p>
                <Button variant="secondary" className="mt-3" onClick={fetchDashboardData}>
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
                        {reward.image ? (
                          <img
                            src={reward.image}
                            alt={reward.name}
                            className="size-9 rounded-xl object-cover border border-border"
                          />
                        ) : (
                          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                            <Coins className="size-4" />
                          </div>
                        )}
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
        ) : activeTab === 'staff' ? (
          <div className="space-y-6">
            {/* Header + Add Action */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-ink">Staff &amp; Manager Accounts</h3>
                <p className="text-xs text-ink-soft">
                  Authorize Telegram accounts to log into the staff portal.
                </p>
              </div>
              <Button
                variant={addStaffOpen ? 'secondary' : 'primary'}
                size="md"
                onClick={() => setAddStaffOpen(!addStaffOpen)}
                className="gap-2 font-bold"
              >
                {addStaffOpen ? (
                  <>
                    <X className="size-4" />
                    Close Form
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Add Staff / Manager
                  </>
                )}
              </Button>
            </div>

            {/* Add Account Drawer / Form */}
            {addStaffOpen && (
              <Card padding="lg" className="border-accent/40 bg-surface shadow-md">
                <form onSubmit={handleAddStaffAccount} className="space-y-4">
                  <div className="flex items-center gap-2 font-bold text-ink">
                    <UserPlus className="size-5 text-accent" />
                    <span>Authorize New Staff Member</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Staff / Manager Name <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Sok Dara (Barista)"
                        value={newStaffName}
                        onChange={(e) => setNewStaffName(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Phone Number (for SMS OTP)
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        placeholder="e.g. 012 345 678"
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Telegram ID (Optional)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 715714775"
                        value={newStaffId}
                        onChange={(e) => setNewStaffId(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Assigned Role
                      </label>
                      <select
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value as 'staff' | 'manager')}
                        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                      >
                        <option value="staff">Staff (Orders &amp; Stock)</option>
                        <option value="manager">Manager (Full Access + Reports)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => setAddStaffOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      loading={addingStaff}
                      className="font-bold"
                    >
                      Save &amp; Grant Access
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Staff Accounts List */}
            {loadingStaff ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : staffAccounts.length === 0 ? (
              <EmptyState
                icon={<Users2 className="size-10" />}
                title="No Staff Accounts Configured"
                description="Click 'Add Staff / Manager' to allow team members to log in."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {staffAccounts.map((account) => {
                  const isManager = account.role === 'manager';
                  return (
                    <Card
                      key={account.id}
                      padding="md"
                      className={`flex flex-col justify-between transition-all ${
                        account.isActive
                          ? 'border-border bg-surface shadow-xs'
                          : 'border-border/60 bg-surface-sunken/40 opacity-70'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex size-8 items-center justify-center rounded-lg ${
                                isManager
                                  ? 'bg-accent/15 text-accent'
                                  : 'bg-surface-sunken text-ink-soft'
                              }`}
                            >
                              {isManager ? <Shield className="size-4" /> : <UserCheck className="size-4" />}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-ink">{account.name}</h4>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {account.phoneNumber && (
                                  <p className="font-mono text-[11px] text-ink-soft flex items-center gap-1">
                                    <Phone className="size-3 text-accent" />
                                    {account.phoneNumber}
                                  </p>
                                )}
                                {account.telegramUserId && (
                                  <p className="font-mono text-[11px] text-ink-faint">
                                    {account.isEnvAdmin
                                      ? 'TG: Protected Admin'
                                      : `TG: •••• ${account.telegramUserId.slice(-4)}`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                isManager
                                  ? 'bg-accent text-on-accent'
                                  : 'bg-surface-sunken text-ink-soft'
                              }`}
                            >
                              {account.isEnvAdmin ? 'Admin' : account.role}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!account.isEnvAdmin ? (
                        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                          <Button
                            variant={account.isActive ? 'ghost' : 'success'}
                            size="md"
                            loading={staffActionId === account.id}
                            onClick={() => handleToggleStaffStatus(account)}
                            className="text-xs"
                          >
                            {account.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="danger"
                            size="md"
                            loading={staffActionId === account.id}
                            onClick={() => handleDeleteStaffAccount(account)}
                            className="text-xs gap-1"
                          >
                            <Trash2 className="size-3.5" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-4 flex items-center justify-between border-t border-border pt-2 text-[11px] text-ink-soft font-semibold">
                          <span>Primary Admin</span>
                          <Badge variant="ready" dot>Active</Badge>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

