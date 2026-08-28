import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Coins,
  Lock,
  Minus,
  Package,
  Phone,
  Plus,
  Receipt,
  Save,
  ShieldCheck,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Badge, Button, Card, Skeleton, useToast } from '../ui';
import type { CustomerDetail, CustomerSummary, CustomerTier } from './types';

const REASONS = [
  'Correction',
  'Promotion / Special Campaign',
  'Compensation / Service Recovery',
  'Goodwill Reward',
  'Card Fill-up Manual Sync',
  'Other',
];

type CustomerTab = 'type' | 'stamps' | 'tickets' | 'orders';

export type CustomerEditModalProps = {
  customerSummary: CustomerSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdated: (updated: CustomerSummary) => void;
};

export function CustomerEditModal({
  customerSummary,
  isOpen,
  onClose,
  onCustomerUpdated,
}: CustomerEditModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CustomerTab>('type');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Trust notes state
  const [trustNotes, setTrustNotes] = useState('');
  const [savingTier, setSavingTier] = useState(false);

  // Stamps adjustment state
  const [pointsDelta, setPointsDelta] = useState<number>(0);
  const [customDeltaInput, setCustomDeltaInput] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [savingPoints, setSavingPoints] = useState(false);

  // Lucky tickets adjustment state
  const [savingTickets, setSavingTickets] = useState(false);

  const fetchCustomerDetails = useCallback(
    async (telegramUserId: string) => {
      setLoading(true);
      try {
        const data = await apiFetch<CustomerDetail>(
          `/api/customers/${encodeURIComponent(telegramUserId)}`
        );
        setDetail(data);
        setTrustNotes(data.trustNotes || '');
      } catch {
        toast({
          title: "Couldn't load full customer details",
          variant: 'error',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const targetUserId = customerSummary?.telegramUserId;

  useEffect(() => {
    if (isOpen && targetUserId) {
      setActiveTab('type');
      setTrustNotes(customerSummary?.trustNotes || '');
      setPointsDelta(0);
      setCustomDeltaInput('');
      setReason('');
      fetchCustomerDetails(targetUserId);
    } else if (!isOpen) {
      setDetail(null);
    }
  }, [isOpen, targetUserId, fetchCustomerDetails]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !customerSummary) return null;

  const currentPoints = detail ? detail.loyaltyPoints : customerSummary.loyaltyPoints;
  const currentStamps = Math.floor(currentPoints / 10);
  const currentTickets = detail ? detail.luckyTickets : customerSummary.luckyTickets;
  const currentTier: CustomerTier = detail ? detail.tier : customerSummary.tier;
  const isGold = currentTier === 'gold';

  // Live calculation for points adjustment
  const activeDelta =
    customDeltaInput.trim() !== '' ? Number(customDeltaInput) || 0 : pointsDelta;
  const targetPoints = Math.max(0, currentPoints + activeDelta);
  const targetStamps = Math.floor(targetPoints / 10);
  const canSavePoints =
    activeDelta !== 0 && targetPoints >= 0 && reason !== '' && !savingPoints;

  const applyStampQuick = (deltaStamps: number) => {
    const deltaPts = deltaStamps * 10;
    setPointsDelta((prev) => prev + deltaPts);
    setCustomDeltaInput('');
  };

  const clearDelta = () => {
    setPointsDelta(0);
    setCustomDeltaInput('');
  };

  // Switch Tier
  const handleToggleTier = async (targetTier: CustomerTier) => {
    setSavingTier(true);
    try {
      const updated = await apiFetch<CustomerSummary>(
        `/api/customers/${encodeURIComponent(customerSummary.telegramUserId)}/tier`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: targetTier,
            trustNotes: trustNotes.trim() || undefined,
          }),
        }
      );

      setDetail((prev) =>
        prev ? { ...prev, tier: targetTier, trustNotes: updated.trustNotes } : null
      );
      onCustomerUpdated(updated);
      toast({
        title: targetTier === 'gold' ? 'Promoted to Gold' : 'Changed to Standard',
        description:
          targetTier === 'gold'
            ? 'Customer is now trusted for Cash on Delivery!'
            : 'Customer must now pay KHQR upfront.',
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: "Couldn't update customer tier",
        description: err.message,
        variant: 'error',
      });
    } finally {
      setSavingTier(false);
    }
  };

  // Save trust notes independently
  const handleSaveNotes = async () => {
    setSavingTier(true);
    try {
      const updated = await apiFetch<CustomerSummary>(
        `/api/customers/${encodeURIComponent(customerSummary.telegramUserId)}/tier`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tier: currentTier,
            trustNotes: trustNotes.trim() || null,
          }),
        }
      );

      setDetail((prev) => (prev ? { ...prev, trustNotes: updated.trustNotes } : null));
      onCustomerUpdated(updated);
      toast({
        title: 'Trust notes updated',
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: "Couldn't save notes",
        description: err.message,
        variant: 'error',
      });
    } finally {
      setSavingTier(false);
    }
  };

  // Adjust Points / Stamps
  const handleApplyPoints = async () => {
    if (!canSavePoints) return;
    setSavingPoints(true);
    try {
      const updatedUser = await apiFetch<{ loyaltyPoints: number }>(
        `/api/users/${encodeURIComponent(customerSummary.telegramUserId)}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: targetPoints }),
        }
      );

      setDetail((prev) =>
        prev ? { ...prev, loyaltyPoints: updatedUser.loyaltyPoints } : null
      );
      onCustomerUpdated({
        ...customerSummary,
        loyaltyPoints: updatedUser.loyaltyPoints,
      });

      const sign = activeDelta > 0 ? '+' : '';
      toast({
        title: 'Stamps adjusted',
        description: `${sign}${activeDelta / 10} stamps (${sign}${activeDelta} pts). New balance: ${Math.floor(updatedUser.loyaltyPoints / 10)} stamps.`,
        variant: 'success',
      });

      clearDelta();
      setReason('');
    } catch (err: any) {
      toast({
        title: "Couldn't update stamps",
        description: err.message,
        variant: 'error',
      });
    } finally {
      setSavingPoints(false);
    }
  };

  // Adjust Lucky Tickets
  const handleAdjustTickets = async (deltaTickets: number) => {
    setSavingTickets(true);
    try {
      const updated = await apiFetch<{ luckyTickets: number }>(
        `/api/customers/${encodeURIComponent(customerSummary.telegramUserId)}/lucky-tickets`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delta: deltaTickets }),
        }
      );

      setDetail((prev) =>
        prev ? { ...prev, luckyTickets: updated.luckyTickets } : null
      );
      onCustomerUpdated({ ...customerSummary, luckyTickets: updated.luckyTickets });

      const sign = deltaTickets > 0 ? '+' : '';
      toast({
        title: 'Lucky Tickets updated',
        description: `${sign}${deltaTickets} tickets. Total: ${updated.luckyTickets} tickets.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: "Couldn't adjust lucky tickets",
        description: err.message,
        variant: 'error',
      });
    } finally {
      setSavingTickets(false);
    }
  };

  const displayName =
    customerSummary.contactName ||
    [customerSummary.firstName, customerSummary.lastName].filter(Boolean).join(' ') ||
    (customerSummary.username
      ? `@${customerSummary.username}`
      : `Customer #${customerSummary.telegramUserId}`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <Card
        padding="none"
        className="relative z-10 flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden border-border bg-surface shadow-2xl my-auto"
      >
        {/* Modal Header */}
        <div className="border-b border-border bg-surface px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black shadow-xs ${
                  isGold
                    ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white ring-2 ring-amber-400/50'
                    : 'bg-surface-sunken text-ink ring-1 ring-border'
                }`}
              >
                {(
                  customerSummary.firstName?.[0] ||
                  customerSummary.contactName?.[0] ||
                  'U'
                ).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id="customer-edit-title"
                    className="truncate text-base font-black text-ink"
                  >
                    {displayName}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                      isGold
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-surface-sunken text-ink-soft border border-border'
                    }`}
                  >
                    {isGold ? 'Gold' : 'Standard'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-ink-soft">
                  <span className="font-mono text-ink-faint">
                    ID: {customerSummary.telegramUserId}
                  </span>
                  {customerSummary.username && (
                    <span className="font-mono font-semibold text-accent">
                      @{customerSummary.username}
                    </span>
                  )}
                  {customerSummary.phoneNumber && (
                    <a
                      href={`tel:${customerSummary.phoneNumber}`}
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    >
                      <Phone className="size-3" />
                      {customerSummary.phoneNumber}
                    </a>
                  )}
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close modal"
              className="size-8 rounded-lg shrink-0 text-ink-faint hover:text-ink"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface-sunken/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-ink-faint">Orders</p>
              <p className="text-sm font-extrabold text-ink">
                {detail?.totalOrders ?? customerSummary.totalOrders}{' '}
                <span className="text-xs font-semibold text-accent">
                  (${Number(detail?.totalSpent ?? customerSummary.totalSpent).toFixed(2)})
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-sunken/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-ink-faint">Stamps</p>
              <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                {currentStamps}{' '}
                <span className="text-[10px] font-medium text-ink-faint">
                  ({currentPoints} pts)
                </span>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-sunken/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-ink-faint">Lucky Tickets</p>
              <p className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                🎟️ {currentTickets}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-surface-sunken/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-ink-faint">Location</p>
              <p className="truncate text-xs font-bold text-ink">
                {customerSummary.building || customerSummary.roomNumber ? (
                  `${customerSummary.building ? `Bldg ${customerSummary.building}` : ''} ${customerSummary.roomNumber ? `Rm ${customerSummary.roomNumber}` : ''}`
                ) : (
                  <span className="text-ink-faint font-normal">None saved</span>
                )}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setActiveTab('type')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'type'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <ShieldCheck className="size-3.5" />
              <span>Type &amp; Notes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stamps')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'stamps'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <Coins className="size-3.5" />
              <span>Stamps ({currentStamps})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tickets')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'tickets'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <Ticket className="size-3.5" />
              <span>Tickets ({currentTickets})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                activeTab === 'orders'
                  ? 'bg-accent text-on-accent shadow-xs'
                  : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
              }`}
            >
              <Receipt className="size-3.5" />
              <span>Orders {detail?.orders ? `(${detail.orders.length})` : ''}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 max-h-[55vh]">
          {/* TAB 1: CUSTOMER TYPE & NOTES */}
          {activeTab === 'type' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface-sunken/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase text-ink">
                      Customer Tier &amp; COD Trust
                    </h4>
                    <p className="mt-1 text-xs text-ink-soft">
                      {isGold
                        ? 'Gold customers can pay with Cash on Delivery (COD).'
                        : 'Standard customers must pay upfront via KHQR.'}
                    </p>
                  </div>
                  <Badge variant={isGold ? 'success' : 'default'}>
                    {isGold ? 'Gold' : 'Standard'}
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {isGold ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="md"
                      loading={savingTier}
                      onClick={() => handleToggleTier('standard')}
                      className="gap-1.5 font-bold text-xs"
                    >
                      <Lock className="size-3.5" />
                      Demote to Standard
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      loading={savingTier}
                      onClick={() => handleToggleTier('gold')}
                      className="gap-1.5 font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                    >
                      <Sparkles className="size-3.5" />
                      Promote to Gold
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="trust-notes-input"
                  className="block text-xs font-bold uppercase text-ink mb-1.5"
                >
                  Manager Notes / Room Info
                </label>
                <textarea
                  id="trust-notes-input"
                  rows={3}
                  value={trustNotes}
                  onChange={(e) => setTrustNotes(e.target.value)}
                  placeholder="e.g. Neighbor in Arakawa Block A 1110, trusted regular customer."
                  className="w-full rounded-xl border border-border bg-surface p-3 text-xs font-medium text-ink outline-none transition-colors focus:border-accent"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    loading={savingTier}
                    onClick={handleSaveNotes}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Save className="size-3.5" />
                    Save Notes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STAMPS & POINTS */}
          {activeTab === 'stamps' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3.5">
                <div>
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Current Balance
                  </span>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {currentStamps} Stamps{' '}
                    <span className="text-xs font-normal">({currentPoints} Points)</span>
                  </p>
                </div>
                <div className="text-right text-[11px] text-emerald-700 dark:text-emerald-300">
                  1 Stamp = 10 Points
                  <br />
                  10 Stamps = 1 Free Drink
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-ink mb-2">
                  Quick Stamp Adjustment
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '+1 Stamp', delta: 1 },
                    { label: '+2 Stamps', delta: 2 },
                    { label: '+5 Stamps', delta: 5 },
                    { label: '+10 (1 Card)', delta: 10 },
                    { label: '-1 Stamp', delta: -1 },
                    { label: '-5 Stamps', delta: -5 },
                    { label: '-10 Stamps', delta: -10 },
                  ].map((item) => (
                    <Button
                      key={item.label}
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => applyStampQuick(item.delta)}
                      className="h-8 px-2.5 text-xs font-bold"
                    >
                      {item.label}
                    </Button>
                  ))}
                  {(pointsDelta !== 0 || customDeltaInput !== '') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={clearDelta}
                      className="h-8 px-2 text-xs text-danger"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="modal-custom-delta"
                    className="block text-xs font-bold text-ink mb-1"
                  >
                    Custom Points Delta
                  </label>
                  <input
                    id="modal-custom-delta"
                    type="number"
                    step="10"
                    placeholder="e.g. +30 or -20"
                    value={customDeltaInput || (pointsDelta !== 0 ? pointsDelta : '')}
                    onChange={(e) => {
                      setCustomDeltaInput(e.target.value);
                      setPointsDelta(0);
                    }}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="modal-reason-select"
                    className="block text-xs font-bold text-ink mb-1"
                  >
                    Reason <span className="text-danger">*</span>
                  </label>
                  <select
                    id="modal-reason-select"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-ink outline-none focus:border-accent"
                  >
                    <option value="">Select reason...</option>
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="rounded-xl border border-border bg-surface-sunken/40 p-3 text-xs">
                {activeDelta !== 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-ink-soft">Preview:</span>
                    <span className="font-bold text-ink">
                      {currentStamps} stamps ({currentPoints} pts) →{' '}
                      <span className="text-accent font-black">
                        {targetStamps} stamps ({targetPoints} pts)
                      </span>{' '}
                      <span className={activeDelta > 0 ? 'text-success' : 'text-danger'}>
                        ({activeDelta > 0 ? `+${activeDelta / 10}` : `${activeDelta / 10}`} stamps)
                      </span>
                    </span>
                  </div>
                ) : (
                  <span className="text-ink-faint">
                    Select quick stamps or enter custom points delta above.
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="success"
                size="md"
                disabled={!canSavePoints}
                loading={savingPoints}
                onClick={handleApplyPoints}
                className="w-full font-bold text-xs h-10 gap-1.5"
              >
                <CheckCircle className="size-4" />
                Apply Stamp Adjustment
              </Button>
            </div>
          )}

          {/* TAB 3: LUCKY TICKETS */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                <div>
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    Active Tickets
                  </span>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400">
                    🎟️ {currentTickets} Tickets
                  </p>
                </div>
                <p className="text-right text-xs text-amber-700 dark:text-amber-300">
                  Entered in next Lucky Draw
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-ink mb-2">
                  Adjust Lucky Tickets
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    disabled={currentTickets <= 0}
                    loading={savingTickets}
                    onClick={() => handleAdjustTickets(-1)}
                    className="h-9 px-3 text-xs font-bold"
                  >
                    <Minus className="size-3.5" /> 1 Ticket
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    loading={savingTickets}
                    onClick={() => handleAdjustTickets(1)}
                    className="h-9 px-3 text-xs font-bold"
                  >
                    <Plus className="size-3.5" /> 1 Ticket
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={savingTickets}
                    onClick={() => handleAdjustTickets(5)}
                    className="h-9 px-3 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white border-0"
                  >
                    <Plus className="size-3.5" /> 5 Tickets
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RECENT ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-3">
              {loading && !detail ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : !detail?.orders || detail.orders.length === 0 ? (
                <div className="py-10 text-center">
                  <Package className="mx-auto size-9 text-ink-faint" />
                  <p className="mt-2 text-sm font-bold text-ink">No recent orders</p>
                  <p className="text-xs text-ink-soft">
                    Orders will appear here once placed by the customer.
                  </p>
                </div>
              ) : (
                detail.orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-border bg-surface-sunken/30 p-3 transition-all hover:bg-surface-sunken/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-ink">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <Badge
                            variant={
                              order.status === 'completed' || order.status === 'paid'
                                ? 'success'
                                : order.status === 'preparing'
                                  ? 'preparing'
                                  : order.status === 'ready'
                                    ? 'ready'
                                    : 'neutral'
                            }
                            className="text-[10px] uppercase font-bold"
                          >
                            {order.status}
                          </Badge>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                              order.paymentMethod === 'cash'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-accent-soft text-accent'
                            }`}
                          >
                            {order.paymentMethod.toUpperCase()}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                          <Clock className="size-3" />
                          <span>{new Date(order.createdAt).toLocaleString()}</span>
                        </div>
                      </div>

                      <span className="text-sm font-extrabold text-ink">
                        ${Number(order.totalAmount).toFixed(2)}
                      </span>
                    </div>

                    {order.items && order.items.length > 0 && (
                      <div className="mt-2 border-t border-border/50 pt-1.5 space-y-1">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs text-ink-soft"
                          >
                            <span className="truncate">
                              <strong className="text-ink font-semibold">
                                {item.quantity}x
                              </strong>{' '}
                              {item.menuItem?.name || 'Item'}
                              {item.modifiers ? (
                                <span className="text-[10px] text-ink-faint italic ml-1">
                                  ({item.modifiers})
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono text-ink text-[11px] shrink-0 ml-2">
                              ${(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end border-t border-border bg-surface px-6 py-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            className="font-bold text-xs px-4"
          >
            Done
          </Button>
        </div>
      </Card>
    </div>
  );
}
