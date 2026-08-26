import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, ClockCounterClockwise, Sparkle } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { SignInPrompt } from './SignInPrompt';
import { RewardCard } from './RewardCard';

const DEFAULT_EARN_PER_DOLLAR = 10;
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
}

export function RewardsView({ onBrowseMenu }: RewardsViewProps) {
  const { t } = useTranslation();
  // Points belong to one account. A guest has none to show.
  const signedIn = hasIdentity();
  const [points, setPoints] = useState<number | null>(null);
  const [claimOrders, setClaimOrders] = useState<any[]>([]);
  const [earnPerDollar, setEarnPerDollar] = useState(DEFAULT_EARN_PER_DOLLAR);
  const [pointsPerDollar, setPointsPerDollar] = useState(DEFAULT_POINTS_PER_DOLLAR);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const [userRes, ordersRes, cfgRes] = await Promise.all([
          apiFetch(ME.profile()),
          apiFetch(ME.orders()),
          apiFetch('/api/config')
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          setPoints(Number(user.loyaltyPoints) || 0);
        } else {
          setFailed(true);
        }

        if (ordersRes.ok) {
          const orders = await ordersRes.json();
          const claims = (Array.isArray(orders) ? orders : []).filter(
            (o: any) => (o.pointsRedeemed ?? 0) > 0 || (o.discountApplied ?? 0) > 0
          );
          setClaimOrders(claims);
        }

        if (cfgRes.ok) {
          const rows: { key: string; value: string }[] = await cfgRes.json();
          setEarnPerDollar(readConfigNumber(rows, 'earnPointsPerDollar', DEFAULT_EARN_PER_DOLLAR));
          setPointsPerDollar(readConfigNumber(rows, 'pointsPerDollar', DEFAULT_POINTS_PER_DOLLAR));
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
      {/* 10-Slot Stamp Reward Card */}
      <RewardCard
        points={points ?? 0}
        earnPerDollar={earnPerDollar}
        pointsPerDollar={pointsPerDollar}
      />

      {/* 10-Stamp Reward Checkout Notice */}
      <div className="bg-brand-primary/10 rounded-2xl p-4 border border-brand-primary/20 flex gap-3">
        <div className="text-brand-primary flex-shrink-0 mt-0.5">
          <Sparkle size={22} weight="fill" />
        </div>
        <p className="text-sm text-tg-text">
          {t('stampRewardCheckoutHint', 'Collect 10 stamps to get a free item on your next order. Claim it directly at checkout!')}
        </p>
      </div>

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
                            ? 'bg-green-500/15 text-green-700 dark:text-green-300'
                            : order.status === 'preparing'
                            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                            : order.status === 'cancelled'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300'
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
    </div>
  );
}
