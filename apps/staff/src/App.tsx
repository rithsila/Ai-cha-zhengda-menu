import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  LayoutDashboard,
  ListPlus,
  MapPin,
  Package,
  RefreshCw,
  Store,
  X,
} from 'lucide-react';
import { MenuManagement } from './components/MenuManagement';
import { ManagerDashboard } from './components/ManagerDashboard';
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
import type { BadgeVariant, ButtonVariant } from './components/ui';
import {
  API_BASE,
  authHeaders,
  clearSession,
  handleUnauthorized,
  loadSession,
  onUnauthorized,
  saveSession,
} from './lib/api';

type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  modifiers: string;
  menuItem: {
    name: string;
    brand: string;
  };
};

type Order = {
  id: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  pickupCode: string | null;
  orderType: string;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  items: OrderItem[];
};

type ConnectionState = 'live' | 'retrying' | 'offline';

/**
 * Safely parse order item modifiers JSON into [group, optionNames] pairs.
 * Handles invalid JSON, non-object values, non-array group values, and missing names.
 */
function parseModifiers(raw: string): [string, string[]][] {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [];
    }
    return Object.entries(parsed)
      .filter(([, value]) => Array.isArray(value))
      .map(([group, opts]) => [
        group,
        (opts as Array<{ name?: string }>).map((o) => o?.name ?? String(o)),
      ]);
  } catch {
    return [];
  }
}

