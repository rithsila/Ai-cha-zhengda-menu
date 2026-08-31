import { useEffect, useState } from 'react';
import { Check, Gift, Loader2, Plus, RotateCcw, Settings, ShieldCheck, Sparkles, Ticket, Trash2, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Button, Card, Switch, useToast } from '../ui';
import type { SystemConfigItem } from './types';

export interface LuckyWheelPrizeItem {
  id: string;
  label: string;
  name: string;
  icon: string;
  color: string;
  type: 'points' | 'tickets' | 'item';
  value: number;
  weight: number;
}

const DEFAULT_LUCKY_PRIZES: LuckyWheelPrizeItem[] = [
  { id: 'p1', label: '+10 Pts', name: '+10 Loyalty Points', icon: '⭐', color: '#F59E0B', type: 'points', value: 10, weight: 30 },
  { id: 'p2', label: '+1 Ticket', name: '+1 Bonus Lucky Ticket', icon: '🎟️', color: '#EF4444', type: 'tickets', value: 1, weight: 20 },
  { id: 'p3', label: '+20 Pts', name: '+20 Loyalty Points', icon: '⭐', color: '#10B981', type: 'points', value: 20, weight: 25 },
  { id: 'p4', label: '$0.50 Off', name: '$0.50 Discount (50 Pts)', icon: '🏷️', color: '#3B82F6', type: 'points', value: 50, weight: 10 },
  { id: 'p5', label: 'Blind Box', name: 'Mystery Blind Box Toy', icon: '🎁', color: '#8B5CF6', type: 'item', value: 0, weight: 5 },
  { id: 'p6', label: '+50 Pts', name: '+50 Loyalty Points', icon: '✨', color: '#EC4899', type: 'points', value: 50, weight: 10 },
  { id: 'p7', label: 'Fried Chicken', name: 'Zhengda Fried Chicken Voucher', icon: '🍗', color: '#F97316', type: 'item', value: 0, weight: 5 },
  { id: 'p8', label: 'Free Drink', name: 'Free Drink (100 Pts)', icon: '🧋', color: '#14B8A6', type: 'points', value: 100, weight: 5 },
];

