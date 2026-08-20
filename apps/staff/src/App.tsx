import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BellOff,
  ChevronDown,
  LayoutDashboard,
  ListPlus,
  Package,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { MenuManagement } from './components/MenuManagement';
import { ManagerDashboard } from './components/ManagerDashboard';
import { OrderCard } from './components/OrderCard';
import {
  PAID_STATUSES,
  STALE_AFTER_MS,
  TONE_THRESHOLDS,
  formatElapsed,
} from './lib/orders';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PinScreen,
  Skeleton,
  Tabs,
  ThemeToggle,
  ToastProvider,
  useToast,
} from './components/ui';
import {
  API_BASE,
  authHeaders,
  clearSession,
  handleUnauthorized,
  loadSession,
  onUnauthorized,
  saveSession,
} from './lib/api';
import { isMuted, playNewOrderAlert, setMuted, unlockAlerts } from './lib/alert';
import type { BadgeVariant } from './components/ui';
import type { Branch, ConnectionState, Order } from './types';

/**
 * How far back the board looks. Bounds the payload the tablet re-downloads every
 * 5 seconds, while staying wide enough that a genuinely open order can never
 * silently disappear from the board. Anything older reads as history, not alarm.
 */
const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

const POLL_MS = 5000;
/** Elapsed labels are minute-resolution, so a 1s tick would re-render 59 times for nothing. */
const CLOCK_MS = 15000;

const PANEL_ID = 'staff-panel';

type TabId = 'orders' | 'menu' | 'manager';