function formatElapsed(createdAt: string, now: number): string {
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

type Tone = 'normal' | 'warn' | 'danger';

function elapsedTone(status: string, createdAt: string, now: number): Tone {
  const mins = (now - new Date(createdAt).getTime()) / 60000;
  if (status === 'pending') {
    if (mins > 10) return 'danger';
    if (mins > 5) return 'warn';
  }
  if (status === 'preparing') {
    if (mins > 15) return 'danger';
    if (mins > 8) return 'warn';
  }
  return 'normal';
}

const TONE_CLASSES: Record<Tone, string> = {
  normal: 'bg-surface-sunken text-ink-soft',
  warn: 'bg-status-pending-soft text-status-pending',
  danger: 'bg-danger-soft text-danger',
};

interface StatusConfig {
  badge: BadgeVariant;
  buttonLabel: string;
  next: string;
  button: ButtonVariant;
}

const STATUS_CONFIG: Record<'pending' | 'preparing' | 'ready', StatusConfig> = {
  pending: {
    badge: 'pending',
    buttonLabel: 'Start preparing',
    next: 'preparing',
    button: 'primary',
  },
  preparing: {
    badge: 'preparing',
    buttonLabel: 'Ready for pickup',
    next: 'ready',
    button: 'success',
  },
  ready: {
    badge: 'ready',
    buttonLabel: 'Complete',
    next: 'completed',
    button: 'secondary',
  },
};

function OrderCard({
  order,
  now,
  updating,
  isNew,
  onAction,
}: {
  order: Order;
  now: number;
  updating: boolean;
  isNew: boolean;
  onAction: (id: string, status: string) => void;
}) {
  const config = STATUS_CONFIG[order.status as keyof typeof STATUS_CONFIG];
  const tone = elapsedTone(order.status, order.createdAt, now);

  return (
    <Card
      padding="none"
      className={`overflow-hidden transition-[box-shadow] duration-300 ${
        isNew ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-ink">
            {order.pickupCode || 'N/A'}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-faint">
            <span className="tabular-nums">
              {new Date(order.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="uppercase">{order.paymentMethod}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${TONE_CLASSES[tone]}`}
            title="Time since order placed"
          >
            {formatElapsed(order.createdAt, now)}
          </span>
          {config ? (
            <Badge variant={config.badge} dot>
              {order.status}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3">
        {order.orderType === 'delivery' ? (
          <Badge variant="delivery" icon={<MapPin className="size-3.5" />}>
            Delivery
          </Badge>
        ) : (
          <Badge variant="pickup" icon={<Store className="size-3.5" />}>
            Pickup
          </Badge>
        )}
      </div>

      {order.orderType === 'delivery' && order.deliveryAddress && (
        <div className="mx-4 mb-3 rounded-xl bg-surface-sunken p-3 text-sm">
          <span className="mb-1 block text-xs font-semibold text-ink-faint">
            Deliver to
          </span>
          <span className="text-ink">{order.deliveryAddress}</span>
          {order.deliveryLat != null && order.deliveryLng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryLat},${order.deliveryLng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 block text-xs font-semibold text-accent hover:text-accent-strong"
            >
              Open in Google Maps
            </a>
          )}
        </div>
      )}

      <ul className="space-y-2 px-4 pb-3">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">
                {item.quantity}× {item.menuItem.name}
              </span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                ${item.price.toFixed(2)}
              </span>
            </div>
            {item.modifiers && item.modifiers !== '{}' && (
              <div className="mt-0.5 border-l border-border pl-3 text-xs text-ink-soft">
                {parseModifiers(item.modifiers).map(([group, names]) => (
                  <span key={group}>{names.join(', ')}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-border p-3">
        <span className="text-lg font-bold tabular-nums text-ink">
          ${order.totalAmount.toFixed(2)}
        </span>
        {config ? (
          <Button
            variant={config.button}
            loading={updating}
            onClick={() => onAction(order.id, config.next)}
          >
            {config.buttonLabel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function ConnectionIndicator({
  state,
  secondsAgo,
}: {
  state: ConnectionState;
  secondsAgo: number | null;
}) {
  const meta = {
    live: { dot: 'bg-success', label: 'Live' },
    retrying: { dot: 'bg-status-pending', label: 'Retrying…' },
    offline: { dot: 'bg-danger', label: 'Offline' },
  }[state];

  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
        <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden="true" />
        {meta.label}
      </span>
      {secondsAgo != null ? (
        <span className="text-[11px] tabular-nums text-ink-faint">
          updated {secondsAgo}s ago
        </span>
      ) : null}
    </div>
  );
}

function StaffApp() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'orders' | 'menu' | 'manager'>('orders');
  const [managerPin, setManagerPin] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  const [connState, setConnState] = useState<ConnectionState>('live');
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const failuresRef = useRef(0);
  const knownIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
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
        const url = selectedBranch
          ? `/api/orders?branchId=${selectedBranch}`
          : '/api/orders';
        const res = await fetch(`${API_BASE}${url}`, { headers: authHeaders() });
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
            setNewIds((prev) => {
              const next = new Set(prev);
              fresh.forEach((o) => next.add(o.id));
              return next;
            });
            const codes = fresh
              .map((o) => o.pickupCode || 'order')
              .join(', ');
            setAnnouncement(
              `New order${fresh.length > 1 ? 's' : ''} received: ${codes}`,
            );
            const ids = fresh.map((o) => o.id);
            setTimeout(() => {
              setNewIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => next.delete(id));
                return next;
              });
            }, 4000);
            setTimeout(() => setAnnouncement(null), 5000);
          }
          knownIdsRef.current = new Set(data.map((o) => o.id));
        }

        setOrders(data);
        setLastSuccessAt(Date.now());
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
    const id = setInterval(() => fetchOrders(), 5000);
    return () => clearInterval(id);
  }, [fetchOrders, selectedBranch, branches]);

  const updateStatus = useCallback(
    async (id: string, status: string) => {
      const previous = orders.find((o) => o.id === id);
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
        if (status === 'completed') {
          toast({
            title: `Order ${previous?.pickupCode ?? ''} completed`,
            variant: 'success',
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
          action: { label: 'Retry', onClick: () => updateStatus(id, status) },
        });
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [orders, toast],
  );

  const openOrders = orders.filter((o) => o.status !== 'completed');
  const completedOrders = orders
    .filter((o) => o.status === 'completed')
    .slice(0, 20);
  const openCount = openOrders.length;

  const secondsAgo =
    lastSuccessAt == null
      ? null
      : Math.max(0, Math.floor((now - lastSuccessAt) / 1000));

  const tabs = [
    {
      id: 'orders',
      label: 'Live Orders',
      icon: <LayoutDashboard className="size-4" />,
      badge: openCount > 0 ? openCount : undefined,
    },
    { id: 'menu', label: 'Menu', icon: <ListPlus className="size-4" /> },
    { id: 'manager', label: 'Manager', icon: <BarChart3 className="size-4" /> },
  ];

  const subtitle =
    activeTab === 'orders'
      ? 'Live orders dashboard'
      : activeTab === 'menu'
        ? 'Menu management'
        : 'Manager analytics & loyalty';

  const lanes: Array<{ key: 'pending' | 'preparing' | 'ready'; title: string }> = [
    { key: 'pending', title: 'Pending' },
    { key: 'preparing', title: 'Preparing' },
    { key: 'ready', title: 'Ready' },
  ];

  return (
    <div className="min-h-dvh bg-surface-page text-ink">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-accent" />
              <span className="size-2.5 rounded-full bg-zhengda" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-ink">
                Ai-Cha &amp; Zhengda
              </h1>
              <p className="truncate text-xs text-ink-faint">{subtitle}</p>
            </div>
          </div>

          {branches.length > 0 && (
            <div>
              <label className="sr-only" htmlFor="branch-select">
                Filter by branch
              </label>
              <select
                id="branch-select"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm font-semibold text-ink outline-none transition-colors focus:border-accent"
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

          <Tabs
            tabs={tabs}
            active={activeTab}
            onChange={(id) => setActiveTab(id as 'orders' | 'menu' | 'manager')}
            ariaLabel="Main navigation"
            className="ml-auto"
          />

          <div className="flex items-center gap-2">
            {activeTab === 'orders' && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh orders now"
                loading={refreshing}
                onClick={() => fetchOrders(true)}
              >
                <RefreshCw className="size-5" aria-hidden="true" />
              </Button>
            )}
            <ConnectionIndicator state={connState} secondsAgo={secondsAgo} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {connState === 'offline' && !bannerDismissed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-border bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger"
        >
          <span>
            Connection lost — orders shown may be out of date. Retrying
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
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
              subtitle="Enter the Manager PIN to access analytics and loyalty tools."
              buttonLabel="Authenticate"
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} padding="none" className="overflow-hidden">
                <div className="space-y-3 p-4">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : openOrders.length === 0 && completedOrders.length === 0 ? (
          <EmptyState
            icon={<Package className="size-10" />}
            title="No orders yet"
            description="New orders appear here automatically — no need to refresh."
          />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {lanes.map((lane) => {
                const laneOrders = openOrders.filter((o) => o.status === lane.key);
                return (
                  <section key={lane.key} aria-label={`${lane.title} orders`}>
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <Badge variant={lane.key} dot>
                        {lane.title}
                      </Badge>
                      <span className="tabular-nums text-sm font-medium text-ink-soft">
                        {laneOrders.length}
                      </span>
                    </div>
                    {laneOrders.length === 0 ? (
                      <p className="px-1 text-sm text-ink-faint">
                        Nothing {lane.title.toLowerCase()}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {laneOrders.map((order) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            now={now}
                            updating={updatingIds.has(order.id)}
                            isNew={newIds.has(order.id)}
                            onAction={updateStatus}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {completedOrders.length > 0 && (
              <Card padding="none" className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setArchiveOpen((v) => !v)}
                  aria-expanded={archiveOpen}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="font-semibold text-ink">
                    Completed ({completedOrders.length})
                  </span>
                  <ChevronDown
                    className={`size-5 text-ink-soft transition-transform duration-150 ${
                      archiveOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {archiveOpen && (
                  <ul className="divide-y divide-border border-t border-border">
                    {completedOrders.map((order) => (
                      <li
                        key={order.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <span className="font-semibold text-ink">
                          {order.pickupCode || 'N/A'}
                        </span>
                        <span className="text-xs text-ink-faint tabular-nums">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="tabular-nums text-ink-soft">
                          ${order.totalAmount.toFixed(2)}
                        </span>
                        <Button
                          variant="ghost"
                          size="md"
                          loading={updatingIds.has(order.id)}
                          onClick={() => updateStatus(order.id, 'ready')}
                        >
                          Reopen
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
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
          try {
            const res = await fetch(`${API_BASE}/api/auth/staff-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin, role: 'staff' }),
            });
            if (res.ok) {
              const data = await res.json();
              saveSession({ token: data.token, role: 'staff', expiresAt: data.expiresAt });
              setIsAuthenticated(true);
              return true;
            }
            return false;
          } catch {
            throw new Error('network');
          }
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
