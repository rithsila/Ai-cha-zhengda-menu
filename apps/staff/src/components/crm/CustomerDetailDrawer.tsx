import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  Coins,
  Lock,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Receipt,
  Save,
  Shield,
  ShieldCheck,
  Star,
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

type CustomerDetailDrawerProps = {
  customerSummary: CustomerSummary | null;
  onClose: () => void;
  onCustomerUpdated: (updated: CustomerSummary) => void;
};

export function CustomerDetailDrawer({
  customerSummary,
  onClose,
  onCustomerUpdated,
}: CustomerDetailDrawerProps) {
  const { toast } = useToast();
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

  const fetchCustomerDetails = useCallback(async (telegramUserId: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<CustomerDetail>(`/api/customers/${encodeURIComponent(telegramUserId)}`);
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
  }, [toast]);

  const targetUserId = customerSummary?.telegramUserId;

  useEffect(() => {
    if (targetUserId) {
      setTrustNotes(customerSummary?.trustNotes || '');
      setPointsDelta(0);
      setCustomDeltaInput('');
      setReason('');
      fetchCustomerDetails(targetUserId);
    } else {
      setDetail(null);
    }
  }, [targetUserId, fetchCustomerDetails]);

  if (!customerSummary) return null;

  const currentPoints = detail ? detail.loyaltyPoints : customerSummary.loyaltyPoints;
  const currentStamps = Math.floor(currentPoints / 10);
  const currentTickets = detail ? detail.luckyTickets : customerSummary.luckyTickets;
  const currentTier: CustomerTier = detail ? detail.tier : customerSummary.tier;
  const isGold = currentTier === 'gold';

  // Live calculation for points adjustment
  const activeDelta = customDeltaInput.trim() !== '' ? Number(customDeltaInput) || 0 : pointsDelta;
  const targetPoints = Math.max(0, currentPoints + activeDelta);
  const targetStamps = Math.floor(targetPoints / 10);
  const canSavePoints = activeDelta !== 0 && targetPoints >= 0 && reason !== '' && !savingPoints;

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

      setDetail((prev) => (prev ? { ...prev, tier: targetTier, trustNotes: updated.trustNotes } : null));
      onCustomerUpdated(updated);
      toast({
        title: targetTier === 'gold' ? 'Promoted to ⭐ Gold Tier' : 'Demoted to Standard Tier',
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

      setDetail((prev) => (prev ? { ...prev, loyaltyPoints: updatedUser.loyaltyPoints } : null));
      onCustomerUpdated({ ...customerSummary, loyaltyPoints: updatedUser.loyaltyPoints });

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

      setDetail((prev) => (prev ? { ...prev, luckyTickets: updated.luckyTickets } : null));
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
    (customerSummary.username ? `@${customerSummary.username}` : `Customer #${customerSummary.telegramUserId}`);

  return (
    <div className="space-y-6">
      {/* Detail Header / Profile Overview Card */}
      <Card padding="lg" className="border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex size-14 items-center justify-center rounded-2xl text-xl font-black shadow-sm ${
                isGold
                  ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white ring-2 ring-amber-400/50'
                  : 'bg-surface-sunken text-ink ring-1 ring-border'
              }`}
            >
              {isGold ? '⭐' : (customerSummary.firstName?.[0] || customerSummary.contactName?.[0] || 'U').toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-black text-ink">{displayName}</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black ${
                    isGold
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-surface-sunken text-ink-soft border border-border'
                  }`}
                >
                  {isGold ? (
                    <>
                      <Star className="size-3 fill-current text-amber-500" />
                      ⭐ Gold (Trusted Cash)
                    </>
                  ) : (
                    <>
                      <Shield className="size-3 text-ink-soft" />
                      Standard (Pay First)
                    </>
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-ink-soft">
                <span className="font-mono text-ink-faint">ID: {customerSummary.telegramUserId}</span>
                {customerSummary.username && (
                  <span className="font-mono text-accent font-semibold">@{customerSummary.username}</span>
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

          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details" className="rounded-xl">
            <X className="size-5" />
          </Button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-4">
          <div className="rounded-xl border border-border bg-surface-sunken/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Completed Orders</p>
            <p className="mt-1 text-xl font-extrabold text-ink">{detail?.totalOrders ?? customerSummary.totalOrders}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-sunken/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Total Spent</p>
            <p className="mt-1 text-xl font-extrabold text-accent">
              ${Number(detail?.totalSpent ?? customerSummary.totalSpent).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-sunken/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Active Stamps</p>
            <p className="mt-1 text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {currentStamps} <span className="text-xs font-medium text-ink-faint">({currentPoints} pts)</span>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-sunken/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Lucky Tickets</p>
            <p className="mt-1 text-xl font-extrabold text-amber-600 dark:text-amber-400">
              🎟️ {currentTickets}
            </p>
          </div>
        </div>

        {/* Delivery Address if available */}
        {(customerSummary.building || customerSummary.roomNumber) && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-sunken/50 p-2.5 text-xs font-semibold text-ink">
            <MapPin className="size-4 text-accent shrink-0" />
            <span>
              Saved Address: {customerSummary.building ? `Building ${customerSummary.building}` : ''}
              {customerSummary.roomNumber ? `, Room ${customerSummary.roomNumber}` : ''}
            </span>
          </div>
        )}
      </Card>

      {/* Action Sections: 2-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Trust Tier Switch & Stamp Adjuster */}
        <div className="space-y-6 lg:col-span-6">
          {/* Trust Tier Control Card */}
          <Card padding="lg" className="border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" />
                <h4 className="font-bold text-ink">Trust Tier Control</h4>
              </div>
              <Badge variant={isGold ? 'success' : 'default'}>
                {isGold ? '⭐ Gold Trusted' : 'Standard'}
              </Badge>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-surface-sunken/50 p-3 text-xs leading-relaxed text-ink-soft">
                {isGold ? (
                  <p>
                    <strong className="text-ink">Gold Tier Active:</strong> Customer is allowed to pay with{' '}
                    <strong className="text-accent">Cash on Delivery</strong>. They receive bonus Lucky Draw tickets
                    and orders are immediately confirmed without waiting for KHQR verification.
                  </p>
                ) : (
                  <p>
                    <strong className="text-ink">Standard Tier Active:</strong> Customer is required to pay upfront
                    using <strong className="text-ink">KHQR Payment</strong> before kitchen preparation starts.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="trust-notes" className="block text-xs font-bold uppercase text-ink mb-1.5">
                  Manager Trust Notes / Room Info
                </label>
                <textarea
                  id="trust-notes"
                  rows={2}
                  value={trustNotes}
                  onChange={(e) => setTrustNotes(e.target.value)}
                  placeholder="e.g. Neighbor in Arakawa block A 1110, trusted regular customer."
                  className="w-full rounded-xl border border-border bg-surface p-3 text-xs font-medium text-ink outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isGold ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="md"
                    loading={savingTier}
                    onClick={() => handleToggleTier('standard')}
                    className="flex-1 gap-1.5 font-bold text-xs"
                  >
                    <Lock className="size-3.5" />
                    🔒 Demote to Standard (Require KHQR)
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    loading={savingTier}
                    onClick={() => handleToggleTier('gold')}
                    className="flex-1 gap-1.5 font-bold text-xs bg-amber-500 hover:bg-amber-600 text-white border-0"
                  >
                    <Star className="size-3.5 fill-current" />
                    ⭐ Promote to Gold (Trust Cash)
                  </Button>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  loading={savingTier}
                  onClick={handleSaveNotes}
                  className="text-xs font-semibold"
                >
                  <Save className="size-3.5" />
                  Save Notes
                </Button>
              </div>
            </div>
          </Card>

          {/* Stamps Adjuster Card */}
          <Card padding="lg" className="border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Coins className="size-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="font-bold text-ink">Stamp &amp; Points Adjuster</h4>
              </div>
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                {currentStamps} stamps ({currentPoints} pts)
              </span>
            </div>

            <div className="mt-4 space-y-4">
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
                  <label htmlFor="custom-delta" className="block text-xs font-bold text-ink mb-1">
                    Custom Delta (Points)
                  </label>
                  <input
                    id="custom-delta"
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
                  <label htmlFor="reason-select" className="block text-xs font-bold text-ink mb-1">
                    Reason <span className="text-danger">*</span>
                  </label>
                  <select
                    id="reason-select"
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
                    <span className="text-ink-soft">Balance change preview:</span>
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
          </Card>

          {/* Lucky Tickets Adjuster Card */}
          <Card padding="lg" className="border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="size-4 text-amber-500" />
                <h4 className="font-bold text-ink">Lucky Draw Tickets</h4>
              </div>
              <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                🎟️ {currentTickets} tickets
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-soft">
                Adjust tickets for customer appreciation or compensation:
              </p>

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
          </Card>
        </div>

        {/* Right Column: Recent Order History */}
        <div className="space-y-6 lg:col-span-6">
          <Card padding="lg" className="border-border bg-surface h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="size-4 text-accent" />
                <h4 className="font-bold text-ink">Recent Order History</h4>
              </div>
              <span className="text-xs font-semibold text-ink-soft">
                {detail?.orders ? `${detail.orders.length} recent orders` : 'Loading...'}
              </span>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto max-h-[600px] space-y-3 pr-1">
              {loading && !detail ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : !detail?.orders || detail.orders.length === 0 ? (
                <div className="py-12 text-center">
                  <Package className="mx-auto size-10 text-ink-faint" />
                  <p className="mt-2 text-sm font-bold text-ink">No recent orders found</p>
                  <p className="text-xs text-ink-soft">Orders will show up here once placed.</p>
                </div>
              ) : (
                detail.orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-border bg-surface-sunken/30 p-3.5 transition-all hover:bg-surface-sunken/60"
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
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
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

                      <div className="text-right">
                        <span className="text-sm font-extrabold text-ink">
                          ${Number(order.totalAmount).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Order Items Preview */}
                    {order.items && order.items.length > 0 && (
                      <div className="mt-2.5 border-t border-border/50 pt-2 space-y-1">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs text-ink-soft"
                          >
                            <span className="truncate">
                              <strong className="text-ink font-semibold">{item.quantity}x</strong>{' '}
                              {item.menuItem?.name || 'Menu Item'}
                              {item.modifiers ? (
                                <span className="text-[10px] text-ink-faint italic ml-1">({item.modifiers})</span>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
