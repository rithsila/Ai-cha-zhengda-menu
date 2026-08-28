import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check, Gift, Sparkle, Clock, ShieldCheck } from '@phosphor-icons/react';

export type CustomerPrizeClaim = {
  id: string;
  code: string;
  prizeId?: string | null;
  prizeName: string;
  prizeIcon: string;
  prizeType: string;
  status: 'pending' | 'claimed' | 'expired';
  source: string;
  expiresAt?: string | null;
  claimedAt?: string | null;
  claimedByStaffName?: string | null;
  createdAt: string;
};

interface CustomerPrizeModalProps {
  claim: CustomerPrizeClaim | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerPrizeModal({ claim, isOpen, onClose }: CustomerPrizeModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !claim) return null;

  const isPending = claim.status === 'pending';
  const isClaimed = claim.status === 'claimed';
  const isExpired = claim.status === 'expired';

  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(claim.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const formatDate = (val?: string | null) => {
    if (!val) return '';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-tg-bg border border-tg-hint/15 shadow-2xl p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-150">
        {/* Close Button */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-tg-hint/10">
          <div className="flex items-center gap-2">
            <Gift size={20} className="text-amber-500" weight="fill" />
            <span className="font-bold text-sm text-tg-text">
              {t('giftVoucher', 'Gift Voucher')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg transition-colors"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Prize Icon & Title */}
        <div className="mt-4 flex flex-col items-center">
          <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center text-4xl shadow-md">
            {claim.prizeIcon || '🎁'}
          </div>
          <h3 className="font-extrabold text-lg text-tg-text mt-3">
            {claim.prizeName}
          </h3>

          {/* Status Badge */}
          <div className="mt-2">
            {isPending && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                <Sparkle size={13} weight="fill" />
                {t('availableToClaim', 'Available to Claim')}
              </span>
            )}
            {isClaimed && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-tg-hint/15 border border-tg-hint/25 text-tg-hint font-bold text-xs">
                <Check size={13} weight="bold" />
                {t('alreadyClaimed', 'Claimed on {{date}}', { date: formatDate(claim.claimedAt) })}
              </span>
            )}
            {isExpired && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold text-xs">
                <Clock size={13} />
                {t('expired', 'Expired')}
              </span>
            )}
          </div>
        </div>

        {/* Claim Code Box */}
        <div className="w-full mt-5 p-4 rounded-2xl bg-tg-secondary-bg border border-tg-hint/15 flex flex-col items-center gap-2">
          <p className="text-[11px] font-bold text-tg-hint uppercase tracking-wider">
            {t('claimCode', 'Redemption Claim Code')}
          </p>
          <div className="w-full py-2.5 px-4 rounded-xl bg-tg-bg border-2 border-dashed border-amber-500/50 font-mono font-black text-xl text-tg-text tracking-widest select-all">
            {claim.code}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full mt-1 py-2 px-3 rounded-xl bg-brand-primary text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-transform"
          >
            {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
            <span>{copied ? t('copiedCode', 'Code Copied!') : t('copyClaimCode', 'Copy Claim Code')}</span>
          </button>
        </div>

        {/* Instructions */}
        <div className="w-full mt-4 p-3 rounded-xl bg-brand-primary/5 border border-brand-primary/15 text-left text-xs text-tg-hint space-y-1.5">
          <p className="font-bold text-tg-text flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-brand-primary" weight="fill" />
            {t('howToClaim', 'How to claim this gift')}
          </p>
          <p className="text-[11px] leading-relaxed">
            {isPending
              ? t('claimInstructionText', 'Show this code or screen to the cashier at the Ai-Cha / Zhengda counter. Staff will verify your code and hand over your gift.')
              : isClaimed
              ? t('claimedInstructionText', 'This gift has already been claimed and handed over at the store counter.')
              : t('expiredInstructionText', 'This gift voucher has passed its validity date.')}
          </p>
          {claim.expiresAt && isPending && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold pt-1 border-t border-brand-primary/10">
              ⏳ {t('validUntil', 'Valid until: {{date}}', { date: formatDate(claim.expiresAt) })}
            </p>
          )}
        </div>

        {/* Close Modal CTA */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-2xl bg-tg-secondary-bg hover:bg-tg-hint/15 text-tg-text font-bold text-xs transition-colors"
        >
          {t('done', 'Done')}
        </button>
      </div>
    </div>
  );
}
