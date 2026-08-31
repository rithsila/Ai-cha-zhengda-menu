import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  CircleAlert,
  DollarSign,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Segmented,
  Skeleton,
} from './ui';

type AnalyticsData = {
  totalRevenue: number;
  orderCount: number;
  byDate: Record<string, number>;
};

type Reward = {
  id: string;
  isActive: boolean;
};

type Range = 'today' | 'week' | 'month' | 'all';

const RANGES: Array<{ id: Range; label: string; days: string; caption: string }> = [
  { id: 'today', label: 'Today', days: '1', caption: 'Today' },
  { id: 'week', label: '7 days', days: '7', caption: 'Last 7 days' },
  { id: 'month', label: '30 days', days: '30', caption: 'Last 30 days' },
  { id: 'all', label: 'All Time', days: 'all', caption: 'All time' },
];

export function SalesAnalytics() {
  const [range, setRange] = useState<Range>('week');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<'session' | 'network' | null>(null);

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

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setAnalyticsError(null);
    const [analyticsResult, rewardsResult] = await Promise.allSettled([
      apiFetch<AnalyticsData>(
        `/api/analytics/sales?days=${RANGES.find((r) => r.id === range)!.days}`,
      ),
      apiFetch<Reward[]>('/api/rewards?includeInactive=1'),
    ]);
    if (analyticsResult.status === 'fulfilled') {
      setAnalytics(analyticsResult.value);
    } else {
      const status = (analyticsResult.reason as Error & { status?: number }).status;
      setAnalyticsError(status === 401 ? 'session' : 'network');
    }
    if (rewardsResult.status === 'fulfilled') {
      setRewards(rewardsResult.value);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const rangeCaption = RANGES.find((r) => r.id === range)!.caption;
  const entries = analytics
    ? Object.entries(analytics.byDate).sort(([a], [b]) => a.localeCompare(b))
    : [];
  const max = entries.length > 0 ? Math.max(...entries.map(([, v]) => v)) : 0;
  const valueLabelEvery = entries.length <= 14 ? 1 : Math.ceil(entries.length / 14);
  const dateLabelEvery = Math.max(1, Math.ceil(entries.length / 10));
  const activeRewardsCount = rewards.filter((r) => r.isActive).length;

  if (loading || analyticsLoading) {
    return (
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
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-80 w-full rounded-none sm:col-span-2 lg:col-span-4" />
        </div>
      </div>
    );
  }

  if (analyticsError) {
    return (
      <Card padding="lg" className="text-center">
        <CircleAlert className="mx-auto size-10 text-danger" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold text-ink">
          {analyticsError === 'session' ? 'Session expired' : 'Failed to load report'}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {analyticsError === 'session'
            ? 'Sign in again to view sales data.'
            : 'Check connection or try again.'}
        </p>
        <Button
          variant="secondary"
          size="md"
          className="mt-4"
          onClick={fetchInitialData}
        >
          Retry
        </Button>
      </Card>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6">
      {/* Header with quick date filter */}
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

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card padding="lg" className="relative overflow-hidden border-border bg-surface">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Total Sales
              </p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                ${analytics.totalRevenue.toFixed(2)}
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-none bg-success-soft text-success">
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
            <div className="flex size-10 items-center justify-center rounded-none bg-status-preparing-soft text-status-preparing">
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
            <div className="flex size-10 items-center justify-center rounded-none bg-status-pending-soft text-status-pending">
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
            <div className="flex size-10 items-center justify-center rounded-none bg-accent-soft text-accent">
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
                      className="w-full rounded-none bg-accent/85 transition-all duration-200 group-hover:bg-accent group-hover:shadow-md"
                      style={{
                        height: `calc((100% - 1.5rem) * ${pct / 100})`,
                        minHeight: amount > 0 ? '6px' : '2px',
                      }}
                    />
                    {/* Hover Tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-none border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
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
  );
}