const LANES: Array<{ key: string; title: string; statuses: string[] }> = [
  { key: 'pending', title: 'Pending', statuses: ['pending', 'paid'] },
  { key: 'preparing', title: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', title: 'Ready', statuses: ['ready'] },
];

const LANE_STATUSES = new Set(LANES.flatMap((lane) => lane.statuses));
const CLOSED_STATUSES = new Set(['completed', 'cancelled']);

/**
 * Oldest first, because that is the order the counter should work in — except
 * for leftovers from an earlier shift, which sink to the bottom instead of
 * burying today's real queue.
 */
function boardOrder(a: Order, b: Order, now: number): number {
  const aStale = now - new Date(a.createdAt).getTime() >= STALE_AFTER_MS;
  const bStale = now - new Date(b.createdAt).getTime() >= STALE_AFTER_MS;
  if (aStale !== bStale) return aStale ? 1 : -1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

/* -------------------------------------------------------------------------- */
/* Header pieces                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Connection status and manual refresh, merged into one control.
 *
 * They used to be two separate elements sitting beside each other: a Refresh
 * button next to a readout saying "updated 3s ago". One was admitting the other
 * was not trusted. Now the readout *is* the button, and it owns its own one-second
 * tick so the seconds counter never re-renders the order board.
 */
function ConnectionButton({
  state,
  lastSuccessAt,
  refreshing,
  onRefresh,
}: {
  state: ConnectionState;
  lastSuccessAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const meta = {
    live: { dot: 'bg-success', label: 'Live' },
    retrying: { dot: 'bg-status-pending', label: 'Retrying' },
    offline: { dot: 'bg-danger', label: 'Offline' },
  }[state];

  const seconds =
    lastSuccessAt == null ? null : Math.max(0, Math.floor((tick - lastSuccessAt) / 1000));

  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label={`Refresh orders now. Connection ${meta.label}${
        seconds == null ? '' : `, updated ${seconds} seconds ago`
      }`}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-ink-soft transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
    >
      <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span className="hidden sm:inline" aria-hidden="true">
        {meta.label}
      </span>
      {seconds != null ? (
        <span className="hidden tabular-nums text-ink-faint md:inline" aria-hidden="true">
          {seconds}s
        </span>
      ) : null}
      <RefreshCw
        className={`size-4 shrink-0 ${refreshing ? 'motion-safe:animate-spin' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Board pieces                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The one piece of documentation in the app. Staff had no way to learn what amber
 * versus red meant, and no way to discover the keyboard accelerators.
 */
function BoardLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink-soft"
      >
        What the colours mean · keyboard shortcuts
        <ChevronDown
          className={`size-4 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="grid gap-6 border-t border-border px-4 py-4 text-sm sm:grid-cols-2">
          <div>
            <h4 className="font-semibold text-ink">Waiting time</h4>
            <ul className="mt-2 space-y-1.5 text-ink-soft">
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 shrink-0 rounded-full bg-surface-sunken" />
                On time, or from an earlier shift
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 shrink-0 rounded-full bg-status-pending-soft" />
                Getting close — pending {TONE_THRESHOLDS.pending.warn}m, preparing{' '}
                {TONE_THRESHOLDS.preparing.warn}m, ready {TONE_THRESHOLDS.ready.warn}m
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-3 shrink-0 rounded-full bg-danger-soft" />
                Over target — pending {TONE_THRESHOLDS.pending.late}m, preparing{' '}
                {TONE_THRESHOLDS.preparing.late}m, ready {TONE_THRESHOLDS.ready.late}m
              </li>
            </ul>
            <h4 className="mt-4 font-semibold text-ink">Item dots</h4>
            <ul className="mt-2 space-y-1.5 text-ink-soft">
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-full bg-accent" />
                Ai-Cha — drinks and ice cream
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-full bg-zhengda" />
                Zhengda — chicken steak
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-ink">Keyboard</h4>
            <dl className="mt-2 space-y-1.5 text-ink-soft">
              {[
                ['1 2 3', 'Switch between Live Orders, Menu and Manager'],
                ['R', 'Refresh now'],
                ['M', 'Mute or unmute the new-order chime'],
                ['Tab', 'Step through order buttons in queue order'],
              ].map(([key, what]) => (
                <div key={key} className="flex gap-3">
                  <dt className="w-16 shrink-0 font-semibold text-ink tabular-nums">
                    {key}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-ink-faint">
              Orders older than 24 hours are not shown. Find them under Completed.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* App                                                                         */
/* -------------------------------------------------------------------------- */

function StaffApp() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const [managerPin, setManagerPin] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  const [connState, setConnState] = useState<ConnectionState>('live');
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => isMuted());

  const headerRef = useRef<HTMLElement>(null);
  const failuresRef = useRef(0);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const focusAfterRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  /* The header is one row on a tablet and two on a phone, so the offset the lane
     headers stick to cannot be a hardcoded number. */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        '--app-header-h',
        `${el.offsetHeight}px`,
      );
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/branches`);
      if (!res.ok) throw new Error('branch fetch failed');
      const data = await res.json();
      setBranches(data);
      if (data.length > 0) setSelectedBranch(data[0].id);
    } catch {
      toast({
        title: "Couldn't load branches",
        description: 'Showing all branches instead.',
        variant: 'info',
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const fetchOrders = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const params = new URLSearchParams({
          since: new Date(Date.now() - BOARD_WINDOW_MS).toISOString(),
        });
        if (selectedBranch) params.set('branchId', selectedBranch);
        const res = await fetch(`${API_BASE}/api/orders?${params}`, {
          headers: authHeaders(),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        if (!res.ok) throw new Error('orders fetch failed');
        const data: Order[] = await res.json();

        if (knownIdsRef.current === null) {
          knownIdsRef.current = new Set(data.map((o) => o.id));
        } else {
          const fresh = data.filter((o) => !knownIdsRef.current!.has(o.id));
          if (fresh.length > 0) {
            playNewOrderAlert();
            setNewIds((prev) => {
              const next = new Set(prev);
              fresh.forEach((o) => next.add(o.id));
              return next;
            });
            const codes = fresh.map((o) => o.pickupCode || 'order').join(', ');
            setAnnouncement(
              `New order${fresh.length > 1 ? 's' : ''} received: ${codes}`,
            );
            setTimeout(() => setAnnouncement(null), 5000);
          }
          knownIdsRef.current = new Set(data.map((o) => o.id));
        }

        setOrders(data);
        setLastSuccessAt(Date.now());
        setNow(Date.now());
        setConnState('live');
        setBannerDismissed(false);
        failuresRef.current = 0;
      } catch {
        failuresRef.current += 1;
        setConnState(failuresRef.current >= 2 ? 'offline' : 'retrying');
      } finally {
        setLoading(false);
        if (manual) setRefreshing(false);
      }
    },
    [selectedBranch],
  );

  useEffect(() => {
    knownIdsRef.current = null;
  }, [selectedBranch]);

  useEffect(() => {
    if (!selectedBranch && branches.length > 0) return;
    fetchOrders();
    const id = setInterval(() => fetchOrders(), POLL_MS);
    return () => clearInterval(id);
  }, [fetchOrders, selectedBranch, branches]);

  const markSeen = useCallback((id: string) => {
    setNewIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const setStatus = useCallback(
    async (id: string, status: string, options?: { silent?: boolean }) => {
      const previous = orders.find((o) => o.id === id);
      markSeen(id);
      setUpdatingIds((prev) => new Set(prev).add(id));
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
      try {
        const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status }),
        });
        if (res.status === 401) handleUnauthorized();
        if (!res.ok) throw new Error('status update failed');

        if (options?.silent || !previous) return;
        const code = previous.pickupCode ?? 'Order';
        if (status === 'completed' || status === 'cancelled') {
          toast({
            title:
              status === 'cancelled'
                ? `${code} cancelled`
                : `${code} handed over`,
            variant: status === 'cancelled' ? 'info' : 'success',
            // The only escape hatch used to be "Reopen", buried in a collapsed
            // accordion. A mis-tap during a rush needs the undo right here.
            action: {
              label: 'Undo',
              onClick: () => setStatus(id, previous.status, { silent: true }),
            },
          });
        }
      } catch {
        if (previous) {
          setOrders((prev) => prev.map((o) => (o.id === id ? previous : o)));
        }
        toast({
          title: "Couldn't update order",
          description: 'The status was not changed.',
          variant: 'error',
          action: { label: 'Retry', onClick: () => setStatus(id, status, options) },
        });
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [markSeen, orders, toast],
  );

  const openOrders = useMemo(
    () => orders.filter((o) => !CLOSED_STATUSES.has(o.status)),
    [orders],
  );

  const laneOrders = useMemo(
    () =>
      LANES.map((lane) => ({
        ...lane,
        orders: openOrders
          .filter((o) => lane.statuses.includes(o.status))
          .sort((a, b) => boardOrder(a, b, now)),
      })),
    [openOrders, now],
  );

  /*
   * Any open order whose status no lane claims. Previously these were counted in
   * the header badge and then rendered nowhere, so the count and the board
   * disagreed. Now an unknown status interrupts instead of vanishing.
   */
  const strandedOrders = useMemo(
    () => openOrders.filter((o) => !LANE_STATUSES.has(o.status)),
    [openOrders],
  );

  const closedOrders = useMemo(
    () =>
      orders
        .filter((o) => CLOSED_STATUSES.has(o.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders],
  );
  const shownClosed = closedOrders.slice(0, 20);

  /** Advance the queue and keep the keyboard where the work is. */
  const advance = useCallback(
    (id: string, status: string) => {
      const lane = laneOrders.find((l) => l.orders.some((o) => o.id === id));
      const rest = lane?.orders.filter((o) => o.id !== id) ?? [];
      focusAfterRef.current = rest[0]?.id ?? null;
      setStatus(id, status);
    },
    [laneOrders, setStatus],
  );

  const cancelOrder = useCallback(
    (id: string) => setStatus(id, 'cancelled'),
    [setStatus],
  );

  useEffect(() => {
    const id = focusAfterRef.current;
    if (!id) return;
    focusAfterRef.current = null;
    document
      .querySelector<HTMLButtonElement>(`[data-order-action="${CSS.escape(id)}"]`)
      ?.focus();
  }, [orders]);

  const toggleMute = useCallback(() => {
    setMutedState((prev) => {
      setMuted(!prev);
      return !prev;
    });
  }, []);

  // Keyboard accelerators. Skipped whenever a field has focus so typing a "1"
  // into the menu search never jumps tabs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === '1') setActiveTab('orders');
      else if (key === '2') setActiveTab('menu');
      else if (key === '3') setActiveTab('manager');
      else if (key === 'r') fetchOrders(true);
      else if (key === 'm') toggleMute();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fetchOrders, toggleMute]);

  const openCount = openOrders.length;
  const showBranch = selectedBranch === '' && branches.length > 1;

  const tabs = [
    {
      id: 'orders',
      label: 'Orders',
      icon: <LayoutDashboard className="size-4" />,
      badge: openCount > 0 ? openCount : undefined,
    },
    { id: 'menu', label: 'Menu', icon: <ListPlus className="size-4" /> },
    { id: 'manager', label: 'Manager', icon: <BarChart3 className="size-4" /> },
  ];

  // Rendered in the header on tablets and on its own row on a phone, so each
  // mount point needs its own id for the label to point at.
  const renderBranchSelect = (id: string) =>
    branches.length === 0 ? null : (
      <>
        <label className="sr-only" htmlFor={id}>
          Filter by branch
        </label>
        <select
          id={id}
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink transition-colors focus:border-accent md:w-auto"
        >
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </>
    );

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <header
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-border bg-surface-raised/95 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex items-center gap-1" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="size-2.5 rounded-full bg-zhengda" />
            </div>
            <h1 className="hidden text-base font-bold whitespace-nowrap text-ink sm:block">
              Ai-Cha &amp; Zhengda
            </h1>
          </div>

          {/* On a phone the tab bar takes its own row; from md it sits inline. */}
          <Tabs
            tabs={tabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            ariaLabel="Main navigation"
            panelId={PANEL_ID}
            className="order-last w-full md:order-2 md:ml-auto md:w-auto"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1 md:order-3 md:ml-0">
            <div className="hidden md:block">
              {renderBranchSelect('branch-select-wide')}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              aria-label={
                muted ? 'Unmute new-order chime' : 'Mute new-order chime'
              }
              title={muted ? 'Chime is off' : 'Chime is on'}
            >
              {muted ? (
                <BellOff className="size-5 text-ink-faint" aria-hidden="true" />
              ) : (
                <Bell className="size-5" aria-hidden="true" />
              )}
            </Button>
            <ConnectionButton
              state={connState}
              lastSuccessAt={lastSuccessAt}
              refreshing={refreshing}
              onRefresh={() => fetchOrders(true)}
            />
            <ThemeToggle />
          </div>
        </div>

        {branches.length > 0 ? (
          <div className="border-t border-border px-4 py-2 md:hidden">
            {renderBranchSelect('branch-select-narrow')}
          </div>
        ) : null}
      </header>

      {connState === 'offline' && !bannerDismissed ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-border bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger"
        >
          <span>
            Connection lost — these orders may be out of date. Retrying
            automatically.
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <main
        id={PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${PANEL_ID}-tab-${activeTab}`}
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8"
      >
        {activeTab === 'menu' ? (
          <MenuManagement />
        ) : activeTab === 'manager' ? (
          managerPin ? (
            <ManagerDashboard
              managerPin={managerPin}
              onLock={() => setManagerPin('')}
            />
          ) : (
            <PinScreen
              title="Manager Mode"
              subtitle="Enter the Manager PIN to open analytics and loyalty tools."
              buttonLabel="Unlock manager tools"
              onSubmit={async (pin) => {
                try {
                  const res = await fetch(`${API_BASE}/api/auth/staff-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin, role: 'manager' }),
                  });
                  if (res.ok) {
                    setManagerPin(pin);
                    return true;
                  }
                  return false;
                } catch {
                  throw new Error('network');
                }
              }}
            />
          )
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} padding="none" className="overflow-hidden">
                <div className="space-y-3 p-4">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-40" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : openOrders.length === 0 && closedOrders.length === 0 ? (
          <EmptyState
            icon={<Package className="size-10" />}
            title="No orders in the last 24 hours"
            description="New orders land here on their own, with a chime. No need to refresh."
          />
        ) : (
          <div className="space-y-5">
            {strandedOrders.length > 0 ? (
              <section
                aria-label="Orders needing attention"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-danger bg-danger-soft px-4 py-2.5"
              >
                <h2 className="flex items-center gap-2 font-bold text-danger">
                  <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
                  {strandedOrders.length} order
                  {strandedOrders.length > 1 ? 's' : ''} in an unexpected state
                </h2>
                <p className="text-sm tabular-nums text-danger">
                  {strandedOrders
                    .map((order) => `${order.pickupCode || order.id} (${order.status})`)
                    .join(' · ')}
                </p>
              </section>
            ) : null}

            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
              {laneOrders.map((lane) => {
                const oldest = lane.orders[0];
                return (
                  <section
                    key={lane.key}
                    aria-labelledby={`lane-${lane.key}`}
                    className="flex min-w-0 flex-col"
                  >
                    <div className="sticky top-[var(--app-header-h,4rem)] z-10 mb-2 flex items-center gap-2 rounded-xl bg-surface-page/90 px-1 py-1.5 backdrop-blur-sm">
                      <Badge variant={lane.key as BadgeVariant} dot>
                        {/* h2 so the document never jumps h1 -> h3. */}
                        <h2 id={`lane-${lane.key}`} className="text-xs font-semibold">
                          {lane.title}
                        </h2>
                      </Badge>
                      <span className="text-sm font-semibold tabular-nums text-ink-soft">
                        {lane.orders.length}
                      </span>
                      {oldest ? (
                        <span className="ml-auto text-xs tabular-nums text-ink-faint">
                          oldest {formatElapsed(oldest.createdAt, now).label}
                        </span>
                      ) : null}
                    </div>

                    {lane.orders.length === 0 ? (
                      <p className="px-1 text-sm text-ink-faint">
                        Nothing {lane.title.toLowerCase()}
                      </p>
                    ) : (
                      /* Each lane scrolls on its own so a long queue in one column
                         never pushes the other two off the screen. */
                      <div className="flex flex-col gap-3 md:max-h-[calc(100dvh-var(--app-header-h,4rem)-7rem)] md:overflow-y-auto md:pr-1 md:pb-1">
                        {lane.orders.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            now={now}
                            updating={updatingIds.has(order.id)}
                            isNew={newIds.has(order.id)}
                            showBranch={showBranch}
                            onAction={advance}
                            onCancel={cancelOrder}
                            onSeen={markSeen}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {closedOrders.length > 0 ? (
              <Card padding="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setArchiveOpen((v) => !v)}
                  aria-expanded={archiveOpen}
                  className="flex min-h-11 w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="font-semibold text-ink">
                    Finished today
                    <span className="ml-2 font-normal text-ink-faint tabular-nums">
                      {shownClosed.length < closedOrders.length
                        ? `${shownClosed.length} of ${closedOrders.length}`
                        : closedOrders.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={`size-5 shrink-0 text-ink-soft transition-transform duration-150 ${
                      archiveOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {archiveOpen ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {shownClosed.map((order) => (
                      <li
                        key={order.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                      >
                        <span className="font-semibold text-ink">
                          {order.pickupCode || '—'}
                        </span>
                        <span className="text-xs tabular-nums text-ink-faint">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {order.status === 'cancelled' ? (
                          <Badge variant="danger">Cancelled</Badge>
                        ) : PAID_STATUSES.has(order.status) ? (
                          <Badge variant="completed">Paid</Badge>
                        ) : null}
                        <span className="ml-auto tabular-nums text-ink-soft">
                          ${order.totalAmount.toFixed(2)}
                        </span>
                        <Button
                          variant="ghost"
                          size="md"
                          loading={updatingIds.has(order.id)}
                          onClick={() => setStatus(order.id, 'ready')}
                          aria-label={`Put order ${order.pickupCode ?? ''} back on the board`}
                        >
                          Reopen
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            ) : null}

            <BoardLegend />
          </div>
        )}
      </main>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

export default function App() {
  // Restore the saved session so a reload does not send staff back to the PIN screen.
  const [isAuthenticated, setIsAuthenticated] = useState(() => loadSession() !== null);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => setIsAuthenticated(false));
    return () => {
      unsubscribe();
    };
  }, []);

  // Lock the dashboard the moment the 12-hour session expires.
  useEffect(() => {
    if (!isAuthenticated) return;
    const session = loadSession();
    if (!session) {
      setIsAuthenticated(false);
      return;
    }
    const id = setTimeout(() => {
      clearSession();
      setIsAuthenticated(false);
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(id);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <PinScreen
        title="Staff Access"
        subtitle="Enter your PIN to open the dashboard"
        buttonLabel="Unlock"
        onSubmit={async (pin) => {
          // The one guaranteed tap before any order can arrive — the only moment
          // a browser will let us start audio for the new-order chime.
          unlockAlerts();
          try {
            const res = await fetch(`${API_BASE}/api/auth/staff-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin, role: 'staff' }),
            });
            if (res.ok) {
              const data = await res.json();
              saveSession({
                token: data.token,
                role: 'staff',
                expiresAt: data.expiresAt,
              });
              setIsAuthenticated(true);
              return true;
            }
            return false;
          } catch {
            throw new Error('network');
          }
        }}
        onTelegramLogin={() => {
          const botUsername =
            (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ||
            'AiChaZhengda_bot';
          window.location.href = `https://t.me/${botUsername}`;
        }}
      />
    );
  }

  return (
    <ToastProvider>
      <StaffApp />
    </ToastProvider>
  );
}
