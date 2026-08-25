import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, ShoppingCart } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';
import { RewardCard } from './RewardCard';

const DEFAULT_EARN_PER_DOLLAR = 10;
const DEFAULT_POINTS_PER_DOLLAR = 100;

/** Reads one numeric config row, falling back when it is missing or not a number. */
function readConfigNumber(rows: { key: string; value: string }[], key: string, fallback: number): number {
  const n = Number(rows.find(r => r.key === key)?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface RewardsViewProps {
  onBrowseMenu?: () => void;
}

export function RewardsView({ onBrowseMenu }: RewardsViewProps) {
  const { t } = useTranslation();
  // Points belong to one account. A guest has none to show.
  const signedIn = hasIdentity();
  const [points, setPoints] = useState<number | null>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [claimableMenu, setClaimableMenu] = useState<any[]>([]);
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
        const [userRes, rewardsRes, cfgRes, catRes] = await Promise.all([
          apiFetch(ME.profile()),
          apiFetch('/api/rewards'),
          apiFetch('/api/config'),
          apiFetch('/api/catalog')
        ]);

        if (userRes.ok) {
          const user = await userRes.json();
          setPoints(Number(user.loyaltyPoints) || 0);
        } else {
          setFailed(true);
        }
        if (rewardsRes.ok) setRewards(await rewardsRes.json());
        if (catRes.ok) {
          const cat = await catRes.json();
          setClaimableMenu(cat.filter((i: any) => i.canClaim));
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

  if (!signedIn) {
    return (
      <SignInPrompt
        what={t('signInForRewards', 'Open the shop from our Telegram bot to collect and spend loyalty points.')}
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

      {/* Points become a discount at checkout */}
      <div className="bg-brand-primary/10 rounded-2xl p-4 border border-brand-primary/20 flex gap-3">
        <div className="text-brand-primary flex-shrink-0 mt-0.5">
          <ShoppingCart size={22} weight="fill" />
        </div>
        <p className="text-sm text-tg-text">
          {t('pointsUsedAtCheckout', 'Use your points at checkout. On the payment screen, move the slider to turn points into money off your order.')}
        </p>
      </div>

      {/* Reward Catalog */}
      <div>
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-tg-text">
          <Gift size={24} className="text-brand-primary" weight="fill" /> {t('rewardCatalog', 'Claimable Free Drinks (10 Stamps)')}
        </h3>

        {claimableMenu.length === 0 && rewards.length === 0 ? (
          <div className="text-center p-8 bg-tg-secondary-bg rounded-2xl text-tg-hint border border-tg-hint/10">
            {t('noRewardsYet', 'No rewards available right now. Check back later!')}
          </div>
        ) : (
          <div className="grid gap-3">
            {claimableMenu.map((item) => (
              <div key={item.id} className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 flex gap-4 items-center">
                <div className="w-16 h-16 bg-tg-hint/10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-2xl">🧋</div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-tg-text">{item.name}</h4>
                  {item.description && <p className="text-xs text-tg-hint line-clamp-1">{item.description}</p>}
                  <div className="mt-2 font-bold text-xs text-brand-primary bg-brand-primary/10 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg">
                    <span>🎁</span>
                    <span>10 Stamps (Free)</span>
                  </div>
                </div>
              </div>
            ))}

            {rewards.map(reward => (
              <div key={reward.id} className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 flex gap-4 items-center">
                <div className="w-16 h-16 bg-tg-hint/10 rounded-xl flex-shrink-0 overflow-hidden">
                  {reward.image ? (
                    <img src={reward.image} alt={reward.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-tg-hint/50">
                      <Gift size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-tg-text">{reward.name}</h4>
                  {reward.description && <p className="text-xs text-tg-hint line-clamp-1">{reward.description}</p>}
                  <div className="mt-2 font-bold text-sm text-brand-primary bg-brand-primary/10 inline-block px-2 py-1 rounded-lg">
                    {reward.pointsCost} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
