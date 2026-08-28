import { useEffect, useState, useCallback } from 'react';
import {
  Clock,
  Truck,
  ShoppingBag,
  Coins,
  QrCode,
  Sliders,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Badge, Button, Card, Segmented, Skeleton, Switch, useToast } from './ui';

export interface StoreConfigState {
  storeStatus: 'auto' | 'open' | 'closed';
  openTime: string;
  closeTime: string;
  enablePickup: boolean;
  enableDelivery: boolean;
  enableCash: boolean;
  enableKhqr: boolean;
  deliveryFee: number;
  pointsPerDollar: number;
  earnPointsPerDollar: number;
  isOpen: boolean;
  currentTime: string;
  reason: string;
}

const DEFAULT_CONFIG: StoreConfigState = {
  storeStatus: 'auto',
  openTime: '08:00',
  closeTime: '21:00',
  enablePickup: true,
  enableDelivery: true,
  enableCash: true,
  enableKhqr: true,
  deliveryFee: 0,
  pointsPerDollar: 100,
  earnPointsPerDollar: 10,
  isOpen: true,
  currentTime: '',
  reason: 'schedule_open',
};

export function StoreSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<StoreConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const fetchConfig = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        apiFetch<any>('/api/store/status'),
        apiFetch<Array<{ key: string; value: string }>>('/api/config'),
      ]);

      const configMap = new Map<string, string>();
      for (const row of configRes) {
        configMap.set(row.key, row.value);
      }

      setConfig({
        storeStatus: (statusRes.storeStatus || 'auto') as 'auto' | 'open' | 'closed',
        openTime: statusRes.openTime || configMap.get('openTime') || '08:00',
        closeTime: statusRes.closeTime || configMap.get('closeTime') || '21:00',
        enablePickup: statusRes.enablePickup ?? (configMap.get('enablePickup') !== '0'),
        enableDelivery: statusRes.enableDelivery ?? (configMap.get('enableDelivery') !== '0'),
        enableCash: statusRes.enableCash ?? (configMap.get('enableCash') !== '0'),
        enableKhqr: statusRes.enableKhqr ?? (configMap.get('enableKhqr') !== '0'),
        deliveryFee: Number(configMap.get('deliveryFee') ?? 0),
        pointsPerDollar: Number(configMap.get('pointsPerDollar') ?? 100),
        earnPointsPerDollar: Number(configMap.get('earnPointsPerDollar') ?? 10),
        isOpen: !!statusRes.isOpen,
        currentTime: statusRes.currentTime || '',
        reason: statusRes.reason || '',
      });
    } catch {
      toast({
        title: "Couldn't load store settings",
        description: 'Please check your connection and try again.',
        variant: 'error',
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateSetting = async (key: string, value: string | number | boolean, label: string) => {
    setUpdatingKey(key);
    try {
      let strVal = String(value);
      if (typeof value === 'boolean') {
        strVal = value ? '1' : '0';
      }
      await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: strVal }),
      });

      toast({
        title: `${label} updated`,
        variant: 'success',
      });

      // Refresh store status silently without flashing skeletons
      await fetchConfig(true);
    } catch (err: any) {
      toast({
        title: `Failed to update ${label}`,
        description: err?.message || 'Please check value and try again.',
        variant: 'error',
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  const modeOptions: Array<{ id: 'auto' | 'open' | 'closed'; label: string; icon?: React.ReactNode }> = [
    { id: 'auto', label: 'Automatic (Schedule)' },
    { id: 'open', label: 'Force Open' },
    { id: 'closed', label: 'Force Closed' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Operating Hours & Auto-Schedule */}
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Clock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">Operating Mode &amp; Hours</h3>
                <Badge variant={config.isOpen ? 'success' : 'danger'}>
                  <span className="inline-block size-2 rounded-full bg-current mr-1.5 animate-pulse" />
                  {config.isOpen ? 'OPEN FOR ORDERS' : 'CURRENTLY CLOSED'}
                </Badge>
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                {config.storeStatus === 'auto' && (
                  <>
                    Operating hours:{' '}
                    <strong className="text-ink">
                      {config.openTime} – {config.closeTime}
                    </strong>{' '}
                    (Cambodia UTC+7) • Current time:{' '}
                    <span className="font-mono font-bold text-ink">{config.currentTime || '--:--'}</span>
                  </>
                )}
                {config.storeStatus === 'open' && (
                  <span className="text-success font-medium">
                    Manual override: Store is kept open continuously.
                  </span>
                )}
                {config.storeStatus === 'closed' && (
                  <span className="text-danger font-medium">
                    Manual override: Store is closed to new orders right now.
                  </span>
                )}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={() => fetchConfig()}
            className="shrink-0 gap-2 text-xs"
          >
            <RotateCcw className="size-3.5" />
            Refresh
          </Button>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            Store Operating Mode
          </label>
          <Segmented
            ariaLabel="Store Operating Mode"
            value={config.storeStatus}
            onChange={(val) => updateSetting('storeStatus', val as any, 'Store Mode')}
            options={modeOptions}
          />
        </div>

        {/* Schedule Inputs */}
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Clock className="size-4 text-ink-faint" />
              Opening Time (HH:mm)
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={config.openTime}
                onChange={(e) => setConfig((prev) => ({ ...prev, openTime: e.target.value }))}
                onBlur={(e) => updateSetting('openTime', e.target.value, 'Opening Time')}
                className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-ink-faint">Format: 24-hour e.g. 08:00</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Clock className="size-4 text-ink-faint" />
              Closing Time (HH:mm)
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={config.closeTime}
                onChange={(e) => setConfig((prev) => ({ ...prev, closeTime: e.target.value }))}
                onBlur={(e) => updateSetting('closeTime', e.target.value, 'Closing Time')}
                className="h-11 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-ink-faint">Format: 24-hour e.g. 21:00</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-xs text-ink-faint mr-1 font-medium">Quick Hours:</span>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '08:00', 'Opening Time');
              await updateSetting('closeTime', '21:00', 'Closing Time');
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            08:00 – 21:00 (Standard)
          </button>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '07:30', 'Opening Time');
              await updateSetting('closeTime', '22:00', 'Closing Time');
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            07:30 – 22:00 (Extended)
          </button>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '09:00', 'Opening Time');
              await updateSetting('closeTime', '23:00', 'Closing Time');
            }}
            className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            09:00 – 23:00 (Late Night)
          </button>
        </div>
      </Card>

      {/* 2. Order Types Toggles */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Sliders className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Order Types</h3>
            <p className="text-xs text-ink-soft">
              Turn Pickup or Delivery orders on/off. When turned off, the option is disabled in the customer menu.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pickup Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Pickup Orders</div>
                <div className="text-xs text-ink-soft">Customer picks up at counter</div>
              </div>
            </div>
            <Switch
              checked={config.enablePickup}
              onChange={(next) => updateSetting('enablePickup', next, 'Pickup Orders')}
              disabled={updatingKey === 'enablePickup'}
              srLabel="Enable or disable pickup orders"
            />
          </div>

          {/* Delivery Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Truck className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Delivery Orders</div>
                <div className="text-xs text-ink-soft">Delivery inside Arakawa buildings</div>
              </div>
            </div>
            <Switch
              checked={config.enableDelivery}
              onChange={(next) => updateSetting('enableDelivery', next, 'Delivery Orders')}
              disabled={updatingKey === 'enableDelivery'}
              srLabel="Enable or disable delivery orders"
            />
          </div>
        </div>
      </Card>

      {/* 3. Payment Methods Toggles */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Coins className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Payment Methods</h3>
            <p className="text-xs text-ink-soft">
              Control accepted payment methods at checkout.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Cash Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Coins className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Cash Payment</div>
                <div className="text-xs text-ink-soft">Pay at counter or upon delivery</div>
              </div>
            </div>
            <Switch
              checked={config.enableCash}
              onChange={(next) => updateSetting('enableCash', next, 'Cash Payment')}
              disabled={updatingKey === 'enableCash'}
              srLabel="Enable or disable cash payment"
            />
          </div>

          {/* KHQR Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <QrCode className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">KHQR Payment</div>
                <div className="text-xs text-ink-soft">Bakong / ABA PayWay QR scan</div>
              </div>
            </div>
            <Switch
              checked={config.enableKhqr}
              onChange={(next) => updateSetting('enableKhqr', next, 'KHQR Payment')}
              disabled={updatingKey === 'enableKhqr'}
              srLabel="Enable or disable KHQR payment"
            />
          </div>
        </div>
      </Card>

      {/* 4. Rates & Delivery Fee */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Loyalty & Delivery Rates</h3>
            <p className="text-xs text-ink-soft">
              Point conversion rates and delivery fee for Arakawa.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink">Delivery Fee ($)</label>
            <input
              type="number"
              step="0.25"
              min="0"
              value={config.deliveryFee}
              onChange={(e) => setConfig((prev) => ({ ...prev, deliveryFee: Number(e.target.value) }))}
              onBlur={(e) => updateSetting('deliveryFee', Number(e.target.value), 'Delivery Fee')}
              className="h-11 rounded-xl border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">0 = Free delivery</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink">Redeem Rate (Points/$1)</label>
            <input
              type="number"
              min="1"
              value={config.pointsPerDollar}
              onChange={(e) => setConfig((prev) => ({ ...prev, pointsPerDollar: Number(e.target.value) }))}
              onBlur={(e) => updateSetting('pointsPerDollar', Number(e.target.value), 'Points per Dollar')}
              className="h-11 rounded-xl border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">Default: 100 pts = $1 (10 pts/stamp)</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink">Earn Rate (Points/$1 spent)</label>
            <input
              type="number"
              min="1"
              value={config.earnPointsPerDollar}
              onChange={(e) => setConfig((prev) => ({ ...prev, earnPointsPerDollar: Number(e.target.value) }))}
              onBlur={(e) => updateSetting('earnPointsPerDollar', Number(e.target.value), 'Earn Points Rate')}
              className="h-11 rounded-xl border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">Default: 10 pts per $1 spent</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
