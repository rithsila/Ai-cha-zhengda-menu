import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Ticket, ArrowCounterClockwise } from '@phosphor-icons/react';
import { apiFetch } from '../utils/api';
import { LuckyWheelIcon } from './ui/LuckyWheelIcon';

export type LuckyPrize = {
  id: string;
  name: string;
  label: string;
  icon: string;
  color: string;
  type: 'points' | 'tickets' | 'item';
  value: number;
  segmentIndex: number;
  claimCode?: string;
};

interface CustomerLuckyWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  userTickets: number;
  costPerSpin?: number;
  prizes?: LuckyPrize[];
  onSpinSuccess?: (data: { remainingTickets: number; loyaltyPoints: number; prize: LuckyPrize }) => void;
}

// Fallback prize segments if API hasn't loaded yet
const DEFAULT_PRIZES: LuckyPrize[] = [
  { id: 'points_10', label: '+10 Pts', name: '+10 Loyalty Points', icon: '⭐', color: '#F59E0B', type: 'points', value: 10, segmentIndex: 0 },
  { id: 'tickets_1', label: '+1 Ticket', name: '+1 Bonus Lucky Ticket', icon: '🎟️', color: '#EF4444', type: 'tickets', value: 1, segmentIndex: 1 },
  { id: 'points_20', label: '+20 Pts', name: '+20 Loyalty Points', icon: '⭐', color: '#10B981', type: 'points', value: 20, segmentIndex: 2 },
  { id: 'discount_50c', label: '$0.50 Off', name: '$0.50 Discount Voucher', icon: '🏷️', color: '#3B82F6', type: 'points', value: 50, segmentIndex: 3 },
  { id: 'blind_box', label: 'Blind Box', name: 'Mystery Blind Box Toy', icon: '🎁', color: '#8B5CF6', type: 'item', value: 0, segmentIndex: 4 },
  { id: 'points_50', label: '+50 Pts', name: '+50 Loyalty Points', icon: '✨', color: '#EC4899', type: 'points', value: 50, segmentIndex: 5 },
  { id: 'snack_voucher', label: 'Chicken', name: 'Zhengda Fried Chicken Voucher', icon: '🍗', color: '#F97316', type: 'item', value: 0, segmentIndex: 6 },
  { id: 'free_drink', label: 'Free Drink', name: 'Free Drink Reward', icon: '🧋', color: '#14B8A6', type: 'points', value: 100, segmentIndex: 7 },
];

