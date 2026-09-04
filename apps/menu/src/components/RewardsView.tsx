import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, ClockCounterClockwise, Sparkle, Check } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { loginAsDevCustomer, clearWebLoginToken } from '../utils/telegramUser';
import { SignInPrompt } from './SignInPrompt';
import { RewardCard } from './RewardCard';
import { CustomerLuckyWheelModal, type LuckyPrize } from './CustomerLuckyWheelModal';
import { CustomerPrizeModal, type CustomerPrizeClaim } from './CustomerPrizeModal';
import { LuckyWheelIcon } from './ui/LuckyWheelIcon';

const DEFAULT_POINTS_PER_DOLLAR = 100;

/** Reads one numeric config row, falling back when it is missing or not a number. */
function readConfigNumber(rows: { key: string; value: string }[], key: string, fallback: number): number {
  const n = Number(rows.find(r => r.key === key)?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RewardsViewProps {
  onBrowseMenu?: () => void;
  forceOpenLuckyDraw?: boolean;
  onCloseLuckyDraw?: () => void;
}

export function RewardsView({ onBrowseMenu, forceOpenLuckyDraw, onCloseLuckyDraw }: RewardsViewProps) {
  const { t } = useTranslation();
  // Points belong to one account. A guest has none to show.
  const signedIn = hasIdentity();
  const [points, setPoints] = useState<number | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [claimOrders, setClaimOrders] = useState<any[]>([]);
  const [paidOrderCount, setPaidOrderCount] = useState(0);
  const [goldThreshold, setGoldThreshold] = useState(3);
  const [pointsPerDollar, setPointsPerDollar] = useState(DEFAULT_POINTS_PER_DOLLAR);
  const [luckyDrawOpen, setLuckyDrawOpen] = useState(false);
  const [luckyDrawEnabled, setLuckyDrawEnabled] = useState(true);
  const [luckyCostPerSpin, setLuckyCostPerSpin] = useState(5);
  const [luckyPrizes, setLuckyPrizes] = useState<LuckyPrize[]>([]);
  const [userPrizes, setUserPrizes] = useState<CustomerPrizeClaim[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<CustomerPrizeClaim | null>(null);
  const [giftFilter, setGiftFilter] = useState<'all' | 'pending' | 'claimed'>('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchUserPrizes = async () => {
    try {
      const res = await apiFetch('/api/me/prizes');
      if (res.ok) {
        const data = await res.json();
        setUserPrizes(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch user prize claims:', err);
    }
  };

  useEffect(() => {
    if (forceOpenLuckyDraw) {
      setLuckyDrawOpen(true);
    }
  }, [forceOpenLuckyDraw]);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const [userRes, ordersRes, cfgRes, luckyRes, prizesRes] = await Promise.all([
          apiFetch(ME.profile()),
          apiFetch(ME.orders()),
          apiFetch('/api/config'),
          apiFetch('/api/lucky-draw/config'),
          apiFetch('/api/me/prizes'),
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          setUserProfile(user);
          setPoints(Number(user.loyaltyPoints) || 0);
        } else if (userRes.status === 401) {
          if (import.meta.env.DEV) {
            await loginAsDevCustomer({
              telegramUserId: 'dev_standard_user',
              firstName: 'Bob',
              lastName: 'Sok',
              tier: 'standard',
              loyaltyPoints: 20,
              luckyTickets: 5,
              phoneNumber: '+85598765432',
              building: 'B',
              roomNumber: '0512',
            });
            window.location.reload();
            return;
          }
          clearWebLoginToken();
          setLoading(false);
          return;
        } else {
          setFailed(true);
        }

        if (ordersRes.ok) {
          const orders = await ordersRes.json();
          const orderList = Array.isArray(orders) ? orders : [];
          const claims = orderList.filter(
            (o: any) => (o.pointsRedeemed ?? 0) > 0 || (o.discountApplied ?? 0) > 0
          );
          setClaimOrders(claims);
          const paidCount = orderList.filter(
            (o: any) => o.status === 'paid' || o.status === 'completed'
          ).length;
          setPaidOrderCount(paidCount);
        }

        if (cfgRes.ok) {
          const rows: { key: string; value: string }[] = await cfgRes.json();
          setPointsPerDollar(readConfigNumber(rows, 'pointsPerDollar', DEFAULT_POINTS_PER_DOLLAR));
          setGoldThreshold(readConfigNumber(rows, 'goldMinOrdersThreshold', 3));
        }

        if (luckyRes.ok) {
          const luckyData = await luckyRes.json();
          setLuckyDrawEnabled(luckyData.enabled !== false);
          if (luckyData.costPerSpin) setLuckyCostPerSpin(luckyData.costPerSpin);
          if (Array.isArray(luckyData.prizes)) setLuckyPrizes(luckyData.prizes);
        }

        if (prizesRes.ok) {
          const prizeList = await prizesRes.json();
          setUserPrizes(Array.isArray(prizeList) ? prizeList : []);
        }
      } catch (err) {
        console.error('Failed to fetch rewards data', err);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [signedIn]);

  const pointsPerStamp = Math.max(1, Math.round(pointsPerDollar / 10));

  if (!signedIn) {
    return (
      <SignInPrompt
        what={t('signInForRewards', 'Open the shop from our Telegram bot to collect stamps and earn free rewards.')}
        onBrowseMenu={onBrowseMenu}
      />
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-tg-hint animate-pulse">Loading rewards...</div>;
  }

  if (failed) {
    return <div className="p-8 text-center text-[#E53935]">Could not load your rewards.</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      {/* 10-Slot Stamp Reward Card with Membership Tier */}
      <RewardCard
        points={points ?? 0}
        pointsPerDollar={pointsPerDollar}
        tier={userProfile?.tier || 'standard'}
        orderCount={paidOrderCount}
        goldThreshold={goldThreshold}
      />

      {/* Clean Lucky Tickets Balance & Progress Card */}
      {luckyDrawEnabled && (
        <div
          onClick={() => setLuckyDrawOpen(true)}
          className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 hover:border-amber-500/30 transition-all cursor-pointer flex flex-col gap-2.5 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LuckyWheelIcon size={34} />
              <div>
                <span className="font-extrabold text-base text-tg-text block">
                  {t('luckyTickets', 'Lucky Tickets')}
                </span>
                <span className="text-xs text-tg-hint font-medium">
                  {userProfile?.luckyTickets || 0} / {luckyCostPerSpin} {t('ticketsForSpin', 'tickets for 1 spin')}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xl font-black text-amber-500 font-mono">
                {userProfile?.luckyTickets || 0} 🎟️
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-tg-hint/15 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-400 to-amber-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round(((userProfile?.luckyTickets || 0) / luckyCostPerSpin) * 100))}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-tg-hint">
            <span>
              {(userProfile?.luckyTickets || 0) >= luckyCostPerSpin ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  ✨ Tap to spin the wheel!
                </span>
              ) : (
                <span>
                  Collect {Math.max(0, luckyCostPerSpin - (userProfile?.luckyTickets || 0))} more tickets to spin
                </span>
              )}
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              Win Free Drinks &amp; Prizes
            </span>
          </div>
        </div>
      )}

      {/* 10-Stamp Reward Checkout Notice */}
      <div className="bg-brand-primary/10 rounded-2xl p-4 border border-brand-primary/20 flex gap-3">
        <div className="text-brand-primary flex-shrink-0 mt-0.5">
          <Sparkle size={22} weight="fill" />
        </div>
        <p className="text-sm text-tg-text">
          {t('stampRewardCheckoutHint', 'Collect 10 stamps to get a free item on your next order. Claim it directly at checkout!')}
        </p>
      </div>

      {/* My Won Gifts & Prizes Section (Only shown when customer has won gifts) */}
      {userPrizes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-lg flex items-center gap-2 text-tg-text">
              <Gift size={24} className="text-amber-500" weight="fill" />
              {t('myWonGifts', 'My Won Gifts')}
              <span className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                {userPrizes.length}
              </span>
            </h3>

            <div className="flex items-center gap-1 bg-tg-secondary-bg p-1 rounded-xl border border-tg-hint/15 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setGiftFilter('all')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  giftFilter === 'all' ? 'bg-brand-primary text-white' : 'text-tg-hint hover:text-tg-text'
                }`}
              >
                {t('all', 'All')}
              </button>
              <button
                type="button"
                onClick={() => setGiftFilter('pending')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  giftFilter === 'pending' ? 'bg-emerald-600 text-white' : 'text-tg-hint hover:text-tg-text'
                }`}
              >
                {t('available', 'Available')}
              </button>
              <button
                type="button"
                onClick={() => setGiftFilter('claimed')}
                className={`px-2 py-0.5 rounded-lg transition-colors ${
                  giftFilter === 'claimed' ? 'bg-tg-hint/20 text-tg-text' : 'text-tg-hint hover:text-tg-text'
                }`}
              >
                {t('claimed', 'Claimed')}
              </button>
            </div>
          </div>

          {(() => {
            const filteredPrizes = userPrizes.filter((p) => {
              if (giftFilter === 'pending') return p.status === 'pending';
              if (giftFilter === 'claimed') return p.status === 'claimed' || p.status === 'expired';
              return true;
            });

            if (filteredPrizes.length === 0) {
              return (
                <div className="text-center p-6 bg-tg-secondary-bg rounded-2xl text-tg-hint border border-tg-hint/10 text-xs">
                  No gifts found for selected filter.
                </div>
              );
            }

            return (
              <div className="grid gap-3">
                {filteredPrizes.map((prize) => {
                  const isPending = prize.status === 'pending';
                  const isClaimed = prize.status === 'claimed';
                  const isExpired = prize.status === 'expired';

                  return (
                    <div
                      key={prize.id}
                      onClick={() => setSelectedClaim(prize)}
                      className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 hover:border-amber-500/30 transition-all cursor-pointer flex flex-col gap-3 active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-2xl shrink-0 shadow-xs">
                            {prize.prizeIcon || '🎁'}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-tg-text truncate">
                              {prize.prizeName}
                            </h4>
                            <p className="text-xs text-tg-hint mt-0.5 flex items-center gap-1.5">
                              <span>{shortDate(prize.createdAt)}</span>
                              {prize.source === 'manager_draw' && (
                                <span className="font-medium text-amber-600 dark:text-amber-400">
                                  · 🏆 Raffle Win
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Status Pill */}
                        <div className="shrink-0">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                              <Sparkle size={11} weight="fill" />
                              {t('available', 'Available')}
                            </span>
                          )}
                          {isClaimed && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-tg-hint/15 text-tg-hint font-bold text-xs">
                              <Check size={11} weight="bold" />
                              {t('claimed', 'Claimed')}
                            </span>
                          )}
                          {isExpired && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold text-xs">
                              {t('expired', 'Expired')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Claim Code Strip */}
                      <div className="border-t border-tg-hint/10 pt-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-tg-hint font-medium">
                            {t('claimCode', 'Code')}:
                          </span>
                          <span className="font-mono font-bold bg-tg-bg px-2 py-0.5 rounded-md border border-amber-500/20 text-tg-text select-all">
                            {prize.code}
                          </span>
                        </div>

                        <span className="text-xs font-bold text-brand-primary inline-flex items-center gap-1">
                          {isPending ? t('tapToClaim', 'Show to Staff →') : t('viewDetails', 'View Details →')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Claim History */}
      <div>
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-tg-text">
          <ClockCounterClockwise size={24} className="text-brand-primary" weight="bold" />
          {t('claimHistory', 'Claim History')}
        </h3>

        {claimOrders.length === 0 ? (
          <div className="text-center p-8 bg-tg-secondary-bg rounded-2xl text-tg-hint border border-tg-hint/10 flex flex-col items-center gap-2">
            <Gift size={36} className="text-tg-hint/40" weight="duotone" />
            <p className="font-bold text-tg-text">{t('noClaimsYet', 'No Claim History Yet')}</p>
            <p className="text-xs text-tg-hint">
              {t('noClaimsDesc', 'When you redeem 10 stamps for a free drink at checkout, your claim history will appear here.')}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {claimOrders.map((order) => {
              const stampsUsed = Math.floor((order.pointsRedeemed ?? 0) / pointsPerStamp);
              const firstItem = order.items?.[0]?.menuItem;

              return (
                <div
                  key={order.id}
                  className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 flex flex-col gap-3"
                >
                  <div className="flex gap-3 items-center">
                    <div className="w-14 h-14 bg-tg-hint/10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {firstItem?.image ? (
                        <img src={firstItem.image} alt={firstItem.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">🧋</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-tg-text truncate">
                        {order.items?.map((i: any) => `${i.quantity}x ${i.menuItem?.name || 'Drink'}`).join(', ') || 'Claimed Drink'}
                      </h4>
                      <p className="text-xs text-tg-hint mt-0.5">
                        {shortDate(order.createdAt)}
                      </p>
                      <div className="mt-1.5 inline-flex items-center gap-1 font-bold text-xs text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-lg">
                        <Sparkle size={12} weight="fill" />
                        <span>
                          {stampsUsed > 0
                            ? `${stampsUsed} ${stampsUsed === 1 ? t('stamp', 'Stamp') : t('stamps', 'Stamps')} ${t('redeemed', 'Redeemed')}`
                            : `${Math.round(((order.pointsRedeemed ?? 0) / pointsPerStamp) * 10) / 10} ${t('stamps', 'Stamps')} ${t('redeemed', 'Redeemed')}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-tg-hint/10 pt-2.5 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold capitalize ${
                          order.status === 'completed'
                            ? 'bg-tg-hint/15 text-tg-hint'
                            : order.status === 'ready'
                            ? 'bg-green-500/15 text-green-700'
                            : order.status === 'preparing'
                            ? 'bg-blue-500/15 text-blue-700'
                            : order.status === 'cancelled'
                            ? 'bg-rose-500/15 text-rose-600'
                            : 'bg-yellow-500/15 text-yellow-700'
                        }`}
                      >
                        {order.status}
                      </span>
                      {order.pickupCode && (
                        <span className="font-mono font-bold text-tg-hint bg-tg-bg px-2 py-0.5 rounded">
                          #{order.pickupCode}
                        </span>
                      )}
                    </div>

                    {(order.discountApplied ?? 0) > 0 && (
                      <span className="font-bold text-brand-primary">
                        Saved {formatCurrency(order.discountApplied)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Customer Lucky Wheel Modal */}
      <CustomerLuckyWheelModal
        isOpen={luckyDrawOpen}
        onClose={() => {
          setLuckyDrawOpen(false);
          onCloseLuckyDraw?.();
        }}
        userTickets={userProfile?.luckyTickets || 0}
        costPerSpin={luckyCostPerSpin}
        prizes={luckyPrizes}
        onSpinSuccess={({ remainingTickets, loyaltyPoints: newPoints, prize: _prize }) => {
          setUserProfile((prev: any) => ({
            ...prev,
            luckyTickets: remainingTickets,
            loyaltyPoints: newPoints,
          }));
          setPoints(newPoints);
          fetchUserPrizes();
        }}
      />

      {/* Customer Prize Detail Modal */}
      <CustomerPrizeModal
        claim={selectedClaim}
        isOpen={!!selectedClaim}
        onClose={() => setSelectedClaim(null)}
      />
    </div>
  );
}
