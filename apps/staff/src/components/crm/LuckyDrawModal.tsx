import { useState } from 'react';
import {
  Dices,
  Phone,
  RotateCcw,
  Sparkles,
  Ticket,
  Trophy,
  User,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Badge, Button, Card, useToast } from '../ui';
import { ConfettiEffect } from './ConfettiEffect';
import type { LuckyDrawResult } from './types';

type LuckyDrawModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer?: (telegramUserId: string) => void;
  summaryData?: {
    totalCustomers: number;
    goldCount: number;
    standardCount: number;
    totalLuckyTickets: number;
  };
};

export function LuckyDrawModal({
  isOpen,
  onClose,
  onSelectCustomer,
  summaryData,
}: LuckyDrawModalProps) {
  const { toast } = useToast();
  const [tierFilter, setTierFilter] = useState<'all' | 'gold' | 'standard'>('all');
  const [prizeName, setPrizeName] = useState<string>('Free Drink & Snack Combo');
  const [drawing, setDrawing] = useState(false);
  const [shuffleText, setShuffleText] = useState('🎲 Shuffling tickets...');
  const [result, setResult] = useState<LuckyDrawResult | null>(null);

  if (!isOpen) return null;

  const handleDraw = async () => {
    setDrawing(true);
    setResult(null);

    // Fun spinning / raffle shuffle animation
    const messages = [
      '🎟️ Scanning eligible tickets...',
      '🌀 Generating random entropy...',
      '✨ Picking a lucky ticket...',
      '🏆 Selecting the winner...',
    ];
    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % messages.length;
      setShuffleText(messages[msgIdx]);
    }, 350);

    try {
      // Small artificial delay for suspense and animation
      const [res] = await Promise.all([
        apiFetch<LuckyDrawResult>('/api/lucky-draw/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prizeName: prizeName.trim() || undefined,
            tierFilter,
          }),
        }),
        new Promise((resolve) => setTimeout(resolve, 1400)),
      ]);

      clearInterval(interval);
      setResult(res);
      toast({
        title: '🎉 Winner Drawn!',
        description: `${res.winner.contactName || res.winner.firstName || 'Customer'} won the draw!`,
        variant: 'success',
      });
    } catch (err: any) {
      clearInterval(interval);
      toast({
        title: "Couldn't complete Lucky Draw",
        description: err.message || 'No eligible customers with tickets found in selected tier.',
        variant: 'error',
      });
    } finally {
      setDrawing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
  };

  const getDisplayName = (winner: LuckyDrawResult['winner']) => {
    return (
      winner.contactName ||
      [winner.firstName, winner.lastName].filter(Boolean).join(' ') ||
      (winner.username ? `@${winner.username}` : `Customer #${winner.telegramUserId}`)
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lucky-draw-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <Card
        padding="lg"
        className="relative z-10 w-full max-w-lg overflow-hidden border-border bg-surface shadow-2xl"
      >
        {result && <ConfettiEffect active={true} durationMs={4500} />}

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Dices className="size-5" />
            </div>
            <div>
              <h3 id="lucky-draw-title" className="text-base font-bold text-ink flex items-center gap-2">
                Lucky Draw Spinner
                <Badge variant="neutral" className="text-[10px] uppercase font-mono">
                  Live Event
                </Badge>
              </h3>
              <p className="text-xs text-ink-soft">
                Pick a random winner from active ticket holders
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

        {/* Modal Body */}
        <div className="pt-5 space-y-5">
          {!result && !drawing && (
            <>
              {/* Pool Info */}
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                    <Ticket className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-ink">Total Active Tickets in Circulation</p>
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400">
                      {summaryData?.totalLuckyTickets ?? '—'} 🎟️
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-ink-soft">Total Customers</p>
                  <p className="text-sm font-bold text-ink">{summaryData?.totalCustomers ?? 0}</p>
                </div>
              </div>

              {/* Prize Name Input */}
              <div>
                <label htmlFor="prize-name" className="block text-xs font-bold uppercase text-ink mb-1.5">
                  Prize / Reward Title
                </label>
                <input
                  id="prize-name"
                  type="text"
                  placeholder="e.g. Free Passion Fruit Milk Tea + Fries"
                  value={prizeName}
                  onChange={(e) => setPrizeName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm font-semibold text-ink outline-none focus:border-accent"
                />
              </div>

              {/* Tier Filter Selector */}
              <div>
                <label className="block text-xs font-bold uppercase text-ink mb-2">
                  Eligible Tier Filter
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTierFilter('all')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                      tierFilter === 'all'
                        ? 'border-accent bg-accent text-on-accent shadow-sm'
                        : 'border-border bg-surface-sunken/40 text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="text-xs font-bold">All Customers</span>
                    <span className="text-[10px] opacity-80">
                      {summaryData ? `(${summaryData.totalCustomers})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTierFilter('gold')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                      tierFilter === 'gold'
                        ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                        : 'border-border bg-surface-sunken/40 text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="text-xs font-bold">Gold</span>
                    <span className="text-[10px] opacity-80">
                      {summaryData ? `(${summaryData.goldCount})` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTierFilter('standard')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all ${
                      tierFilter === 'standard'
                        ? 'border-slate-600 bg-slate-700 text-white shadow-sm'
                        : 'border-border bg-surface-sunken/40 text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    <span className="text-xs font-bold">Standard</span>
                    <span className="text-[10px] opacity-80">
                      {summaryData ? `(${summaryData.standardCount})` : ''}
                    </span>
                  </button>
                </div>
              </div>

              {/* Draw Action */}
              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleDraw}
                  className="w-full h-12 text-sm font-bold gap-2 bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white border-0 shadow-lg shadow-amber-500/20"
                >
                  <Dices className="size-5" />
                  Spin / Draw Random Winner
                </Button>
              </div>
            </>
          )}

          {/* Spinner Animation */}
          {drawing && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative flex size-24 items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                <Dices className="size-10 text-amber-500 animate-bounce" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-ink animate-pulse">{shuffleText}</p>
                <p className="text-xs text-ink-soft mt-1">Weighted by customer ticket count</p>
              </div>
            </div>
          )}

          {/* Winner Display Card */}
          {result && !drawing && (
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-gradient-to-b from-amber-500/10 via-surface to-surface p-6 text-center shadow-lg">
                <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md mb-3">
                  <Trophy className="size-7" />
                </div>

                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  🎉 Lucky Draw Champion! 🎉
                </p>

                <h4 className="mt-1 text-2xl font-black text-ink">
                  {getDisplayName(result.winner)}
                </h4>

                {result.winner.username && (
                  <p className="text-xs font-mono text-ink-soft">@{result.winner.username}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                      result.winner.tier === 'gold'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-surface-sunken text-ink-soft border border-border'
                    }`}
                  >
                    {result.winner.tier === 'gold' ? (
                      'Gold Member'
                    ) : (
                      'Standard Member'
                    )}
                  </span>

                  {result.winner.phoneNumber && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-ink">
                      <Phone className="size-3 text-accent" />
                      {result.winner.phoneNumber}
                    </span>
                  )}

                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                    <Ticket className="size-3" />
                    Held {result.winner.luckyTickets} tickets
                  </span>
                </div>

                {result.prizeName && (
                  <div className="mt-4 rounded-xl bg-surface-sunken/60 p-3 border border-border space-y-2">
                    <div>
                      <p className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">Prize Won</p>
                      <p className="text-sm font-bold text-accent flex items-center justify-center gap-1.5 mt-0.5">
                        <Sparkles className="size-4" />
                        {result.prizeName}
                      </p>
                    </div>
                    {result.claimCode && (
                      <div className="pt-2 border-t border-border/60">
                        <p className="text-[10px] uppercase font-bold text-ink-faint">Generated Claim Voucher Code</p>
                        <p className="mt-0.5 font-mono text-sm font-black text-amber-600 dark:text-amber-400 bg-surface px-2.5 py-1 rounded-lg border border-amber-500/30 inline-block">
                          {result.claimCode}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <p className="mt-3 text-[11px] text-ink-faint">
                  Drawn from {result.totalParticipants} participants with {result.totalTickets} total tickets in pool.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleReset}
                  className="flex-1 gap-1.5 font-semibold"
                >
                  <RotateCcw className="size-4" />
                  Draw Again
                </Button>
                {onSelectCustomer && (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => {
                      onSelectCustomer(result.winner.telegramUserId);
                      onClose();
                    }}
                    className="flex-1 gap-1.5 font-bold"
                  >
                    <User className="size-4" />
                    View Customer Profile
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
