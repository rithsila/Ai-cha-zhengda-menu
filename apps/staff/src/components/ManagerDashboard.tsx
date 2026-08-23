import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Award,
  BarChart3,
  CircleAlert,
  Coins,
  DollarSign,
  History,
  Lock,
  Plus,
  Receipt,
  Search,
  Settings2,
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

type User = {
  telegramUserId: string;
  firstName: string | null;
  lastName: string | null;
  loyaltyPoints: number;
};

type RecentAdjustment = {
  id: string;
  name: string;
  delta: number;
  time: number;
};

const REASONS = ['Correction', 'Promotion', 'Compensation', 'Other'];

type Range = 'today' | 'week' | 'month' | 'all';

const RANGES: Array<{ id: Range; label: string; days: string; caption: string }> = [
  { id: 'today', label: 'Today', days: '1', caption: 'Today' },
  { id: 'week', label: '7 days', days: '7', caption: 'Last 7 days' },
  { id: 'month', label: '30 days', days: '30', caption: 'Last 30 days' },
  { id: 'all', label: 'All Time', days: 'all', caption: 'All time' },
];

type StaffAccount = {
  id: string;
  telegramUserId: string;
  name: string;
  role: 'staff' | 'manager';
  isActive: boolean;
  isEnvAdmin?: boolean;
  createdAt: string;
};

const PANEL_ID = 'manager-panel';

type ManagerSubTab = 'analytics' | 'loyalty' | 'rewards' | 'staff' | 'settings';

function rateError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return 'Enter a number.';
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 'Must be a whole number of 1 or more.';
  }
  return null;
}

function displayName(user: User): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.telegramUserId;
}

