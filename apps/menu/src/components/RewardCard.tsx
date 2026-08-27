import { useTranslation } from 'react-i18next';
import { Sparkle } from '@phosphor-icons/react';

interface RewardCardProps {
  points: number;
  earnPerDollar?: number;
  pointsPerDollar?: number;
  tier?: string;
  orderCount?: number;
  goldThreshold?: number;
}

// 10 Stamp circle positions (percentages matching 1050x600 card)
const STAMP_SLOTS = [
  // Row 1 (top row, slots 1-5)
  { id: 1, left: '10.81%', top: '57.33%', rotate: '-4deg' },
  { id: 2, left: '23.38%', top: '57.25%', rotate: '3deg' },
  { id: 3, left: '35.90%', top: '57.00%', rotate: '-2deg' },
  { id: 4, left: '48.43%', top: '57.25%', rotate: '5deg' },
  { id: 5, left: '61.00%', top: '57.00%', rotate: '-3deg' },
  // Row 2 (bottom row, slots 6-10)
  { id: 6, left: '10.81%', top: '79.83%', rotate: '4deg' },
  { id: 7, left: '23.38%', top: '79.67%', rotate: '-5deg' },
  { id: 8, left: '35.90%', top: '79.67%', rotate: '2deg' },
  { id: 9, left: '48.43%', top: '79.92%', rotate: '-3deg' },
  { id: 10, left: '61.00%', top: '79.92%', rotate: '6deg' },
];

export function RewardCard({
  points,
  pointsPerDollar = 100,
  tier = 'standard',
  orderCount = 0,
  goldThreshold = 3,
}: RewardCardProps) {
  const { t } = useTranslation();

  // 10 points = 1 stamp (or 100 points = 10 stamps = 1 full card)
  const pointsPerStamp = Math.max(1, Math.round(pointsPerDollar / 10));
  const totalStamps = Math.floor(points / pointsPerStamp);
  
  // Current active card progress (0 to 10)
  const isFullCard = totalStamps > 0 && totalStamps % 10 === 0;
  const currentStamps = isFullCard ? 10 : totalStamps % 10;
  const completedCards = Math.floor(totalStamps / 10);
  const stampsRemaining = 10 - currentStamps;

  const isGold = tier === 'gold';
  const effectiveThreshold = goldThreshold > 0 ? goldThreshold : 3;
  const currentOrders = Math.min(orderCount, effectiveThreshold);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Membership Tier Badge Card */}
      {isGold ? (
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 border-2 border-amber-400/70 shadow-[0_0_20px_rgba(245,158,11,0.25)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-500 flex items-center justify-center text-amber-950 font-black text-lg shadow-md">
              ⭐
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm text-amber-600 dark:text-amber-300">
                  ⭐ {t('goldMember', 'Gold Member')} VIP
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-400/30 text-amber-700 dark:text-amber-300 font-extrabold text-[10px] uppercase tracking-wider border border-amber-400/40">
                  VIP
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-700/90 dark:text-amber-300/90 mt-0.5">
                {t('goldPerk', 'Gold Perk: Cash on Delivery Unlocked')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/15 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-tg-hint/15 flex items-center justify-center text-tg-text font-bold text-sm">
                👤
              </div>
              <div>
                <div className="font-bold text-sm text-tg-text">
                  {t('standardMember', 'Standard Member')}
                </div>
                <div className="text-xs text-tg-hint">
                  {currentOrders}/{effectiveThreshold} {t('ordersToGold', 'orders to Gold VIP')}
                </div>
              </div>
            </div>
            <span className="text-xs font-black text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full">
              {currentOrders}/{effectiveThreshold}
            </span>
          </div>

          {/* Progress to Gold */}
          <div className="w-full bg-tg-hint/15 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-400 to-yellow-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (currentOrders / effectiveThreshold) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Physical Card Mockup Container */}
      <div className="relative w-full aspect-[1050/600] rounded-2xl overflow-hidden shadow-xl border-2 border-red-600/20 bg-red-600 select-none">
        {/* Card Template Background */}
        <img
          src="/images/reward-card.webp"
          alt="Ai-Cha & Zhengda Reward Card"
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Tier badge on card */}
        <div className="absolute top-3.5 right-3.5 z-10">
          {isGold ? (
            <div className="bg-amber-400/95 text-amber-950 px-2.5 py-1 rounded-full text-[11px] font-black shadow-md border border-amber-200 backdrop-blur-md flex items-center gap-1">
              <span>⭐</span>
              <span>Gold VIP</span>
            </div>
          ) : (
            <div className="bg-black/50 text-white/95 px-2.5 py-1 rounded-full text-[10px] font-bold border border-white/20 backdrop-blur-md flex items-center gap-1">
              <span>Standard</span>
            </div>
          )}
        </div>

        {/* 10 Stamp Seal Slots */}
        {STAMP_SLOTS.map((slot, index) => {
          const isStamped = index < currentStamps;
          const isNext = index === currentStamps;

          return (
            <div
              key={slot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none"
              style={{
                left: slot.left,
                top: slot.top,
                width: '10.5%',
                height: '18.5%',
              }}
            >
              {isStamped ? (
                <img
                  src="/images/stamp-seal.webp"
                  alt={`Stamp ${slot.id}`}
                  className="w-full h-full object-contain filter drop-shadow-sm transition-transform duration-300 transform animate-in fade-in zoom-in-75"
                  style={{
                    transform: `rotate(${slot.rotate}) scale(0.92)`,
                  }}
                />
              ) : isNext ? (
                <div className="w-full h-full rounded-full border-2 border-dashed border-red-400/40 animate-pulse flex items-center justify-center">
                  <span className="text-[9px] font-black text-red-700/60">{slot.id}</span>
                </div>
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center">
                  <span className="text-[9px] font-bold text-red-800/30">{slot.id}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress & Status Card */}
      <div className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-black text-lg text-brand-primary">{currentStamps}/10</span>
            <span className="text-sm font-bold text-tg-text">{t('stampsCollected', 'Stamps Collected')}</span>
          </div>
          {completedCards > 0 && (
            <div className="flex items-center gap-1 bg-amber-500/15 text-amber-700 px-2.5 py-1 rounded-full text-xs font-black">
              <span>🏅</span>
              <span>x{completedCards} {t('fullCards', 'Cards')}</span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-tg-hint/15 h-2.5 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-red-600 to-brand-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${(currentStamps / 10) * 100}%` }}
          />
        </div>

        {/* Info Text */}
        <div className="text-xs text-tg-hint flex items-center gap-1.5 mt-0.5">
          <Sparkle size={14} className="text-brand-primary flex-shrink-0" weight="fill" />
          {stampsRemaining === 0 ? (
            <span className="text-brand-primary font-bold">
              {t('cardCompletedReward', '🎉 Card completed! You earned a Free 7,000៛ reward!')}
            </span>
          ) : (
            <span>
              {t('stampsRemainingNotice', 'Collect {{count}} more stamp(s) to get Free 7,000៛!', {
                count: stampsRemaining,
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