export function CustomerLuckyWheelModal({
  isOpen,
  onClose,
  userTickets,
  costPerSpin = 5,
  prizes = DEFAULT_PRIZES,
  onSpinSuccess,
}: CustomerLuckyWheelModalProps) {
  const { t } = useTranslation();
  const [spinning, setSpinning] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [wonPrize, setWonPrize] = useState<LuckyPrize | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Use dynamic prizes loaded from admin settings (supports any slice count >= 2)
  const activePrizes = Array.isArray(prizes) && prizes.length >= 2 ? prizes : DEFAULT_PRIZES;
  const numSegments = activePrizes.length;
  const segmentAngle = 360 / numSegments;
  const canSpin = userTickets >= costPerSpin && !spinning;
  const ticketsNeeded = Math.max(0, costPerSpin - userTickets);

  // Draw the spinning wheel canvas
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 300;
    const dpr = window.devicePixelRatio || 2;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const radius = center - 8;

    ctx.clearRect(0, 0, size, size);

    // Draw Wheel Outer Ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius + 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#1F2937';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#FBBF24';
    ctx.stroke();
    ctx.restore();

    // Draw Segments
    activePrizes.forEach((prize, index) => {
      const startAngle = ((index * segmentAngle - 90) * Math.PI) / 180;
      const endAngle = (((index + 1) * segmentAngle - 90) * Math.PI) / 180;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = prize.color || '#F59E0B';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      // Draw prize label & icon (smart orientation: never upside down)
      ctx.save();
      ctx.translate(center, center);
      const midAngleRad = startAngle + (segmentAngle * Math.PI) / 360;
      const midAngleDeg = (index * segmentAngle + segmentAngle / 2) % 360;
      const isLeftSide = midAngleDeg > 90 && midAngleDeg < 270;

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      ctx.textBaseline = 'middle';

      if (isLeftSide) {
        ctx.rotate(midAngleRad + Math.PI);
        ctx.textAlign = 'left';
        ctx.fillText(`${prize.icon || '🎁'} ${prize.label || ''}`, -(radius - 18), 0);
      } else {
        ctx.rotate(midAngleRad);
        ctx.textAlign = 'right';
        ctx.fillText(`${prize.icon || '🎁'} ${prize.label || ''}`, radius - 18, 0);
      }
      ctx.restore();

      ctx.restore();
    });
  }, [isOpen, activePrizes, segmentAngle]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium');
    } catch {}
  };

  const triggerSuccessHaptic = () => {
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {}
  };

  const handleSpin = async () => {
    if (!canSpin) return;
    setErrorMsg(null);
    setWonPrize(null);
    setSpinning(true);
    triggerHaptic();

    try {
      const res = await apiFetch('/api/lucky-draw/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to spin wheel');
      }

      const result = await res.json();
      const prize: LuckyPrize = result.prize;
      const targetIndex = prize.segmentIndex ?? 0;

      // Wheel math: Pointer is at 12 o'clock (top center).
      const fullRotations = 6 * 360;
      const targetSegmentCenter = targetIndex * segmentAngle + segmentAngle / 2;
      const finalAngle = (360 - targetSegmentCenter) % 360;
      const extraSpin = (currentRotation % 360);
      const nextRotation = currentRotation + fullRotations + (finalAngle - extraSpin);

      setCurrentRotation(nextRotation);

      // Wait for spin animation (4.2 seconds)
      setTimeout(() => {
        setSpinning(false);
        setWonPrize(prize);
        triggerSuccessHaptic();
        if (onSpinSuccess) {
          onSpinSuccess({
            remainingTickets: result.user?.luckyTickets ?? Math.max(0, userTickets - costPerSpin),
            loyaltyPoints: result.user?.loyaltyPoints ?? 0,
            prize,
          });
        }
      }, 4200);
    } catch (err: any) {
      setSpinning(false);
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={spinning ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-tg-bg border border-tg-hint/15 shadow-2xl p-5 flex flex-col items-center text-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-tg-hint/10">
          <div className="flex items-center gap-2.5">
            <LuckyWheelIcon size={24} animate={false} />
            <div className="text-left">
              <h3 className="font-extrabold text-base text-tg-text leading-tight">
                {t('luckyDrawWheel', 'Lucky Draw Wheel')}
              </h3>
              <p className="text-[11px] text-tg-hint font-medium">
                {t('ticketsRequiredPerSpin', '{{cost}} Tickets / Spin', { cost: costPerSpin })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={spinning}
            aria-label="Close"
            className="rounded-full p-1.5 text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg transition-colors disabled:opacity-40"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tickets Balance Pill */}
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold shadow-xs">
          <Ticket size={14} weight="fill" />
          <span>{userTickets} {t('luckyTickets', 'Lucky Tickets')}</span>
        </div>

        {/* Wheel Display Container with Exact Center Hub */}
        <div className="relative size-[300px] my-3 mx-auto flex items-center justify-center select-none">
          {/* Top Pointer Indicator Arrow */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30 pointer-events-none drop-shadow-md">
            <div className="w-0 h-0 border-x-[12px] border-x-transparent border-t-[20px] border-t-amber-500" />
          </div>

          {/* Canvas Wheel with CSS Rotation Transition */}
          <div
            className="size-[300px] rounded-full shadow-2xl overflow-hidden"
            style={{
              transform: `rotate(${currentRotation}deg)`,
              transition: spinning ? 'transform 4.2s cubic-bezier(0.12, 0.8, 0.18, 1)' : 'none',
            }}
          >
            <canvas ref={canvasRef} className="size-[300px] block" />
          </div>

          {/* Exact Center 3D Glossy Gold SPIN Button Hub (100% Solid, Never Transparent) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
            <button
              type="button"
              onClick={handleSpin}
              disabled={!canSpin}
              aria-label="Spin Wheel"
              style={{
                background: canSpin
                  ? 'radial-gradient(circle at 35% 35%, #FDE047 0%, #F59E0B 45%, #D97706 80%, #B45309 100%)'
                  : 'radial-gradient(circle at 35% 35%, #D97706 0%, #B45309 60%, #78350F 100%)',
                boxShadow: canSpin
                  ? '0 6px 16px rgba(0, 0, 0, 0.4), 0 0 0 4px #FFFFFF, 0 0 0 6px #F59E0B'
                  : '0 4px 10px rgba(0, 0, 0, 0.35), 0 0 0 4px #FFFFFF',
              }}
              className={[
                'size-[76px] rounded-full flex flex-col items-center justify-center select-none',
                'transition-transform duration-200 focus:outline-none',
                canSpin
                  ? 'cursor-pointer active:scale-95 hover:scale-105 animate-[centerButtonScale_1.8s_ease-in-out_infinite]'
                  : 'cursor-not-allowed',
              ].join(' ')}
            >
              {spinning ? (
                <ArrowCounterClockwise size={28} weight="bold" className="animate-spin text-white drop-shadow-md" />
              ) : (
                <div className="flex flex-col items-center justify-center leading-none">
                  <span className="text-[15px] font-black tracking-widest text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">
                    SPIN
                  </span>
                  <span className="text-[10px] font-extrabold text-amber-100 mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                    {costPerSpin} 🎟️
                  </span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Error message if any */}
        {errorMsg && (
          <div className="mb-3 w-full p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Won Prize Celebration Popup */}
        {wonPrize && !spinning && (
          <div className="mb-3 w-full p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 shadow-md animate-in zoom-in-95 duration-200">
            <div className="text-3xl mb-1">{wonPrize.icon}</div>
            <h4 className="font-extrabold text-base text-tg-text">
              🎉 {t('youWon', 'You Won')} {wonPrize.name}!
            </h4>
            {wonPrize.type === 'points' && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                +{wonPrize.value} Points credited to your account!
              </p>
            )}
            {wonPrize.type === 'tickets' && (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-1">
                +{wonPrize.value} Bonus ticket added!
              </p>
            )}
            {wonPrize.type === 'item' && (
              <div className="mt-1">
                <p className="text-xs text-tg-hint">
                  Show code to staff at store counter:
                </p>
                <div className="mt-1 font-mono font-bold text-xs bg-tg-bg/70 px-2 py-1 rounded-lg border border-amber-500/30 inline-block text-tg-text">
                  {wonPrize.claimCode || 'LUCKY-CLAIM'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clean Status Footer */}
        <div className="w-full text-center pt-1 space-y-1">
          {canSpin ? (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-pulse">
              ✨ Tap the center SPIN button to spin!
            </p>
          ) : (
            <p className="text-xs text-tg-hint font-medium">
              🔒 Collect {ticketsNeeded} more tickets to spin
            </p>
          )}
          <p className="text-[11px] text-tg-hint/70">
            {t('earnTicketsHint', 'Earn lucky tickets with every order!')}
          </p>
        </div>

        {/* Smooth Scale Animation with 100% Solid Opacity */}
        <style>{`
          @keyframes centerButtonScale {
            0%, 100% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.06);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
