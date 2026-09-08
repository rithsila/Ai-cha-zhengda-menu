import { useEffect, useRef, useState } from 'react';
import {
  Dices,
  Gift,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Ticket,
  Trash2,
  Trophy,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Badge, Button, Card, CustomSelect, useToast } from '../ui';
import { VerifyGiftClaimModal } from './VerifyGiftClaimModal';
import type { CustomersResponse, PrizeClaimItem, SystemConfigItem } from './types';

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

export function LuckyDrawManagement() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyInitialCode, setVerifyInitialCode] = useState('');

  // Stats from customer CRM
  const [summary, setSummary] = useState<CustomersResponse['summary'] | null>(null);

  // Configuration states
  const [luckyDrawEnabled, setLuckyDrawEnabled] = useState<boolean>(true);
  const [luckyTicketsPerGoldOrder, setLuckyTicketsPerGoldOrder] = useState<number>(2);
  const [luckyTicketsPerStandardOrder, setLuckyTicketsPerStandardOrder] = useState<number>(1);
  const [luckyTicketsCostPerSpin, setLuckyTicketsCostPerSpin] = useState<number>(5);
  const [prizes, setPrizes] = useState<LuckyWheelPrizeItem[]>(DEFAULT_LUCKY_PRIZES);

  // Claims list and filtering
  const [claims, setClaims] = useState<PrizeClaimItem[]>([]);
  const [claimsFilter, setClaimsFilter] = useState<'all' | 'pending' | 'claimed'>('all');
  const [claimsSearch, setClaimsSearch] = useState('');
  const [loadingClaims, setLoadingClaims] = useState(false);

  // Raffle Draw states
  const [rafflePrizeName, setRafflePrizeName] = useState('Monthly Grand Prize');
  const [raffleTierFilter, setRaffleTierFilter] = useState<'all' | 'gold' | 'standard'>('all');
  const [drawingRaffle, setDrawingRaffle] = useState(false);
  const [raffleWinnerModalOpen, setRaffleWinnerModalOpen] = useState(false);
  const [raffleWinnerData, setRaffleWinnerData] = useState<any>(null);

  const savePrizesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDrawWinner = async () => {
    if (!rafflePrizeName.trim()) {
      toast({
        title: 'Prize name required',
        description: 'Please enter a prize name for the raffle.',
        variant: 'error',
      });
      return;
    }
    setDrawingRaffle(true);
    try {
      const res = await apiFetch<any>('/api/lucky-draw/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizeName: rafflePrizeName.trim(),
          tierFilter: raffleTierFilter,
        }),
      });
      setRaffleWinnerData(res);
      setRaffleWinnerModalOpen(true);
      fetchClaims();
      toast({
        title: '🎉 Winner Drawn!',
        description: `${res.winner.contactName || res.winner.firstName || 'Customer'} won ${res.prizeName || 'the prize'}!`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: 'Could not draw winner',
        description: err.message || 'No eligible participants found with tickets.',
        variant: 'error',
      });
    } finally {
      setDrawingRaffle(false);
    }
  };

  const fetchClaims = async () => {
    setLoadingClaims(true);
    try {
      const data = await apiFetch<PrizeClaimItem[]>('/api/lucky-draw/claims?limit=50');
      setClaims(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoadingClaims(false);
    }
  };

  const loadData = () => {
    setLoading(true);
    fetchClaims();

    Promise.all([
      apiFetch<SystemConfigItem[]>('/api/config'),
      apiFetch<CustomersResponse>('/api/customers?limit=1').catch(() => null),
    ])
      .then(([configs, custRes]) => {
        if (custRes?.summary) {
          setSummary(custRes.summary);
        }

        const configMap = new Map(configs.map((c) => [c.key, c.value]));
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
        toast({
          title: "Couldn't load lucky draw configuration",
          description: 'Using default configuration values.',
          variant: 'error',
        });
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, []);


  // Auto-save prizes to API
  const savePrizesToApi = async (prizeList: LuckyWheelPrizeItem[], silent = false) => {
    try {
      await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'luckyWheelPrizes',
          value: JSON.stringify(prizeList),
        }),
      });

      if (!silent) {
        toast({
          title: 'Prize segments saved',
          variant: 'success',
        });
      }
    } catch (err: any) {
      toast({
        title: "Couldn't save prize segments",
        description: err.message || 'Please try again.',
        variant: 'error',
      });
    }
  };

  const handlePrizeChange = (index: number, field: keyof LuckyWheelPrizeItem, value: any) => {
    setPrizes((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (savePrizesTimer.current) clearTimeout(savePrizesTimer.current);
      savePrizesTimer.current = setTimeout(() => {
        savePrizesToApi(next, true);
      }, 600);

      return next;
    });
  };

  const handleAddPrize = () => {
    if (prizes.length >= 12) {
      toast({
        title: 'Limit reached',
        description: 'Maximum 12 prize segments allowed on the wheel.',
        variant: 'info',
      });
      return;
    }
    const color = PRESET_COLORS[prizes.length % PRESET_COLORS.length];
    const newPrize: LuckyWheelPrizeItem = {
      id: `p_${Date.now()}`,
      label: '+10 Pts',
      name: 'Bonus Loyalty Reward',
      icon: '🎁',
      color,
      type: 'points',
      value: 10,
      weight: 10,
    };
    const next = [...prizes, newPrize];
    setPrizes(next);
    savePrizesToApi(next);
  };

  const handleRemovePrize = (index: number) => {
    if (prizes.length <= 2) {
      toast({
        title: 'Minimum segments required',
        description: 'A minimum of 2 prize segments is required for the wheel.',
        variant: 'info',
      });
      return;
    }
    const next = prizes.filter((_, i) => i !== index);
    setPrizes(next);
    savePrizesToApi(next);
  };

  const handleResetPrizes = () => {
    setPrizes(DEFAULT_LUCKY_PRIZES);
    savePrizesToApi(DEFAULT_LUCKY_PRIZES);
    toast({
      title: 'Reset to default prizes',
      description: 'Default 8 prize segments restored and saved.',
      variant: 'info',
    });
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Lucky Draw Title & Gift Verification */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Dices className="size-5 text-amber-500" />
            Lucky Draw
            <Badge variant={luckyDrawEnabled ? 'success' : 'neutral'} className="text-[10px] uppercase font-mono">
              {luckyDrawEnabled ? 'Active' : 'Disabled'}
            </Badge>
          </h3>
          <p className="text-xs text-ink-soft">
            Manage raffle tickets, wheel prize segments, and customer gift claims
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setVerifyInitialCode('');
              setVerifyModalOpen(true);
            }}
            className="h-10 gap-2 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs border-0"
          >
            <Gift className="size-4" />
            🎁 Verify / Redeem Gift
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card padding="md" className="border-amber-500/30 bg-amber-500/5 shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Active Tickets
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-amber-600 dark:text-amber-400">
                🎟️ {summary ? summary.totalLuckyTickets : '—'}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-none bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Ticket className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">In circulation pool</p>
        </Card>

        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Gold Ticket Rate
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-ink">
                +{luckyTicketsPerGoldOrder} / order
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-none bg-surface-sunken text-ink-soft">
              <Sparkles className="size-4 text-amber-500" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Per qualifying order</p>
        </Card>

        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Standard Ticket Rate
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-ink">
                +{luckyTicketsPerStandardOrder} / order
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-none bg-surface-sunken text-ink-soft">
              <Ticket className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Per qualifying order</p>
        </Card>

        <Card padding="md" className="border-border bg-surface shadow-xs">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                Spin Cost
              </p>
              <p className="mt-1.5 text-2xl font-black tabular-nums text-ink">
                {luckyTicketsCostPerSpin} Tickets
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-none bg-surface-sunken text-ink-soft">
              <Dices className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">Per 1 lucky draw draw</p>
        </Card>
      </div>

      {/* Rules & Configurations Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Manager Raffle Draw */}
        <div className="space-y-6 lg:col-span-5">
          {/* Manager Raffle Draw */}
          <Card padding="lg" className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-surface to-surface shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <Trophy className="size-4 text-amber-500" />
                <span>Manager Lucky Raffle Draw</span>
              </div>
              <Badge variant="neutral" className="text-[10px] font-mono">
                {summary?.totalLuckyTickets ?? 0} Tickets Pool
              </Badge>
            </div>

            <p className="text-xs text-ink-soft">
              Conduct a live raffle draw among customers holding lucky tickets. Each ticket gives one entry.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                  Raffle Prize Name
                </label>
                <input
                  type="text"
                  value={rafflePrizeName}
                  onChange={(e) => setRafflePrizeName(e.target.value)}
                  placeholder="e.g. Grand Prize: Mystery Blind Box Set"
                  className="h-9 w-full rounded-none border border-border bg-surface px-3 text-xs font-bold text-ink outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                  Eligible Participants
                </label>
                <CustomSelect<'all' | 'gold' | 'standard'>
                  value={raffleTierFilter}
                  onChange={(val) => setRaffleTierFilter(val)}
                  options={[
                    { value: 'all', label: 'All Customers with Tickets' },
                    { value: 'gold', label: 'Gold VIP Members Only' },
                    { value: 'standard', label: 'Standard Customers Only' },
                  ]}
                  size="md"
                />
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={handleDrawWinner}
                loading={drawingRaffle}
                disabled={drawingRaffle || (summary?.totalLuckyTickets ?? 0) <= 0}
                className="w-full h-10 gap-2 font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white shadow-xs border-0"
              >
                <Dices className="size-4" />
                <span>Draw Random Winner</span>
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Wheel Prize Segments */}
        <div className="space-y-6 lg:col-span-7">
          <Card padding="lg" className="border-border bg-surface shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-ink">
                <Trophy className="size-4 text-amber-500" />
                <span>Spin Wheel Prize Segments ({prizes.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={handleResetPrizes}
                  className="h-8 gap-1 text-[11px] text-ink-soft hover:text-ink"
                  title="Reset to default 8 segments"
                >
                  <RotateCcw className="size-3.5" />
                  Reset Defaults
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleAddPrize}
                  className="h-8 gap-1 text-[11px] font-bold"
                  disabled={prizes.length >= 12}
                >
                  <Plus className="size-3.5" />
                  Add Prize
                </Button>
              </div>
            </div>

            <p className="text-xs text-ink-soft">
              Configure each wedge of the Telegram Mini App spin wheel. Weight determines probability. Changes auto-save.
            </p>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {prizes.map((p, idx) => (
                <div
                  key={p.id}
                  className="rounded-none border border-border bg-surface-soft/40 p-3.5 transition-all hover:border-accent/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-none bg-surface-sunken text-xs font-bold text-ink-soft">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={p.icon}
                        onChange={(e) => handlePrizeChange(idx, 'icon', e.target.value)}
                        placeholder="Icon"
                        title="Emoji or icon"
                        className="size-8 text-center rounded-none border border-border bg-surface text-base outline-none focus:border-accent"
                      />
                      <input
                        type="text"
                        value={p.label}
                        onChange={(e) => handlePrizeChange(idx, 'label', e.target.value)}
                        placeholder="Wheel Label (e.g. +10 Pts)"
                        title="Short text displayed on the wheel wedge"
                        className="h-8 w-28 rounded-none border border-border bg-surface px-2 text-xs font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={p.color}
                        onChange={(e) => handlePrizeChange(idx, 'color', e.target.value)}
                        title="Wedge background color"
                        className="size-7 cursor-pointer rounded-none border border-border bg-surface p-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePrize(idx)}
                        disabled={prizes.length <= 2}
                        aria-label={`Remove prize segment ${idx + 1}`}
                        className="flex size-7 items-center justify-center rounded-none text-ink-faint hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                        Type
                      </label>
                      <CustomSelect<'points' | 'tickets' | 'item'>
                        value={p.type}
                        onChange={(val) => handlePrizeChange(idx, 'type', val)}
                        options={[
                          { value: 'points', label: 'Points' },
                          { value: 'tickets', label: 'Tickets' },
                          { value: 'item', label: 'Physical Item' },
                        ]}
                        size="sm"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                        Amount
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={p.value}
                        onChange={(e) => handlePrizeChange(idx, 'value', Number(e.target.value) || 0)}
                        placeholder="0"
                        className="h-8 w-full rounded-none border border-border bg-surface px-2 text-xs font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                        Weight
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={p.weight}
                        onChange={(e) => handlePrizeChange(idx, 'weight', Number(e.target.value) || 1)}
                        placeholder="10"
                        title="Probability weight relative to total sum of weights"
                        className="h-8 w-full rounded-none border border-border bg-surface px-2 text-xs font-bold text-ink outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => handlePrizeChange(idx, 'name', e.target.value)}
                    placeholder="Full prize description (e.g. Zhengda Fried Chicken Voucher)"
                    className="h-7 w-full rounded-none border border-border bg-surface px-2 text-[11px] text-ink-soft outline-none focus:border-accent"
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Customer Gift Claims & Redemptions Log */}
      <Card padding="lg" className="border-border bg-surface shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h4 className="font-extrabold text-base text-ink flex items-center gap-2">
              <Gift className="size-4 text-amber-500" />
              Gift Claims &amp; Redemption Log
              {claims.length > 0 && (
                <Badge variant="neutral" className="text-[10px] font-mono">
                  {claims.length}
                </Badge>
              )}
            </h4>
            <p className="text-xs text-ink-soft">
              Track won items, customer redemption status, and staff handovers
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-surface-sunken p-1 rounded-none border border-border text-xs font-bold">
              <button
                type="button"
                onClick={() => setClaimsFilter('all')}
                className={`px-2.5 py-1 rounded-none transition-colors ${
                  claimsFilter === 'all' ? 'bg-accent text-on-accent' : 'text-ink-soft hover:text-ink'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setClaimsFilter('pending')}
                className={`px-2.5 py-1 rounded-none transition-colors ${
                  claimsFilter === 'pending' ? 'bg-emerald-600 text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => setClaimsFilter('claimed')}
                className={`px-2.5 py-1 rounded-none transition-colors ${
                  claimsFilter === 'claimed' ? 'bg-ink/10 text-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                Claimed
              </button>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                placeholder="Search code, customer..."
                value={claimsSearch}
                onChange={(e) => setClaimsSearch(e.target.value)}
                className="h-8 pl-8 pr-3 rounded-none border border-border bg-surface text-xs text-ink outline-none focus:border-accent w-44"
              />
            </div>

            <Button
              variant="secondary"
              size="md"
              onClick={fetchClaims}
              loading={loadingClaims}
              className="h-8 px-2.5 text-xs font-bold gap-1"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>

        {(() => {
          const filtered = claims.filter((c) => {
            if (claimsFilter === 'pending' && c.status !== 'pending') return false;
            if (claimsFilter === 'claimed' && c.status !== 'claimed') return false;
            if (claimsSearch.trim()) {
              const q = claimsSearch.toLowerCase();
              const matchCode = c.code.toLowerCase().includes(q);
              const matchPrize = c.prizeName.toLowerCase().includes(q);
              const matchName = (
                (c.user?.contactName || '') +
                (c.user?.firstName || '') +
                (c.user?.phoneNumber || '')
              )
                .toLowerCase()
                .includes(q);
              return matchCode || matchPrize || matchName;
            }
            return true;
          });

          if (claims.length === 0 && !loadingClaims) {
            return (
              <div className="py-10 text-center text-ink-soft">
                <Gift className="size-8 mx-auto text-ink-faint mb-2" />
                <p className="font-bold text-sm text-ink">No prize claims recorded yet</p>
                <p className="text-xs text-ink-faint">
                  When customers spin items on the wheel or win manager raffles, claims appear here.
                </p>
              </div>
            );
          }

          if (filtered.length === 0) {
            return (
              <div className="py-8 text-center text-ink-soft text-xs">
                No claims match your filter or search.
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] font-bold uppercase text-ink-faint">
                    <th className="pb-2.5">Claim Code</th>
                    <th className="pb-2.5">Prize Item</th>
                    <th className="pb-2.5">Recipient Customer</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5">Won Date</th>
                    <th className="pb-2.5">Handover Details</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {filtered.map((claim) => {
                    const isPending = claim.status === 'pending';
                    const isClaimed = claim.status === 'claimed';
                    const isExpired = claim.status === 'expired';

                    const custName =
                      claim.user?.contactName ||
                      [claim.user?.firstName, claim.user?.lastName].filter(Boolean).join(' ') ||
                      `Customer #${claim.telegramUserId}`;

                    return (
                      <tr key={claim.id} className="hover:bg-surface-sunken/40 transition-colors">
                        <td className="py-3 font-mono font-bold text-ink">
                          <span className="bg-surface-sunken px-2 py-0.5 rounded border border-border">
                            {claim.code}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{claim.prizeIcon || '🎁'}</span>
                            <div>
                              <p className="font-bold text-ink truncate max-w-[180px]">{claim.prizeName}</p>
                              <p className="text-[10px] text-ink-faint capitalize">
                                {claim.source === 'manager_draw' ? '🏆 Raffle Draw' : '🎲 Wheel Spin'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div>
                            <p className="font-bold text-ink">{custName}</p>
                            <p className="text-[10px] text-ink-faint">
                              {claim.user?.phoneNumber || ''}{' '}
                              {claim.user?.building ? `(Bldg ${claim.user.building})` : ''}
                            </p>
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={isPending ? 'success' : isClaimed ? 'neutral' : 'danger'}
                            className="text-[10px] uppercase font-bold"
                          >
                            {claim.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-ink-soft text-[11px]">
                          {new Date(claim.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-[11px] text-ink-soft">
                          {isClaimed ? (
                            <div>
                              <span className="font-semibold text-success block">✓ Handed Over</span>
                              <span className="text-ink-faint">
                                {claim.claimedAt ? new Date(claim.claimedAt).toLocaleDateString() : ''}
                                {claim.claimedByStaffName ? ` (${claim.claimedByStaffName})` : ''}
                              </span>
                            </div>
                          ) : isExpired ? (
                            <span className="text-danger font-semibold">Expired</span>
                          ) : (
                            <span className="text-ink-faint">
                              Expires {claim.expiresAt ? new Date(claim.expiresAt).toLocaleDateString() : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            variant={isPending ? 'primary' : 'ghost'}
                            size="md"
                            onClick={() => {
                              setVerifyInitialCode(claim.code);
                              setVerifyModalOpen(true);
                            }}
                            className="h-7 px-2.5 text-xs font-bold"
                          >
                            {isPending ? 'Hand Over' : 'View'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Card>

      {/* Staff Verify & Redeem Gift Modal */}
      <VerifyGiftClaimModal
        isOpen={verifyModalOpen}
        initialCode={verifyInitialCode}
        onClose={() => {
          setVerifyModalOpen(false);
          fetchClaims();
        }}
        onClaimRedeemed={() => {
          fetchClaims();
        }}
      />

      {/* Raffle Winner Celebration Modal */}
      {raffleWinnerModalOpen && raffleWinnerData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-none border border-amber-500/40 bg-surface shadow-2xl p-6 text-center space-y-4">
            <div className="size-16 mx-auto rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-3xl shadow-inner">
              🏆
            </div>

            <div>
              <Badge variant="neutral" className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
                🎉 Lucky Raffle Winner Drawn!
              </Badge>
              <h3 className="mt-2 text-xl font-black text-ink">
                {raffleWinnerData.winner.contactName ||
                  [raffleWinnerData.winner.firstName, raffleWinnerData.winner.lastName].filter(Boolean).join(' ') ||
                  `Customer #${raffleWinnerData.winner.telegramUserId}`}
              </h3>
              <p className="text-xs text-ink-soft mt-0.5">
                {raffleWinnerData.winner.phoneNumber || 'No phone'}
                {raffleWinnerData.winner.tier === 'gold' && ' • ⭐ Gold VIP'}
              </p>
            </div>

            <div className="rounded-none border border-border bg-surface-sunken p-3 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-soft">Prize Won:</span>
                <span className="font-bold text-ink">{raffleWinnerData.prizeName || 'Grand Prize'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Claim Code:</span>
                <span className="font-mono font-black text-amber-600 dark:text-amber-400 bg-surface px-2 py-0.5 border border-border">
                  {raffleWinnerData.claimCode || 'LUCKY-WINNER'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Participant's Tickets:</span>
                <span className="font-bold text-ink">🎟️ {raffleWinnerData.winner.luckyTickets} tickets</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Pool Competed In:</span>
                <span className="text-ink-soft">{raffleWinnerData.totalParticipants} participants ({raffleWinnerData.totalTickets} tickets)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setRaffleWinnerModalOpen(false)}
                className="w-full text-xs font-bold"
              >
                Close
              </Button>
              {raffleWinnerData.claimCode && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    setRaffleWinnerModalOpen(false);
                    setVerifyInitialCode(raffleWinnerData.claimCode);
                    setVerifyModalOpen(true);
                  }}
                  className="w-full text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                >
                  Verify / Hand Over
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
