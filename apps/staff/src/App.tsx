import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BellOff,
  Building2,
  ChevronDown,
  Clock,
  LayoutDashboard,
  ListPlus,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  Package,
  Phone,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Sliders,
  Sparkles,
  TriangleAlert,
  Truck,
  User,
  Users,
  X,
} from 'lucide-react';
import { MenuManagement } from './components/MenuManagement';
import { SalesAnalytics } from './components/SalesAnalytics';
import { CustomerCrm } from './components/crm/CustomerCrm';
import { CustomerFeedback } from './components/CustomerFeedback';
import { RewardManagement } from './components/RewardManagement';
import { SettingsManagement } from './components/SettingsManagement';
import { OrderCard } from './components/OrderCard';
import { CancelOrderModal } from './components/CancelOrderModal';
import {
  PAID_STATUSES,
  STALE_AFTER_MS,
  TONE_THRESHOLDS,
  formatElapsed,
  isAwaitingPayment,
  isZhengda,
  parseModifiers,
} from './lib/orders';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  TelegramAuthScreen,
  Skeleton,
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
} from './lib/api';
import { isMuted, playNewOrderAlert, setMuted } from './lib/alert';
import type { BadgeVariant } from './components/ui';
import type { Branch, ConnectionState, Order } from './types';

const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 5000;
const CLOCK_MS = 15000;
const PANEL_ID = 'staff-panel';

type TabId =
  | 'orders'
  | 'menu'
  | 'analytics'
  | 'customers'
  | 'feedback'
  | 'rewards'
  | 'settings';

const LANES: Array<{ key: string; title: string; statuses: string[] }> = [
  { key: 'pending', title: 'Pending', statuses: ['pending', 'paid'] },
  { key: 'preparing', title: 'Preparing', statuses: ['preparing'] },
  { key: 'ready', title: 'Ready', statuses: ['ready'] },
];

const LANE_STATUSES = new Set(LANES.flatMap((lane) => lane.statuses));
const CLOSED_STATUSES = new Set(['completed', 'cancelled']);

function boardOrder(a: Order, b: Order, now: number): number {
  const aStale = now - new Date(a.createdAt).getTime() >= STALE_AFTER_MS;
  const bStale = now - new Date(b.createdAt).getTime() >= STALE_AFTER_MS;
  if (aStale !== bStale) return aStale ? 1 : -1;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function ConnectionStatusBadge({
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
    live: { dot: 'bg-success', label: 'Live Server' },
    retrying: { dot: 'bg-status-pending', label: 'Retrying...' },
    offline: { dot: 'bg-danger', label: 'Offline' },
  }[state];

  const seconds =
    lastSuccessAt == null ? null : Math.max(0, Math.floor((tick - lastSuccessAt) / 1000));

  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label={`Refresh orders now. Status: ${meta.label}`}
      className="inline-flex h-9 items-center gap-2 rounded-none border border-border bg-surface px-3 text-xs font-semibold text-ink-soft transition-all hover:border-border-strong hover:bg-surface-sunken hover:text-ink"
    >
      <span className={`size-2 shrink-0 rounded-none ${meta.dot} ring-2 ring-surface`} />
      <span>{meta.label}</span>
      {seconds != null ? (
        <span className="tabular-nums text-ink-faint">({seconds}s)</span>
      ) : null}
      <RefreshCw
        className={`size-3.5 shrink-0 text-ink-faint ${
          refreshing ? 'motion-safe:animate-spin text-accent' : ''
        }`}
      />
    </button>
  );
}

function BoardLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-none border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold text-ink"
      >
        <span>Color Meanings &amp; Keyboard Shortcuts</span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="grid gap-6 border-t border-border px-4 py-4 text-xs sm:grid-cols-2">
          <div>
            <h4 className="font-bold text-ink">Order Waiting Status</h4>
            <ul className="mt-2 space-y-1.5 text-ink-soft">
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-none bg-surface-sunken" />
                On time / newly placed
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-none bg-status-pending" />
                Getting close — pending {TONE_THRESHOLDS.pending.warn}m, preparing{' '}
                {TONE_THRESHOLDS.preparing.warn}m, ready {TONE_THRESHOLDS.ready.warn}m
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-none bg-danger" />
                Over target — pending {TONE_THRESHOLDS.pending.late}m, preparing{' '}
                {TONE_THRESHOLDS.preparing.late}m, ready {TONE_THRESHOLDS.ready.late}m
              </li>
            </ul>
            <h4 className="mt-4 font-bold text-ink">QR Payment Verification</h4>
            <ul className="mt-2 space-y-1.5 text-ink-soft">
              <li className="flex items-center gap-2">
                <span className="inline-block size-2.5 shrink-0 rounded-none bg-danger" />
                Red border ticket: QR payment still pending. Do not serve until paid.
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-ink">Keyboard Quick Keys</h4>
            <dl className="mt-2 space-y-1.5 text-ink-soft">
              {[
                ['1', 'Switch to Orders'],
                ['2', 'Switch to Menu'],
                ['3', 'Switch to Analytics'],
                ['4', 'Switch to Customers'],
                ['5', 'Switch to Feedback'],
                ['6', 'Switch to Rewards'],
                ['7', 'Switch to Settings'],
                ['R', 'Force Refresh data'],
                ['M', 'Toggle Alert Chime'],
              ].map(([key, what]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="flex h-5 w-6 items-center justify-center rounded-none bg-surface-sunken font-mono text-[10px] font-bold text-ink shadow-sm">
                    {key}
                  </kbd>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StaffApp({ onLogout }: { onLogout: () => void }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('orders');
  const sessionRole = loadSession()?.role;
  const isManager = sessionRole === 'manager';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);

  const failuresRef = useRef(0);
  const knownIdsRef = useRef<Set<string> | null>(null);
  const focusAfterRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(id);
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
    async (
      id: string,
      status: string,
      options?: { silent?: boolean; cancelReason?: string },
    ) => {
      const previous = orders.find((o) => o.id === id);
      markSeen(id);
      setUpdatingIds((prev) => new Set(prev).add(id));
      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status,
                ...(options?.cancelReason
                  ? { cancelReason: options.cancelReason }
                  : {}),
              }
            : o,
        ),
      );
      try {
        const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            status,
            ...(options?.cancelReason
              ? { cancelReason: options.cancelReason }
              : {}),
          }),
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
                : `${code} completed & handed over`,
            description:
              status === 'cancelled' && options?.cancelReason
                ? `Reason: ${options.cancelReason}`
                : undefined,
            variant: status === 'cancelled' ? 'info' : 'success',
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

  const awaitingPaymentOrders = useMemo(
    () => openOrders.filter(isAwaitingPayment).sort((a, b) => boardOrder(a, b, now)),
    [openOrders, now],
  );

  const laneOrders = useMemo(
    () =>
      LANES.map((lane) => ({
        ...lane,
        orders: openOrders
          .filter((o) => lane.statuses.includes(o.status) && !isAwaitingPayment(o))
          .sort((a, b) => boardOrder(a, b, now)),
      })),
    [openOrders, now],
  );

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

  const advance = useCallback(
    (id: string, status: string) => {
      const lane = laneOrders.find((l) => l.orders.some((o) => o.id === id));
      const rest = lane?.orders.filter((o) => o.id !== id) ?? [];
      focusAfterRef.current = rest[0]?.id ?? null;
      setStatus(id, status);
    },
    [laneOrders, setStatus],
  );

  const cancelOrder = useCallback((order: Order) => {
    setCancelModalOrder(order);
  }, []);

  const handleConfirmCancel = useCallback(
    (orderId: string, reason: string) => {
      setStatus(orderId, 'cancelled', { cancelReason: reason });
      setCancelModalOrder(null);
    },
    [setStatus],
  );

  const markPaidAtCounter = useCallback(
    (id: string) => setStatus(id, 'paid'),
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
      else if (key === '3') setActiveTab('analytics');
      else if (key === '4') setActiveTab('customers');
      else if (key === '5') setActiveTab('feedback');
      else if (key === '6') setActiveTab('rewards');
      else if (key === '7') setActiveTab('settings');
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

  const operationNavItems = [
    {
      id: 'orders' as TabId,
      label: 'Orders',
      icon: <LayoutDashboard className="size-5" />,
      badge: openCount > 0 ? String(openCount) : undefined,
      shortcut: '1',
    },
    {
      id: 'menu' as TabId,
      label: 'Menu',
      icon: <ListPlus className="size-5" />,
      shortcut: '2',
    },
    {
      id: 'analytics' as TabId,
      label: 'Analytics',
      icon: <BarChart3 className="size-5" />,
      shortcut: '3',
    },
    {
      id: 'customers' as TabId,
      label: 'Customers',
      icon: <Users className="size-5" />,
      shortcut: '4',
    },
    {
      id: 'feedback' as TabId,
      label: 'Feedback',
      icon: <MessageSquare className="size-5" />,
      shortcut: '5',
    },
    {
      id: 'rewards' as TabId,
      label: 'Rewards',
      icon: <Award className="size-5" />,
      shortcut: '6',
    },
  ];

  const managementNavItems = [
    {
      id: 'settings' as TabId,
      label: 'Settings',
      icon: <Sliders className="size-5" />,
      shortcut: '7',
    },
  ];

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-page text-ink">
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Modern Dashboard Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-border bg-surface transition-transform duration-200 lg:static lg:w-68 lg:translate-x-0 lg:shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-18 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent text-on-accent shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-ink">
                Ai-Cha <span className="text-zhengda">&amp;</span> Zhengda
              </h1>
              <p className="text-[10px] font-semibold tracking-wider uppercase text-ink-faint">
                Staff &amp; Admin Hub
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-none p-1 text-ink-soft hover:bg-surface-sunken lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Branch Selector Card */}
        {branches.length > 0 && (
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-soft mb-1.5">
              <Building2 className="size-3.5" />
              <span>Store Branch</span>
            </div>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="h-10 w-full rounded-none border border-border bg-surface-sunken/50 px-3 text-xs font-bold text-ink outline-none transition-colors focus:border-accent"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="flex-1 space-y-4 p-4 overflow-y-auto" aria-label="Main navigation">
          <div>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              Operations
            </p>
            <div className="space-y-1">
              {operationNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-none px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-all duration-150 ${
                      isActive
                        ? 'bg-accent text-on-accent shadow-sm'
                        : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge ? (
                        <span
                          className={`rounded-none px-2 py-0.5 text-xs font-black tabular-nums ${
                            isActive
                              ? 'bg-white/25 text-on-accent'
                              : 'bg-accent/15 text-accent'
                          }`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                      <kbd
                        className={`hidden rounded-none px-1.5 py-0.5 font-mono text-[10px] font-bold sm:inline ${
                          isActive
                            ? 'bg-white/20 text-on-accent'
                            : 'bg-surface-sunken text-ink-faint'
                        }`}
                      >
                        {item.shortcut}
                      </kbd>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-faint">
              System &amp; Settings
            </p>
            <div className="space-y-1">
              {managementNavItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-none px-3.5 py-2.5 text-xs sm:text-sm font-bold transition-all duration-150 ${
                      isActive
                        ? 'bg-accent text-on-accent shadow-sm'
                        : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <kbd
                        className={`hidden rounded-none px-1.5 py-0.5 font-mono text-[10px] font-bold sm:inline ${
                          isActive
                            ? 'bg-white/20 text-on-accent'
                            : 'bg-surface-sunken text-ink-faint'
                        }`}
                      >
                        {item.shortcut}
                      </kbd>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="border-t border-border p-4 space-y-3">
          <div className="flex items-center justify-between rounded-none bg-surface-sunken/40 p-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-ink-soft">
              <span
                className={`size-2 rounded-none ${
                  connState === 'live'
                    ? 'bg-success'
                    : connState === 'retrying'
                      ? 'bg-status-pending'
                      : 'bg-danger'
                }`}
              />
              <span className="capitalize">{connState}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchOrders(true)}
              className="font-bold text-accent hover:underline"
            >
              Refresh
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="md"
              onClick={toggleMute}
              className="flex-1 justify-start gap-2 text-xs font-bold"
              aria-label={muted ? 'Unmute chime' : 'Mute chime'}
            >
              {muted ? (
                <>
                  <BellOff className="size-4 text-ink-faint" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Bell className="size-4 text-accent" />
                  <span>Chime On</span>
                </>
              )}
            </Button>

            <ThemeToggle />
          </div>

          <Button
            variant="ghost"
            size="md"
            onClick={onLogout}
            className="w-full justify-start gap-2 text-xs font-bold text-danger hover:bg-danger-soft hover:text-danger"
            aria-label="Log out"
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="z-30 flex h-18 shrink-0 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-none border border-border p-2 text-ink-soft hover:bg-surface-sunken lg:hidden"
              aria-label="Open sidebar"
            >
              <MenuIcon className="size-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-extrabold text-ink sm:text-lg whitespace-nowrap">
                  {activeTab === 'orders'
                    ? 'Orders'
                    : activeTab === 'menu'
                      ? 'Menu'
                      : activeTab === 'analytics'
                        ? 'Analytics'
                        : activeTab === 'customers'
                          ? 'Customers'
                          : activeTab === 'feedback'
                            ? 'Feedback'
                            : activeTab === 'rewards'
                              ? 'Rewards'
                              : 'Settings'}
                </h2>
              </div>
              <p className="hidden text-xs text-ink-soft sm:block">
                {activeTab === 'orders'
                  ? `${openCount} active tickets in queue`
                  : activeTab === 'menu'
                    ? 'Quick toggle out-of-stock items'
                    : activeTab === 'analytics'
                      ? 'Sales performance, revenue, and daily trends'
                      : activeTab === 'customers'
                        ? 'Customer points, stamps, and loyalty CRM'
                        : activeTab === 'feedback'
                          ? 'Issues and customer support reports'
                          : activeTab === 'rewards'
                            ? 'Redemption catalog and lucky draw wheel'
                            : 'Store settings and team account permissions'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ConnectionStatusBadge
              state={connState}
              lastSuccessAt={lastSuccessAt}
              refreshing={refreshing}
              onRefresh={() => fetchOrders(true)}
            />
          </div>
        </header>

        {/* Offline Banner */}
        {connState === 'offline' && !bannerDismissed ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 border-b border-border bg-danger-soft px-4 py-2.5 text-xs font-semibold text-danger sm:px-8"
          >
            <span>
              ⚠️ Server connection lost. Orders may be outdated. Retrying automatically...
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Dismiss banner"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}

        {/* Main Body */}
        <main
          id={PANEL_ID}
          role="tabpanel"
          className="w-full flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        >
          <div className="mx-auto max-w-7xl">
          {activeTab === 'menu' ? (
            <MenuManagement />
          ) : activeTab !== 'orders' && !isManager ? (
            <div className="mx-auto max-w-md pt-8">
              <Card padding="lg" className="border-border bg-surface text-center space-y-4 shadow-md">
                <div className="mx-auto flex size-12 items-center justify-center rounded-none bg-danger-soft text-danger">
                  <ShieldAlert className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink">Manager Restricted</h3>
                  <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                    Your Telegram account is logged in as <strong>Staff</strong>. Accessing this section requires a <strong>Manager</strong> or <strong>Admin</strong> Telegram account.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={onLogout}
                  className="gap-2 font-bold w-full"
                >
                  <LogOut className="size-4" />
                  Switch to Manager Account
                </Button>
              </Card>
            </div>
          ) : activeTab === 'analytics' ? (
            <SalesAnalytics />
          ) : activeTab === 'customers' ? (
            <CustomerCrm />
          ) : activeTab === 'feedback' ? (
            <CustomerFeedback />
          ) : activeTab === 'rewards' ? (
            <RewardManagement />
          ) : activeTab === 'settings' ? (
            <SettingsManagement />
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
              description="New orders land here on their own with a chime. No need to refresh."
            />
          ) : (
            <div className="space-y-6">
              {/* Stranded Orders Alert */}
              {strandedOrders.length > 0 ? (
                <section
                  aria-label="Orders needing attention"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-none border border-danger bg-danger-soft px-4 py-3"
                >
                  <h2 className="flex items-center gap-2 font-bold text-danger">
                    <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
                    {strandedOrders.length} order
                    {strandedOrders.length > 1 ? 's' : ''} in unexpected status
                  </h2>
                  <p className="text-sm tabular-nums text-danger">
                    {strandedOrders
                      .map((order) => `${order.pickupCode || order.id} (${order.status})`)
                      .join(' · ')}
                  </p>
                </section>
              ) : null}

              {/* Unpaid KHQR Payment Orders */}
              {awaitingPaymentOrders.length > 0 ? (
                <section
                  aria-labelledby="awaiting-payment-heading"
                  className="overflow-hidden rounded-none border-2 border-danger bg-surface shadow-sm"
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-danger-soft px-4 py-3">
                    <h2
                      id="awaiting-payment-heading"
                      className="flex items-center gap-2 font-bold text-danger"
                    >
                      <QrCode className="size-5 shrink-0" aria-hidden="true" />
                      Waiting for Payment Verification
                      <span className="rounded-none bg-danger px-2 py-0.5 text-xs text-white tabular-nums">
                        {awaitingPaymentOrders.length}
                      </span>
                    </h2>
                    <p className="text-xs font-semibold text-danger">
                      Not paid yet — do not prepare yet. Automatically moves when payment completes.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 p-4 md:grid-cols-3">
                    {awaitingPaymentOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        now={now}
                        updating={updatingIds.has(order.id)}
                        isNew={newIds.has(order.id)}
                        showBranch={showBranch}
                        onAction={advance}
                        onCancel={cancelOrder}
                        onMarkPaid={markPaidAtCounter}
                        onSeen={markSeen}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* 3-Column Kanban Board */}
              <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
                {laneOrders.map((lane) => {
                  const oldest = lane.orders[0];
                  return (
                    <section
                      key={lane.key}
                      aria-labelledby={`lane-${lane.key}`}
                      className="flex min-w-0 flex-col rounded-none border border-border bg-surface-sunken/30 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={lane.key as BadgeVariant} dot>
                            <h2 id={`lane-${lane.key}`} className="text-xs font-bold uppercase tracking-wider">
                              {lane.title}
                            </h2>
                          </Badge>
                          <span className="rounded-none bg-surface px-2 py-0.5 text-xs font-black tabular-nums text-ink shadow-xs">
                            {lane.orders.length}
                          </span>
                        </div>
                        {oldest ? (
                          <span className="text-[11px] font-semibold tabular-nums text-ink-faint">
                            Oldest: {formatElapsed(oldest.createdAt, now).label}
                          </span>
                        ) : null}
                      </div>

                      {lane.orders.length === 0 ? (
                        <div className="rounded-none border border-dashed border-border py-8 text-center text-xs font-medium text-ink-faint">
                          No {lane.title.toLowerCase()} orders
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 md:max-h-[calc(100dvh-14rem)] md:overflow-y-auto md:pr-1">
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
                              onMarkPaid={markPaidAtCounter}
                              onSeen={markSeen}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              {/* Finished Today Drawer */}
              {closedOrders.length > 0 ? (
                <Card padding="none" className="overflow-hidden border-border bg-surface">
                  <button
                    type="button"
                    onClick={() => setArchiveOpen((v) => !v)}
                    aria-expanded={archiveOpen}
                    className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left hover:bg-surface-sunken/40"
                  >
                    <span className="font-bold text-ink">
                      Completed &amp; Finished Today
                      <span className="ml-2 rounded-none bg-surface-sunken px-2 py-0.5 text-xs font-bold text-ink-soft tabular-nums">
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
                      {shownClosed.map((order) => {
                        const created = new Date(order.createdAt).getTime();
                        const finished = order.updatedAt ? new Date(order.updatedAt).getTime() : created;
                        const durationMins = Math.max(1, Math.round((finished - created) / 60000));
                        const isDelivery = order.orderType === 'delivery';

                        return (
                          <li
                            key={order.id}
                            className={`flex flex-col gap-2.5 border p-4 ${
                              order.status === 'cancelled'
                                ? 'border-danger/30 bg-danger-soft/10'
                                : 'border-border hover:border-accent/30 hover:bg-surface-sunken/20'
                            } transition-colors`}
                          >
                            {/* Top Header: Code, Badges, Price, Reopen Action */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-black tracking-tight text-ink">
                                  {order.pickupCode || '—'}
                                </span>
                                {order.status === 'cancelled' ? (
                                  <Badge variant="danger">
                                    Cancelled{order.cancelReason ? `: ${order.cancelReason}` : ''}
                                  </Badge>
                                ) : PAID_STATUSES.has(order.status) ? (
                                  <Badge variant="completed">Paid &amp; Done</Badge>
                                ) : null}
                                <span className="inline-flex items-center gap-1 rounded-none bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-soft">
                                  {isDelivery ? (
                                    <>
                                      <Truck className="size-3 text-status-preparing" />
                                      Delivery
                                    </>
                                  ) : (
                                    <>
                                      <ShoppingBag className="size-3 text-accent" />
                                      Pickup
                                    </>
                                  )}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-base font-black tabular-nums text-ink">
                                  ${order.totalAmount.toFixed(2)}
                                </span>
                                <Button
                                  variant="secondary"
                                  size="md"
                                  loading={updatingIds.has(order.id)}
                                  onClick={() => setStatus(order.id, 'ready')}
                                  aria-label={`Put order ${order.pickupCode ?? ''} back on the board`}
                                >
                                  Reopen Ticket
                                </Button>
                              </div>
                            </div>

                            {/* Items List: Clean bulleted items with dot-separated modifiers */}
                            {order.items && order.items.length > 0 ? (
                              <ul className="space-y-1.5 py-1">
                                {order.items.map((item) => {
                                  const zhengda = isZhengda(item.menuItem?.brand);
                                  const mods = item.modifiers ? parseModifiers(item.modifiers) : [];
                                  return (
                                    <li key={item.id} className="text-sm">
                                      <div className="flex items-start gap-2">
                                        <span
                                          aria-hidden="true"
                                          className={`mt-1.5 size-2 shrink-0 rounded-none ${
                                            zhengda ? 'bg-zhengda' : 'bg-accent'
                                          }`}
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="font-bold text-ink">
                                            {item.quantity}× {item.menuItem?.name || 'Item'}
                                          </div>
                                          {mods.length > 0 ? (
                                            <div className="text-xs text-ink-soft flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                                              {mods.map((mod, idx) => (
                                                <span key={idx} className="inline-flex items-center">
                                                  {idx > 0 && <span className="mr-1.5 text-ink-faint">·</span>}
                                                  {mod}
                                                </span>
                                              ))}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}

                            {/* Customer, Location & Timing combined metadata bar */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2 text-xs text-ink-faint">
                              {order.contactName ? (
                                <div className="flex items-center gap-1 font-bold text-ink">
                                  <User className="size-3 text-ink-faint shrink-0" />
                                  <span>{order.contactName}</span>
                                </div>
                              ) : null}

                              {order.contactPhone ? (
                                <a
                                  href={`tel:${order.contactPhone}`}
                                  className="inline-flex items-center gap-1 font-bold text-accent hover:underline"
                                >
                                  <Phone className="size-3 shrink-0" />
                                  <span>{order.contactPhone}</span>
                                </a>
                              ) : null}

                              {order.deliveryBuilding && order.deliveryRoom ? (
                                <div className="flex items-center gap-1 font-medium text-ink-soft">
                                  <Building2 className="size-3 text-ink-faint shrink-0" />
                                  <span>Bldg {order.deliveryBuilding} · Rm {order.deliveryRoom}</span>
                                </div>
                              ) : null}

                              <span className="text-border">|</span>

                              <span className="tabular-nums">
                                Placed: {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span>·</span>
                              <span className="tabular-nums">
                                Finished: {new Date(finished).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-ink-soft bg-surface-sunken/80 px-2 py-0.5 rounded-none">
                                <Clock className="size-3 text-accent" />
                                {durationMins}m prep
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Card>
              ) : null}

              <BoardLegend />
            </div>
          )}
          </div>
        </main>
      </div>

      <CancelOrderModal
        order={cancelModalOrder}
        isOpen={cancelModalOrder !== null}
        onClose={() => setCancelModalOrder(null)}
        onConfirm={handleConfirmCancel}
        loading={cancelModalOrder ? updatingIds.has(cancelModalOrder.id) : false}
      />

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => loadSession() !== null);

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => setIsAuthenticated(false));
    return () => {
      unsubscribe();
    };
  }, []);

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
    return <TelegramAuthScreen onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <ToastProvider>
      <StaffApp
        onLogout={() => {
          clearSession();
          setIsAuthenticated(false);
        }}
      />
    </ToastProvider>
  );
}
