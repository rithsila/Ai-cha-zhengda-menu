import { useEffect, useState } from 'react';
import { Check, Loader2, Settings, ShieldCheck, Sparkles, Ticket, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Switch, useToast } from '../ui';
import type { SystemConfigItem } from './types';

type TrustConfigModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function TrustConfigModal({ isOpen, onClose, onSaved }: TrustConfigModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Configuration states
  const [goldMinOrdersThreshold, setGoldMinOrdersThreshold] = useState<number>(3);
  const [allowCashForStandard, setAllowCashForStandard] = useState<boolean>(false);
  const [luckyDrawEnabled, setLuckyDrawEnabled] = useState<boolean>(true);
  const [luckyTicketsPerGoldOrder, setLuckyTicketsPerGoldOrder] = useState<number>(2);
  const [luckyTicketsPerStandardOrder, setLuckyTicketsPerStandardOrder] = useState<number>(1);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);

    apiFetch<SystemConfigItem[]>('/api/config')
      .then((configs) => {
        if (!mounted) return;
        const configMap = new Map(configs.map((c) => [c.key, c.value]));

        if (configMap.has('goldMinOrdersThreshold')) {
          setGoldMinOrdersThreshold(Number(configMap.get('goldMinOrdersThreshold')) || 3);
        }
        if (configMap.has('allowCashForStandard')) {
          setAllowCashForStandard(configMap.get('allowCashForStandard') === '1');
        }
        if (configMap.has('luckyDrawEnabled')) {
          setLuckyDrawEnabled(configMap.get('luckyDrawEnabled') === '1');
        }
        if (configMap.has('luckyTicketsPerGoldOrder')) {
          setLuckyTicketsPerGoldOrder(Number(configMap.get('luckyTicketsPerGoldOrder')) || 2);
        }
        if (configMap.has('luckyTicketsPerStandardOrder')) {
          setLuckyTicketsPerStandardOrder(Number(configMap.get('luckyTicketsPerStandardOrder')) || 1);
        }
      })
      .catch(() => {
        if (!mounted) return;
        toast({
          title: "Couldn't load system configuration",
          description: 'Using default configuration values.',
          variant: 'error',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, toast]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'goldMinOrdersThreshold', value: Math.max(0, goldMinOrdersThreshold) },
        { key: 'allowCashForStandard', value: allowCashForStandard ? 1 : 0 },
        { key: 'luckyDrawEnabled', value: luckyDrawEnabled ? 1 : 0 },
        { key: 'luckyTicketsPerGoldOrder', value: Math.max(0, luckyTicketsPerGoldOrder) },
        { key: 'luckyTicketsPerStandardOrder', value: Math.max(0, luckyTicketsPerStandardOrder) },
      ];

      for (const update of updates) {
        await apiFetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        });
      }

      toast({
        title: 'Settings saved',
        description: 'Trust tiers and Lucky Draw rules updated.',
        variant: 'success',
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast({
        title: "Couldn't save configuration",
        description: err.message || 'Please try again.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trust-config-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <Card
        padding="lg"
        className="relative z-10 w-full max-w-xl max-h-[90vh] overflow-y-auto border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Settings className="size-5" />
            </div>
            <div>
              <h3 id="trust-config-title" className="text-base font-bold text-ink">
                Trust Tiers &amp; Lucky Draw Settings
              </h3>
              <p className="text-xs text-ink-soft">
                Configure payment rules and reward mechanics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="size-8 animate-spin text-accent" />
            <p className="text-sm font-medium text-ink-soft">Loading configuration...</p>
          </div>
        ) : (
          <div className="space-y-6 pt-5">
            {/* Section: Trust Tiers */}
            <div className="space-y-4 rounded-2xl border border-border bg-surface-sunken/30 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Customer Trust Rules</span>
              </div>

              <div className="space-y-3 divide-y divide-border/60">
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="gold-threshold-input" className="text-xs font-bold text-ink block">
                      Auto-Gold Orders Threshold
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of paid orders required to automatically promote a customer to Gold tier.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="gold-threshold-input"
                      type="number"
                      min="1"
                      max="100"
                      value={goldMinOrdersThreshold}
                      onChange={(e) => setGoldMinOrdersThreshold(Number(e.target.value) || 1)}
                      className="h-10 w-24 rounded-xl border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">orders</span>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Allow Cash for Standard Tier
                    </span>
                    <p className="text-[11px] text-ink-soft">
                      If disabled, Standard customers must pay upfront via KHQR before kitchen prepares orders.
                    </p>
                  </div>
                  <Switch
                    checked={allowCashForStandard}
                    onChange={setAllowCashForStandard}
                    aria-label="Allow Cash for Standard Tier"
                  />
                </div>
              </div>
            </div>

            {/* Section: Lucky Draw */}
            <div className="space-y-4 rounded-2xl border border-border bg-surface-sunken/30 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <Sparkles className="size-4 text-amber-500" />
                <span>Lucky Draw &amp; Ticket Rewards</span>
              </div>

              <div className="space-y-3 divide-y divide-border/60">
                <div className="pt-2 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Lucky Draw Feature Active
                    </span>
                    <p className="text-[11px] text-ink-soft">
                      Enable giving lucky draw tickets to customers on qualifying orders.
                    </p>
                  </div>
                  <Switch
                    checked={luckyDrawEnabled}
                    onChange={setLuckyDrawEnabled}
                    aria-label="Lucky Draw Feature Active"
                  />
                </div>

                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="gold-tickets-input" className="text-xs font-bold text-ink block flex items-center gap-1.5">
                      <Ticket className="size-3.5 text-amber-500" />
                      Tickets per Gold Tier Order
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of lucky draw tickets earned by Gold customers per order.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="gold-tickets-input"
                      type="number"
                      min="0"
                      max="20"
                      value={luckyTicketsPerGoldOrder}
                      onChange={(e) => setLuckyTicketsPerGoldOrder(Number(e.target.value) || 0)}
                      className="h-10 w-24 rounded-xl border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">tickets</span>
                  </div>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="std-tickets-input" className="text-xs font-bold text-ink block flex items-center gap-1.5">
                      <Ticket className="size-3.5 text-ink-soft" />
                      Tickets per Standard Tier Order
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of lucky draw tickets earned by Standard customers per order.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="std-tickets-input"
                      type="number"
                      min="0"
                      max="20"
                      value={luckyTicketsPerStandardOrder}
                      onChange={(e) => setLuckyTicketsPerStandardOrder(Number(e.target.value) || 0)}
                      className="h-10 w-24 rounded-xl border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">tickets</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={saving}
                onClick={handleSave}
                className="gap-1.5 font-bold"
              >
                <Check className="size-4" />
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