const PRESET_COLORS = [
  '#F59E0B', '#EF4444', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
];

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
  const [luckyTicketsCostPerSpin, setLuckyTicketsCostPerSpin] = useState<number>(5);
  const [prizes, setPrizes] = useState<LuckyWheelPrizeItem[]>(DEFAULT_LUCKY_PRIZES);

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
        if (configMap.has('luckyTicketsCostPerSpin')) {
          setLuckyTicketsCostPerSpin(Number(configMap.get('luckyTicketsCostPerSpin')) || 5);
        }
        if (configMap.has('luckyWheelPrizes')) {
          try {
            const rawPrizes = JSON.parse(configMap.get('luckyWheelPrizes') || '[]');
            if (Array.isArray(rawPrizes) && rawPrizes.length >= 2) {
              setPrizes(rawPrizes);
            }
          } catch {
            // Keep default
          }
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

  const handleUpdatePrize = (index: number, updates: Partial<LuckyWheelPrizeItem>) => {
    setPrizes((prev) => prev.map((p, idx) => (idx === index ? { ...p, ...updates } : p)));
  };

  const handleAddPrize = () => {
    const nextIdx = prizes.length + 1;
    const color = PRESET_COLORS[(prizes.length) % PRESET_COLORS.length];
    setPrizes((prev) => [
      ...prev,
      {
        id: `prize_${Date.now()}`,
        label: `+${nextIdx * 10} Pts`,
        name: `+${nextIdx * 10} Loyalty Points`,
        icon: '⭐',
        color,
        type: 'points',
        value: nextIdx * 10,
        weight: 10,
      },
    ]);
  };

  const handleRemovePrize = (index: number) => {
    if (prizes.length <= 2) {
      toast({
        title: 'Cannot remove prize segment',
        description: 'The wheel must have at least 2 prize segments.',
        variant: 'error',
      });
      return;
    }
    setPrizes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleResetPrizes = () => {
    setPrizes(DEFAULT_LUCKY_PRIZES);
    toast({
      title: 'Reset to default prizes',
      description: 'Default 8 prize segments restored.',
      variant: 'info',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'goldMinOrdersThreshold', value: Math.max(0, goldMinOrdersThreshold) },
        { key: 'allowCashForStandard', value: allowCashForStandard ? 1 : 0 },
        { key: 'luckyDrawEnabled', value: luckyDrawEnabled ? 1 : 0 },
        { key: 'luckyTicketsPerGoldOrder', value: Math.max(0, luckyTicketsPerGoldOrder) },
        { key: 'luckyTicketsPerStandardOrder', value: Math.max(0, luckyTicketsPerStandardOrder) },
        { key: 'luckyTicketsCostPerSpin', value: Math.max(1, luckyTicketsCostPerSpin) },
        { key: 'luckyWheelPrizes', value: JSON.stringify(prizes) },
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
        description: 'Customer settings and Lucky Draw rules updated.',
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
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent-soft text-accent">
              <Settings className="size-5" />
            </div>
            <div>
              <h3 id="trust-config-title" className="text-base font-bold text-ink">
                Customer & Lucky Draw Settings
              </h3>
              <p className="text-xs text-ink-soft">
                Configure payment rules, tickets, and wheel prize segments
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex size-8 items-center justify-center rounded-none text-ink-soft hover:bg-surface-soft hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-8 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-6 pt-5">
            {/* Section 1: Customer Type & Payment Rules */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <ShieldCheck className="size-4 text-accent" />
                <span>Customer Type &amp; Payment Rules</span>
              </div>

              <div className="space-y-3 rounded-none border border-border bg-surface-soft/40 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="gold-threshold-input" className="text-xs font-bold text-ink block">
                      Orders for Gold VIP Promotion
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of completed/paid orders needed to auto-promote customer to Gold.
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
                      className="h-10 w-24 rounded-none border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">orders</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-ink block">
                      Allow Cash Pickup for Standard Customers
                    </span>
                    <p className="text-[11px] text-ink-soft">
                      When OFF, Standard customers must pay via KHQR before preparing. Gold customers always allowed.
                    </p>
                  </div>
                  <Switch
                    checked={allowCashForStandard}
                    onChange={setAllowCashForStandard}
                    srLabel="Allow cash for standard customers"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Lucky Draw Rules */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <Sparkles className="size-4 text-amber-500" />
                <span>Lucky Draw &amp; Ticket Rules</span>
              </div>

              <div className="space-y-3 rounded-none border border-border bg-surface-soft/40 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
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
                    srLabel="Enable lucky draw feature"
                  />
                </div>

                <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="gold-tickets-input" className="text-xs font-bold text-ink block flex items-center gap-1.5">
                      <Ticket className="size-3.5 text-amber-500" />
                      Tickets per Gold VIP Order
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of lucky draw tickets earned by Gold VIP customers per order.
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
                      className="h-10 w-24 rounded-none border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">tickets</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="std-tickets-input" className="text-xs font-bold text-ink block flex items-center gap-1.5">
                      <Ticket className="size-3.5 text-ink-soft" />
                      Tickets per Standard Order
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
                      className="h-10 w-24 rounded-none border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">tickets</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label htmlFor="spin-cost-input" className="text-xs font-bold text-ink block flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-amber-500" />
                      Tickets Required per Spin
                    </label>
                    <p className="text-[11px] text-ink-soft">
                      Number of tickets customer must spend for 1 Lucky Draw spin (Default: 5).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      id="spin-cost-input"
                      type="number"
                      min="1"
                      max="50"
                      value={luckyTicketsCostPerSpin}
                      onChange={(e) => setLuckyTicketsCostPerSpin(Math.max(1, Number(e.target.value) || 1))}
                      className="h-10 w-24 rounded-none border border-border bg-surface px-3 text-center text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                    <span className="text-xs font-semibold text-ink-soft">tickets</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Spin Wheel Prize Segments */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Gift className="size-4 text-emerald-600" />
                  <span>Spin Wheel Prize Segments ({prizes.length} Slices)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={handleResetPrizes}
                    className="h-8 px-2.5 gap-1 text-xs text-ink-soft"
                  >
                    <RotateCcw className="size-3" />
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleAddPrize}
                    className="h-8 px-2.5 gap-1 text-xs font-bold text-accent"
                  >
                    <Plus className="size-3.5" />
                    Add Slice
                  </Button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {prizes.map((prize, index) => (
                  <div
                    key={prize.id || index}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 rounded-none border border-border bg-surface-soft/40 p-3"
                  >
                    <div className="flex items-center gap-2.5 w-full sm:w-auto">
                      {/* Color Preview & Preset Selector */}
                      <div className="relative shrink-0 flex items-center">
                        <input
                          type="color"
                          value={prize.color}
                          onChange={(e) => handleUpdatePrize(index, { color: e.target.value })}
                          className="size-7 cursor-pointer rounded-none border-0 p-0"
                          title="Choose Slice Color"
                        />
                      </div>

                      {/* Icon / Emoji Input */}
                      <input
                        type="text"
                        value={prize.icon}
                        onChange={(e) => handleUpdatePrize(index, { icon: e.target.value })}
                        className="h-8 w-9 rounded-none border border-border bg-surface text-center text-sm outline-none focus:border-accent"
                        title="Prize Emoji"
                      />

                      {/* Label on Wheel */}
                      <div className="flex-1 sm:w-28">
                        <input
                          type="text"
                          value={prize.label}
                          onChange={(e) => handleUpdatePrize(index, { label: e.target.value })}
                          placeholder="Wheel Label"
                          className="h-8 w-full rounded-none border border-border bg-surface px-2 text-xs font-bold text-ink outline-none focus:border-accent"
                          title="Label on Wheel"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      {/* Reward Type */}
                      <select
                        value={prize.type}
                        onChange={(e) => handleUpdatePrize(index, { type: e.target.value as any })}
                        className="h-8 rounded-none border border-border bg-surface px-2 text-xs font-semibold text-ink outline-none focus:border-accent"
                      >
                        <option value="points">Points (+Pts)</option>
                        <option value="tickets">Tickets (+Tix)</option>
                        <option value="item">Voucher / Item</option>
                      </select>

                      {/* Value Input (for points / tickets) */}
                      {prize.type !== 'item' && (
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={prize.value}
                          onChange={(e) => handleUpdatePrize(index, { value: Number(e.target.value) || 0 })}
                          placeholder="Val"
                          className="h-8 w-16 rounded-none border border-border bg-surface px-2 text-center text-xs font-bold text-ink outline-none focus:border-accent"
                          title="Reward Value"
                        />
                      )}

                      {/* Weight / Odds Input */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-ink-soft">Odds:</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={prize.weight}
                          onChange={(e) => handleUpdatePrize(index, { weight: Math.max(1, Number(e.target.value) || 1) })}
                          className="h-8 w-12 rounded-none border border-border bg-surface px-1 text-center text-xs font-bold text-ink outline-none focus:border-accent"
                          title="Win Chance Weight"
                        />
                      </div>

                      {/* Delete Slice */}
                      <button
                        type="button"
                        onClick={() => handleRemovePrize(index)}
                        disabled={prizes.length <= 2}
                        aria-label="Remove slice"
                        className="flex size-8 shrink-0 items-center justify-center rounded-none text-ink-soft hover:bg-error-soft hover:text-error disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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
