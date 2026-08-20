import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BarChart3, CircleAlert, Lock, Plus, Sliders, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Button,
  Card,
  EmptyState,
  Segmented,
  Skeleton,
  Tabs,
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

/*
 * Analytics used to be all-time only, which cannot answer a manager's first
 * question: how did today go? The range drives the API query, so the stat cards
 * and the chart always describe the same window.
 */
type Range = 'today' | 'week' | 'month' | 'all';

const RANGES: Array<{ id: Range; label: string; days: string; caption: string }> = [
  { id: 'today', label: 'Today', days: '1', caption: 'Today' },
  { id: 'week', label: '7 days', days: '7', caption: 'Last 7 days' },
  { id: 'month', label: '30 days', days: '30', caption: 'Last 30 days' },
  { id: 'all', label: 'All', days: 'all', caption: 'All time' },
];

const PANEL_ID = 'manager-panel';

/** Points fields must be whole numbers of 1 or more; returns null when valid. */
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

/**
 * Manager tools. Every request is authorised by the staff session token that
 * `apiFetch` attaches — the raw PIN is never kept in state or re-sent, so it
 * cannot leak from memory or from a request header on every poll.
 */
export function ManagerDashboard({ onLock }: { onLock: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'analytics' | 'loyalty'>('analytics');
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
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ---- Loyalty handlers ----
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

  /* Adds to whatever is already typed. The old set was [10, 50, 100, -50]:
     three ways up, one way down, and nothing said whether a tap replaced the
     field or added to it. */
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
        description: status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ---- Reward handlers ----
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
        description: status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
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
      setRewards((prev) =>
        prev.map((r) => (r.id === reward.id ? updated : r)),
      );
      toast({
        title: nextActive ? 'Reward activated' : 'Reward deactivated',
        variant: 'success',
      });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: `Couldn't ${nextActive ? 'activate' : 'deactivate'} reward`,
        description: status === 401 ? 'Manager session expired — unlock again.' : 'Please try again.',
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
      toast({ title: 'Rates saved', variant: 'success' });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      toast({
        title: "Couldn't save rates",
        // The form has already validated the numbers, so a failure here is the
        // connection or the session — never the input. Saying otherwise sends
        // the manager hunting for a typo that does not exist.
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

  const rangeCaption = RANGES.find((r) => r.id === range)!.caption;
  const entries = analytics
    ? Object.entries(analytics.byDate).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const max = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0;
  const valueLabelEvery = entries.length <= 14 ? 1 : Math.ceil(entries.length / 14);
  const dateLabelEvery = Math.max(1, Math.ceil(entries.length / 10));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            {
              id: 'analytics',
              label: 'Analytics',
              icon: <BarChart3 className="size-4" />,
            },
            {
              id: 'loyalty',
              label: 'Loyalty & Rewards',
              icon: <Users className="size-4" />,
            },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'analytics' | 'loyalty')}
          ariaLabel="Manager sections"
          panelId={PANEL_ID}
        />
        <Button variant="ghost" size="md" onClick={onLock} aria-label="Lock manager mode">
          <Lock className="size-4" aria-hidden="true" />
          Lock
        </Button>
      </div>

      <div
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${PANEL_ID}-tab-${activeTab}`}
        tabIndex={-1}
        className="flex flex-col gap-6"
      >
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full md:col-span-3" />
        </div>
      ) : activeTab === 'analytics' ? (
        analyticsError ? (
          <Card padding="lg" className="text-center">
            <CircleAlert className="mx-auto size-8 text-danger" aria-hidden="true" />
            <h2 className="mt-2 font-semibold text-ink">
              {analyticsError === 'session'
                ? 'Manager session expired'
                : "Couldn't load analytics"}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {analyticsError === 'session'
                ? 'Unlock manager tools again to view analytics.'
                : 'Check your connection and try again.'}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={analyticsError === 'session' ? onLock : fetchDashboardData}
            >
              {analyticsError === 'session' ? 'Unlock again' : 'Try again'}
            </Button>
          </Card>
        ) : analytics ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <Segmented
                options={RANGES.map((r) => ({ id: r.id, label: r.label }))}
                value={range}
                onChange={setRange}
                ariaLabel="Reporting period"
              />
            </div>

            {[
              {
                label: 'Revenue',
                value: `$${analytics.totalRevenue.toFixed(2)}`,
              },
              {
                label: 'Paid orders',
                value: String(analytics.orderCount),
              },
              {
                label: 'Average order',
                value:
                  analytics.orderCount > 0
                    ? `$${(analytics.totalRevenue / analytics.orderCount).toFixed(2)}`
                    : '—',
              },
            ].map((stat) => (
              <Card key={stat.label} padding="lg">
                <p className="text-sm text-ink-soft">{stat.label}</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-ink">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-ink-faint">{rangeCaption}</p>
              </Card>
            ))}

            <Card padding="lg" className="md:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold text-ink">Daily sales volume</h2>
                <span className="text-sm text-ink-faint">{rangeCaption}</span>
              </div>

              {entries.length === 0 ? (
                <EmptyState
                  icon={<BarChart3 className="size-10" />}
                  title="No paid orders yet"
                  description="Sales will appear here once orders are paid."
                />
              ) : (
                <div>
                  <div className="flex h-56 items-end gap-1.5" aria-hidden="true">
                    {entries.map(([date, amount], i) => {
                      const pct = max > 0 ? (amount / max) * 100 : 0;
                      const showValue = i % valueLabelEvery === 0;
                      return (
                        <div
                          key={date}
                          className="group relative flex h-full flex-1 flex-col justify-end"
                        >
                          {/* Always rendered, so every column reserves the same
                              label row and the tallest bar can reach a true 100%.
                              Clamping the height to 90% instead made the best day
                              draw the same as a 92% day. */}
                          <span className="mb-1 h-4 shrink-0 text-center text-[11px] font-medium tabular-nums text-ink-soft">
                            {showValue ? `$${amount.toFixed(0)}` : ''}
                          </span>
                          <div
                            className="w-full rounded-t-sm bg-accent transition-colors group-hover:bg-accent-strong"
                            style={{
                              height: `calc((100% - 1.25rem) * ${pct / 100})`,
                              minHeight: amount > 0 ? '4px' : undefined,
                            }}
                          />
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-surface-raised px-2 py-1 text-xs text-ink opacity-0 shadow-raised transition-opacity group-hover:opacity-100">
                            ${amount.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {entries.map(([date], i) => (
                      <div key={date} className="flex-1 text-center">
                        {i % dateLabelEvery === 0 && (
                          <span className="text-[11px] tabular-nums text-ink-faint">
                            {date.slice(5)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <table className="sr-only">
                    <caption>Daily sales</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([date, amount]) => (
                        <tr key={date}>
                          <td>{date}</td>
                          <td>${amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Points adjustment */}
          <Card padding="lg">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Users className="size-5" aria-hidden="true" />
              Adjust user points
            </h2>

            <form onSubmit={handleSearchUser} className="mt-4 flex gap-2">
              <label className="sr-only" htmlFor="user-id-search">
                Telegram user ID
              </label>
              <input
                id="user-id-search"
                type="text"
                inputMode="numeric"
                placeholder="Telegram user ID"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-11 flex-1 rounded-xl border border-border bg-surface px-4 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent"
              />
              <Button type="submit" variant="secondary" loading={searching}>
                Search
              </Button>
            </form>

            <p aria-live="polite" className="mt-2 min-h-5 text-sm font-medium text-danger">
              {userError ?? ''}
            </p>

            {foundUser && (
              <div className="mt-3 rounded-xl bg-accent-soft/60 p-4">
                <p className="font-semibold text-ink">{displayName(foundUser)}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Current balance:{' '}
                  <span className="font-bold tabular-nums text-ink">
                    {foundUser.loyaltyPoints}
                  </span>{' '}
                  pts
                </p>

                <label
                  htmlFor="delta-input"
                  className="mt-4 block text-sm font-medium text-ink"
                >
                  Adjustment (points, +/-)
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    id="delta-input"
                    type="number"
                    step="1"
                    value={deltaInput}
                    onChange={(e) => setDeltaInput(e.target.value)}
                    className="h-11 w-28 rounded-xl border border-border bg-surface px-3 text-center font-bold tabular-nums text-ink outline-none transition-colors focus:border-accent"
                    aria-describedby="delta-preview"
                  />
                  {[-50, -10, 10, 50].map((amount) => (
                    <Button
                      key={amount}
                      variant="secondary"
                      size="md"
                      onClick={() => applyQuick(amount)}
                      aria-label={`${amount > 0 ? 'Add' : 'Subtract'} ${Math.abs(amount)} points`}
                    >
                      {amount > 0 ? `+${amount}` : amount}
                    </Button>
                  ))}
                  {parsedDelta != null && delta !== 0 ? (
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => setDeltaInput('')}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs text-ink-faint">
                  Each button adds to the box, it does not replace it.
                </p>

                <label
                  htmlFor="reason-select"
                  className="mt-4 block text-sm font-medium text-ink"
                >
                  Reason <span className="text-danger">*</span>
                </label>
                <select
                  id="reason-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
                >
                  <option value="">Choose a reason…</option>
                  {REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <p
                  id="delta-preview"
                  aria-live="polite"
                  className="mt-3 text-sm tabular-nums"
                >
                  {delta !== 0 && foundUser ? (
                    newBalance < 0 ? (
                      <span className="font-medium text-danger">
                        Would take the balance below zero
                      </span>
                    ) : (
                      <span className="text-ink-soft">
                        {foundUser.loyaltyPoints} → {newBalance} ({delta > 0 ? '+' : ''}
                        {delta})
                      </span>
                    )
                  ) : (
                    <span className="text-ink-faint">
                      Enter an adjustment to preview the new balance.
                    </span>
                  )}
                </p>

                <Button
                  variant="success"
                  className="mt-4"
                  disabled={!canSave}
                  loading={saving}
                  onClick={handleSavePoints}
                  aria-describedby="save-blocked"
                >
                  Save adjustment
                </Button>
                {/* A dead button with no explanation is the single most common
                    thing a new manager gets stuck on. */}
                <p id="save-blocked" aria-live="polite" className="mt-2 text-sm text-ink-faint">
                  {saving || canSave
                    ? ''
                    : parsedDelta == null || delta === 0
                      ? 'Enter an adjustment above to enable Save.'
                      : newBalance < 0
                        ? 'That would take the balance below zero.'
                        : 'Choose a reason to enable Save.'}
                </p>
              </div>
            )}

            {recent.length > 0 && (
              <div className="mt-5">
                <h4 className="text-sm font-semibold text-ink">
                  Adjusted this session
                </h4>
                <ul className="mt-2 divide-y divide-border">
                  {recent.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-ink-soft">
                        <span className="tabular-nums text-ink-faint">
                          {new Date(r.time).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>{' '}
                        {r.name}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          r.delta > 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {r.delta > 0 ? '+' : ''}
                        {r.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* Reward catalog */}
          <Card padding="lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Reward catalog</h2>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setAddOpen((v) => !v)}
                aria-expanded={addOpen}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add reward
              </Button>
            </div>

            {addOpen && (
              <form
                onSubmit={handleAddReward}
                className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-sunken/50 p-3"
              >
                <div className="flex flex-wrap gap-2">
                  <div className="min-w-40 flex-1">
                    <label
                      htmlFor="reward-name"
                      className="mb-1 block text-sm font-medium text-ink"
                    >
                      Name
                    </label>
                    <input
                      id="reward-name"
                      type="text"
                      placeholder="e.g. Free Milk Tea"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
                    />
                  </div>
                  <div className="w-32">
                    <label
                      htmlFor="reward-cost"
                      className="mb-1 block text-sm font-medium text-ink"
                    >
                      Points cost
                    </label>
                    <input
                      id="reward-cost"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="100"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="reward-description"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    Description <span className="text-xs text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="reward-description"
                    type="text"
                    placeholder="e.g. Medium size, any sugar/ice level"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="primary" loading={adding}>
                    Save reward
                  </Button>
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
                  {addError && (
                    <p className="text-sm font-medium text-danger">{addError}</p>
                  )}
                </div>
              </form>
            )}

            {rewardsError ? (
              <p className="mt-4 text-sm text-danger">
                Couldn't load rewards.{' '}
                <button
                  type="button"
                  onClick={fetchDashboardData}
                  className="font-semibold text-accent hover:text-accent-strong"
                >
                  Try again
                </button>
              </p>
            ) : rewards.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ink-faint">
                No rewards yet — add the first one.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {rewards.map((reward) => (
                  <li
                    key={reward.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p
                        className={`font-medium ${
                          reward.isActive ? 'text-ink' : 'text-ink-faint'
                        }`}
                      >
                        {reward.name}
                        {!reward.isActive && (
                          <span className="ml-1.5 text-xs font-normal text-ink-faint">
                            (inactive)
                          </span>
                        )}
                      </p>
                      {reward.description && (
                        <p
                          className={`truncate text-xs ${
                            reward.isActive ? 'text-ink-soft' : 'text-ink-faint'
                          }`}
                        >
                          {reward.description}
                        </p>
                      )}
                      <p
                        className={`text-sm tabular-nums ${
                          reward.isActive ? 'text-ink-soft' : 'text-ink-faint'
                        }`}
                      >
                        {reward.pointsCost} pts
                      </p>
                    </div>
                    <Button
                      variant={reward.isActive ? 'secondary' : 'success'}
                      size="md"
                      loading={togglingId === reward.id}
                      onClick={() => handleToggleReward(reward)}
                    >
                      {reward.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Loyalty rates */}
          <Card padding="lg" className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <Sliders className="size-5" aria-hidden="true" />
              Loyalty rates
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Configure points required for discounts and points earned per dollar spent.
            </p>

            <div className="mt-4 flex flex-wrap items-start gap-4">
              {(
                [
                  {
                    key: 'pointsPerDollar' as const,
                    id: 'points-per-dollar',
                    label: 'Points for a $1 discount',
                  },
                  {
                    key: 'earnPointsPerDollar' as const,
                    id: 'earn-points-per-dollar',
                    label: 'Points earned per $1 spent',
                  },
                ]
              ).map((field) => {
                const error = rateErrors[field.key];
                return (
                  <div key={field.key} className="w-56">
                    <label
                      htmlFor={field.id}
                      className="mb-1 block text-sm font-medium text-ink"
                    >
                      {field.label}
                    </label>
                    <input
                      id={field.id}
                      type="number"
                      min="1"
                      step="1"
                      value={rates[field.key]}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${field.id}-error` : undefined}
                      onChange={(e) =>
                        setRates((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      className={`h-11 w-full rounded-xl border bg-surface px-3 text-base font-bold tabular-nums text-ink transition-colors ${
                        error ? 'border-danger' : 'border-border focus:border-accent'
                      }`}
                    />
                    <p
                      id={`${field.id}-error`}
                      className="mt-1 min-h-5 text-sm font-medium text-danger"
                    >
                      {error ?? ''}
                    </p>
                  </div>
                );
              })}

              <Button
                variant="primary"
                className="mt-6"
                disabled={!ratesValid}
                loading={savingRates}
                onClick={handleSaveRates}
              >
                Save rates
              </Button>
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}