export function ManagerDashboard({ onLock }: { onLock: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ManagerSubTab>('analytics');
  const [range, setRange] = useState<Range>('week');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<'session' | 'network' | null>(null);
  const [rewardsError, setRewardsError] = useState(false);

  // Loyalty: user lookup + points adjustment
  const [userSearch, setUserSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [deltaInput, setDeltaInput] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<RecentAdjustment[]>([]);

  // Rewards: add + toggle
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCost, setNewCost] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Loyalty rates
  const [rates, setRates] = useState({ pointsPerDollar: '100', earnPointsPerDollar: '10' });
  const [savingRates, setSavingRates] = useState(false);

  // Staff & Manager Accounts
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'staff' | 'manager'>('staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffActionId, setStaffActionId] = useState<string | null>(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);

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

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setAnalyticsError(null);
    setRewardsError(false);
    const [analyticsResult, rewardsResult, configResult] = await Promise.allSettled([
      apiFetch<AnalyticsData>(
        `/api/analytics/sales?days=${RANGES.find((r) => r.id === range)!.days}`,
      ),
      apiFetch<Reward[]>('/api/rewards?includeInactive=1'),
      apiFetch<{ key: string; value: string }[]>('/api/config'),
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
    if (configResult.status === 'fulfilled') {
      const rows = configResult.value;
      setRates((prev) => ({
        ...prev,
        ...Object.fromEntries(rows.filter((r) => r.key in prev).map((r) => [r.key, r.value])),
      }));
    }
    fetchStaffAccounts();
    setLoading(false);
  }, [range, fetchStaffAccounts]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Loyalty calculation
  const parsedDelta =
    deltaInput.trim() === '' || deltaInput.trim() === '-'
      ? null
      : Number(deltaInput.trim());
  const delta = parsedDelta != null && Number.isFinite(parsedDelta) ? parsedDelta : 0;
  const newBalance = foundUser ? foundUser.loyaltyPoints + delta : 0;
  const canSave =
    foundUser != null &&
    parsedDelta != null &&
    delta !== 0 &&
    reason !== '' &&
    newBalance >= 0 &&
    !saving;

  const applyQuick = (amount: number) => {
    const current = parsedDelta ?? 0;
    setDeltaInput(String(current + amount));
  };

  const handleSearchUser = async (e: FormEvent) => {
    e.preventDefault();
    const id = userSearch.trim();
    if (!id) return;
    setSearching(true);
    setUserError(null);
    setFoundUser(null);
    try {
      const user = await apiFetch<User>(`/api/users/${encodeURIComponent(id)}`);
      setFoundUser(user);
      setDeltaInput('');
      setReason('');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      setUserError(
        status === 404
          ? 'No customer found with that ID.'
          : status === 401
            ? 'Manager session expired — unlock again.'
            : 'Could not search right now.',
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSavePoints = async () => {
    if (!foundUser || parsedDelta == null || delta === 0 || newBalance < 0) return;
    setSaving(true);
    try {
      await apiFetch(`/api/users/${encodeURIComponent(foundUser.telegramUserId)}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newBalance }),
      });
      const name = displayName(foundUser);
      const sign = delta > 0 ? '+' : '';
      toast({
        title: 'Points updated',
        description: `${name}: ${foundUser.loyaltyPoints} → ${newBalance} (${sign}${delta})`,
        variant: 'success',
      });
      setRecent((prev) =>
        [
          { id: crypto.randomUUID(), name, delta, time: Date.now() },
          ...prev,
        ].slice(0, 5),
      );
      setFoundUser((prev) => (prev ? { ...prev, loyaltyPoints: newBalance } : prev));
      setDeltaInput('');
      setReason('');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: "Couldn't update points",
        description:
          status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
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
      setAddError('Points cost must be a whole number of 1 or more.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const created = await apiFetch<Reward>('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newDescription.trim() || undefined,
          pointsCost: cost,
          isActive: true,
        }),
      });
      setRewards((prev) => [created, ...prev]);
      toast({ title: 'Reward added', variant: 'success' });
      setNewName('');
      setNewDescription('');
      setNewCost('');
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

  const rateErrors = {
    pointsPerDollar: rateError(rates.pointsPerDollar),
    earnPointsPerDollar: rateError(rates.earnPointsPerDollar),
  };
  const ratesValid = !rateErrors.pointsPerDollar && !rateErrors.earnPointsPerDollar;

  const handleSaveRates = async () => {
    if (!ratesValid) return;
    setSavingRates(true);
    try {
      for (const [key, value] of Object.entries(rates)) {
        await apiFetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      }
      toast({ title: 'Rates saved successfully', variant: 'success' });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: "Couldn't save rates",
        description:
          status === 401
            ? 'Manager session expired — unlock again.'
            : 'Check your connection and try again.',
        variant: 'error',
      });
    } finally {
      setSavingRates(false);
    }
  };

  const handleAddStaffAccount = async (e: FormEvent) => {
    e.preventDefault();
    const id = newStaffId.trim();
    const name = newStaffName.trim();
    if (!id || !/^\d+$/.test(id)) {
      toast({ title: 'Please enter a valid numeric Telegram User ID.', variant: 'error' });
      return;
    }
    if (!name) {
      toast({ title: 'Please enter staff or manager name.', variant: 'error' });
      return;
    }
    setAddingStaff(true);
    try {
      const created = await apiFetch<StaffAccount>('/api/staff-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUserId: id, name, role: newStaffRole }),
      });
      setStaffAccounts((prev) => {
        const filtered = prev.filter((a) => a.telegramUserId !== id);
        return [created, ...filtered];
      });
      toast({ title: `Added ${name} (${newStaffRole})`, variant: 'success' });
      setNewStaffId('');
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

  const subTabs: Array<{ id: ManagerSubTab; label: string; icon: React.ReactNode; badge?: string | number }> = [
    { id: 'analytics', label: 'Sales & Analytics', icon: <BarChart3 className="size-4" /> },
    { id: 'loyalty', label: 'Customer Points', icon: <Users className="size-4" /> },
    { id: 'rewards', label: 'Reward Catalog', icon: <Award className="size-4" />, badge: rewards.length },
    { id: 'staff', label: 'Staff & Accounts', icon: <Users2 className="size-4" />, badge: staffAccounts.length },
    { id: 'settings', label: 'Loyalty Rates', icon: <Settings2 className="size-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner / Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-ink">Manager Control Center</h2>
              <Badge variant="ready" dot>Admin Verified</Badge>
            </div>
            <p className="text-xs text-ink-soft">
              Real-time store performance, customer loyalty point administration, and menu reward rules.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={fetchDashboardData}
            loading={loading}
            aria-label="Refresh manager data"
          >
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={onLock}
            className="text-danger hover:bg-danger-soft hover:text-danger-strong"
            aria-label="Lock manager mode"
          >
            <Lock className="size-4" aria-hidden="true" />
            Lock Panel
          </Button>
        </div>
      </div>

      {/* Sub navigation bar */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
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

      <div
        id={PANEL_ID}
        role="tabpanel"
        tabIndex={-1}
        className="flex flex-col gap-6"
      >
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl sm:col-span-2 lg:col-span-4" />
          </div>
        ) : activeTab === 'analytics' ? (
          analyticsError ? (
            <Card padding="lg" className="text-center">
              <CircleAlert className="mx-auto size-10 text-danger" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-bold text-ink">
                {analyticsError === 'session'
                  ? 'Manager session expired'
                  : "Couldn't load analytics data"}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                {analyticsError === 'session'
                  ? 'Your manager authentication has expired. Unlock again to view statistics.'
                  : 'Check your server connection and retry.'}
              </p>
              <Button
                variant="secondary"
                className="mt-5"
                onClick={analyticsError === 'session' ? onLock : fetchDashboardData}
              >
                {analyticsError === 'session' ? 'Unlock Again' : 'Try Again'}
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
                  onChange={setRange}
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
        ) : activeTab === 'loyalty' ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* User Search and Point Adjuster */}
            <div className="space-y-6 lg:col-span-7">
              <Card padding="lg" className="border-border bg-surface">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Search className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink">Find Customer Account</h3>
                    <p className="text-xs text-ink-soft">Search user by numeric Telegram User ID</p>
                  </div>
                </div>

                <form onSubmit={handleSearchUser} className="mt-4 flex gap-2">
                  <label className="sr-only" htmlFor="user-id-search">
                    Telegram user ID
                  </label>
                  <input
                    id="user-id-search"
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter Telegram User ID (e.g. 123456789)"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="h-11 flex-1 rounded-xl border border-border bg-surface-sunken/40 px-4 text-sm font-medium text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent focus:bg-surface"
                  />
                  <Button type="submit" variant="primary" loading={searching}>
                    Search User
                  </Button>
                </form>

                {userError && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
                    <CircleAlert className="size-4 shrink-0" />
                    <span>{userError}</span>
                  </div>
                )}

                {foundUser && (
                  <div className="mt-5 rounded-2xl border border-accent/20 bg-accent-soft/40 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent font-bold text-on-accent">
                          {(foundUser.firstName?.[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                          <p className="text-base font-bold text-ink">{displayName(foundUser)}</p>
                          <p className="text-xs font-mono text-ink-soft">ID: {foundUser.telegramUserId}</p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-surface px-3 py-1.5 text-right shadow-sm">
                        <p className="text-[10px] uppercase font-semibold text-ink-faint">Current Points</p>
                        <p className="text-lg font-black tabular-nums text-accent">
                          {foundUser.loyaltyPoints} <span className="text-xs font-medium">pts</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <label htmlFor="delta-input" className="block text-xs font-bold uppercase tracking-wider text-ink">
                          Adjust Points (+ / -)
                        </label>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <input
                            id="delta-input"
                            type="number"
                            step="1"
                            value={deltaInput}
                            onChange={(e) => setDeltaInput(e.target.value)}
                            placeholder="0"
                            className="h-11 w-32 rounded-xl border border-border bg-surface px-3 text-center text-lg font-black tabular-nums text-ink outline-none focus:border-accent"
                          />
                          {[
                            { val: 50, label: '+50' },
                            { val: 20, label: '+20' },
                            { val: 10, label: '+10' },
                            { val: -10, label: '-10' },
                            { val: -20, label: '-20' },
                            { val: -50, label: '-50' },
                          ].map((item) => (
                            <Button
                              key={item.val}
                              variant="secondary"
                              size="md"
                              onClick={() => applyQuick(item.val)}
                              className="font-bold text-xs"
                            >
                              {item.label}
                            </Button>
                          ))}
                          {parsedDelta != null && delta !== 0 ? (
                            <Button variant="ghost" size="md" onClick={() => setDeltaInput('')}>
                              Clear
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <label htmlFor="reason-select" className="block text-xs font-bold uppercase tracking-wider text-ink">
                          Adjustment Reason <span className="text-danger">*</span>
                        </label>
                        <select
                          id="reason-select"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-accent"
                        >
                          <option value="">Select a reason...</option>
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Live Calculation Preview */}
                      <div className="rounded-xl bg-surface p-3 text-sm font-medium">
                        {delta !== 0 ? (
                          newBalance < 0 ? (
                            <span className="font-semibold text-danger">
                              ⚠️ Warning: New balance would be negative ({newBalance} pts).
                            </span>
                          ) : (
                            <div className="flex items-center justify-between">
                              <span className="text-ink-soft">Resulting Balance:</span>
                              <span className="font-bold text-ink">
                                {foundUser.loyaltyPoints} →{' '}
                                <span className="text-accent">{newBalance} pts</span>{' '}
                                ({delta > 0 ? `+${delta}` : delta})
                              </span>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-ink-faint">
                            Type points or click + / - to calculate new balance preview.
                          </span>
                        )}
                      </div>

                      <Button
                        variant="success"
                        size="lg"
                        className="w-full font-bold"
                        disabled={!canSave}
                        loading={saving}
                        onClick={handleSavePoints}
                      >
                        Confirm &amp; Apply Adjustment
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Recent Adjustments Log */}
            <div className="space-y-6 lg:col-span-5">
              <Card padding="lg" className="border-border bg-surface">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-surface-sunken text-ink">
                    <History className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink">Recent Session Actions</h3>
                    <p className="text-xs text-ink-soft">Points updated in this session</p>
                  </div>
                </div>

                {recent.length === 0 ? (
                  <p className="mt-6 text-center text-xs text-ink-faint">
                    No points adjustments applied in this session yet.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-border">
                    {recent.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                          <p className="text-xs text-ink-faint">
                            {new Date(r.time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span
                          className={`rounded-lg px-2 py-1 font-mono text-xs font-bold ${
                            r.delta > 0
                              ? 'bg-success-soft text-success'
                              : 'bg-danger-soft text-danger'
                          }`}
                        >
                          {r.delta > 0 ? `+${r.delta}` : r.delta} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
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
                    }}
                    className="rounded-lg p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form onSubmit={handleAddReward} className="mt-4 space-y-4">
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
                        Points Cost <span className="text-danger">*</span>
                      </label>
                      <input
                        id="reward-cost"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="100"
                        value={newCost}
                        onChange={(e) => setNewCost(e.target.value)}
                        className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                      />
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
                        <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                          <Coins className="size-4" />
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
                        <p className="text-base font-extrabold text-accent">{reward.pointsCost} pts</p>
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
                    <span>Authorize New Telegram User</span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-bold text-ink mb-1">
                        Telegram User ID <span className="text-danger">*</span>
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
                              <p className="font-mono text-[11px] text-ink-faint">
                                ID: {account.telegramUserId}
                              </p>
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
                              {account.role}
                            </span>
                            {account.isEnvAdmin ? (
                              <span className="text-[10px] font-bold text-accent">Root .env</span>
                            ) : null}
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
                        <div className="mt-4 border-t border-border pt-2 text-[11px] text-ink-faint italic">
                          Configured in environment file (.env)
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <Card padding="lg" className="border-border bg-surface">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Sliders className="size-4" />
                </div>
                <div>
                  <h3 className="font-bold text-ink">Loyalty Conversion Rules</h3>
                  <p className="text-xs text-ink-soft">Set how customer points translate into currency discounts</p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {[
                  {
                    key: 'pointsPerDollar' as const,
                    id: 'points-per-dollar',
                    label: 'Points required for $1 Discount',
                    desc: 'How many loyalty points a customer must redeem to save $1.00',
                  },
                  {
                    key: 'earnPointsPerDollar' as const,
                    id: 'earn-points-per-dollar',
                    label: 'Points Earned per $1 Spent',
                    desc: 'Points credited to customer account for every $1 spent in store',
                  },
                ].map((field) => {
                  const error = rateErrors[field.key];
                  return (
                    <div key={field.key} className="rounded-xl border border-border bg-surface-sunken/30 p-4">
                      <label htmlFor={field.id} className="block text-sm font-bold text-ink">
                        {field.label}
                      </label>
                      <p className="mt-0.5 text-xs text-ink-soft">{field.desc}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <input
                          id={field.id}
                          type="number"
                          min="1"
                          step="1"
                          value={rates[field.key]}
                          aria-invalid={error ? true : undefined}
                          onChange={(e) =>
                            setRates((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className={`h-11 w-40 rounded-xl border bg-surface px-3 text-center text-lg font-bold tabular-nums text-ink outline-none ${
                            error ? 'border-danger' : 'border-border focus:border-accent'
                          }`}
                        />
                        <span className="text-xs font-semibold text-ink-soft">points</span>
                      </div>
                      {error && (
                        <p className="mt-2 text-xs font-semibold text-danger">{error}</p>
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!ratesValid}
                    loading={savingRates}
                    onClick={handleSaveRates}
                  >
                    Save &amp; Update Rules
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

