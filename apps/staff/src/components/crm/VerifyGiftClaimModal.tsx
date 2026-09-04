import { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Gift,
  Phone,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Badge, Button, Card, useToast } from '../ui';
import type { PrizeClaimItem } from './types';

type VerifyGiftClaimModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialCode?: string;
  onClaimRedeemed?: (claim: PrizeClaimItem) => void;
};

export function VerifyGiftClaimModal({
  isOpen,
  onClose,
  initialCode = '',
  onClaimRedeemed,
}: VerifyGiftClaimModalProps) {
  const { toast } = useToast();
  const [inputCode, setInputCode] = useState(initialCode);
  const [verifying, setVerifying] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [verifiedClaim, setVerifiedClaim] = useState<PrizeClaimItem | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('Store Staff');
  const [notes, setNotes] = useState('');
  const [successRedeemed, setSuccessRedeemed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputCode(initialCode);
      setVerifiedClaim(null);
      setVerifyError(null);
      setSuccessRedeemed(false);
      setNotes('');
      if (initialCode.trim()) {
        handleVerify(initialCode.trim());
      }
    }
  }, [isOpen, initialCode]);

  if (!isOpen) return null;

  const handleVerify = async (codeToVerify?: string) => {
    const target = (codeToVerify || inputCode).trim();
    if (!target) {
      setVerifyError('Please enter a claim code');
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    setSuccessRedeemed(false);

    try {
      const res = await apiFetch<{ valid: boolean; status: string; claim: PrizeClaimItem }>(
        '/api/lucky-draw/verify-claim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: target }),
        }
      );

      setVerifiedClaim(res.claim);
    } catch (err: any) {
      setVerifiedClaim(null);
      setVerifyError(err.message || 'Invalid or non-existent claim code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleRedeem = async () => {
    if (!verifiedClaim) return;
    setRedeeming(true);

    try {
      const res = await apiFetch<{ ok: boolean; message: string; claim: PrizeClaimItem }>(
        '/api/lucky-draw/redeem-claim',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: verifiedClaim.code,
            staffName: staffName.trim() || 'Store Staff',
            notes: notes.trim() || undefined,
          }),
        }
      );

      setVerifiedClaim(res.claim);
      setSuccessRedeemed(true);
      if (onClaimRedeemed) onClaimRedeemed(res.claim);
      toast({
        title: '🎉 Gift Claimed & Handed Over!',
        description: `${res.claim.prizeName} was marked as claimed for ${res.claim.user?.contactName || res.claim.user?.firstName || 'customer'}.`,
        variant: 'success',
      });
    } catch (err: any) {
      toast({
        title: "Couldn't redeem gift",
        description: err.message,
        variant: 'error',
      });
    } finally {
      setRedeeming(false);
    }
  };

  const handleReset = () => {
    setInputCode('');
    setVerifiedClaim(null);
    setVerifyError(null);
    setSuccessRedeemed(false);
    setNotes('');
  };

  const formatDate = (val?: string | null) => {
    if (!val) return '—';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isPending = verifiedClaim?.status === 'pending';
  const isClaimed = verifiedClaim?.status === 'claimed';
  const isExpired = verifiedClaim?.status === 'expired';

  const customerName =
    verifiedClaim?.user?.contactName ||
    [verifiedClaim?.user?.firstName, verifiedClaim?.user?.lastName].filter(Boolean).join(' ') ||
    (verifiedClaim?.user?.username ? `@${verifiedClaim.user.username}` : `Customer #${verifiedClaim?.telegramUserId}`);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <Card
        padding="lg"
        className="relative z-10 w-full max-w-lg overflow-hidden border-border bg-surface shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-none bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Gift className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                Verify Customer Gift Voucher
              </h3>
              <p className="text-xs text-ink-soft">
                Enter 6-character claim code or scan customer voucher
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-none p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* Code Search Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Enter Code (e.g. LUCKY-8K9X2P or 8K9X2P)"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                autoFocus
                className="h-11 w-full rounded-none border border-border bg-surface pl-3.5 pr-10 font-mono text-sm font-bold text-ink tracking-wider uppercase outline-none focus:border-accent"
              />
              {inputCode && (
                <button
                  type="button"
                  onClick={() => setInputCode('')}
                  aria-label="Clear code input"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={verifying}
              className="h-11 px-4 font-bold text-xs gap-1.5 shrink-0"
            >
              <Search className="size-4" />
              Verify
            </Button>
          </form>

          {/* Verification Error */}
          {verifyError && (
            <div className="rounded-none border border-danger/30 bg-danger-soft p-3.5 text-xs text-danger flex items-start gap-2.5 animate-in fade-in duration-150">
              <ShieldAlert className="size-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Invalid Claim Code</p>
                <p className="mt-0.5 text-[11px] opacity-90">{verifyError}</p>
              </div>
            </div>
          )}

          {/* Verified Claim Result Card */}
          {verifiedClaim && (
            <div className="space-y-4 animate-in zoom-in-95 duration-150">
              {/* Status Header Strip */}
              {isPending && !successRedeemed && (
                <div className="rounded-none border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                    <Sparkles className="size-4 text-emerald-600" />
                    <span>Valid Voucher • Ready to Hand Over</span>
                  </div>
                  <Badge variant="success">Pending Handover</Badge>
                </div>
              )}

              {successRedeemed && (
                <div className="rounded-none border border-emerald-500/40 bg-emerald-500/15 p-3.5 flex items-center gap-2.5 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">Item Successfully Handed Over!</p>
                    <p className="text-[11px] opacity-90">Status updated to Claimed in customer account.</p>
                  </div>
                </div>
              )}

              {isClaimed && !successRedeemed && (
                <div className="rounded-none border border-border bg-surface-sunken/60 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-ink-soft font-bold text-xs">
                    <Check className="size-4 text-ink-faint" />
                    <span>Already Claimed ({formatDate(verifiedClaim.claimedAt)})</span>
                  </div>
                  <Badge variant="neutral">Already Claimed</Badge>
                </div>
              )}

              {isExpired && (
                <div className="rounded-none border border-rose-500/30 bg-rose-500/10 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-xs">
                    <Clock className="size-4 text-rose-600" />
                    <span>Expired Voucher ({formatDate(verifiedClaim.expiresAt)})</span>
                  </div>
                  <Badge variant="danger">Expired</Badge>
                </div>
              )}

              {/* Prize Details Card */}
              <div className="rounded-none border border-border bg-surface-sunken/40 p-4 space-y-3">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-14 items-center justify-center rounded-none bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-3xl shadow-xs shrink-0">
                    {verifiedClaim.prizeIcon || '🎁'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-none border border-amber-500/20 inline-block mb-1">
                      {verifiedClaim.code}
                    </span>
                    <h4 className="font-extrabold text-base text-ink truncate">
                      {verifiedClaim.prizeName}
                    </h4>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Won on {formatDate(verifiedClaim.createdAt)}
                      {verifiedClaim.source === 'manager_draw' ? ' · 🏆 Raffle Winner' : ' · 🎲 Wheel Spin'}
                    </p>
                  </div>
                </div>

                {/* Claim Meta */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-ink-faint">Validity Expiration</span>
                    <p className="font-semibold text-ink mt-0.5">{formatDate(verifiedClaim.expiresAt)}</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-ink-faint">Claim Status</span>
                    <p className="font-semibold text-ink mt-0.5 capitalize">{verifiedClaim.status}</p>
                  </div>
                </div>

                {verifiedClaim.claimedByStaffName && (
                  <div className="pt-2 border-t border-border/60 text-xs">
                    <span className="text-[10px] uppercase font-bold text-ink-faint">Handed Over By</span>
                    <p className="font-semibold text-ink mt-0.5">
                      {verifiedClaim.claimedByStaffName}
                      {verifiedClaim.notes ? ` (${verifiedClaim.notes})` : ''}
                    </p>
                  </div>
                )}
              </div>

              {/* Customer Profile Card */}
              {verifiedClaim.user && (
                <div className="rounded-none border border-border bg-surface-sunken/40 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1.5">
                      <User className="size-3.5 text-accent" />
                      Recipient Customer
                    </p>
                    <Badge variant={verifiedClaim.user.tier === 'gold' ? 'success' : 'neutral'}>
                      {verifiedClaim.user.tier === 'gold' ? 'Gold VIP' : 'Standard'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-bold text-ink">{customerName}</div>
                    {verifiedClaim.user.phoneNumber && (
                      <a
                        href={`tel:${verifiedClaim.user.phoneNumber}`}
                        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                      >
                        <Phone className="size-3" />
                        {verifiedClaim.user.phoneNumber}
                      </a>
                    )}
                  </div>

                  {(verifiedClaim.user.building || verifiedClaim.user.roomNumber) && (
                    <div className="text-[11px] text-ink-soft flex items-center gap-1 pt-1 border-t border-border/40">
                      <Building2 className="size-3.5 text-ink-faint" />
                      <span>
                        {verifiedClaim.user.building ? `Building ${verifiedClaim.user.building}` : ''}{' '}
                        {verifiedClaim.user.roomNumber ? `· Room ${verifiedClaim.user.roomNumber}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Handover & Redeem Action (Only if pending) */}
              {isPending && (
                <div className="rounded-none border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label htmlFor="staff-name-input" className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                        Staff / Barista Name
                      </label>
                      <input
                        id="staff-name-input"
                        type="text"
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        placeholder="e.g. Sok Barista"
                        className="h-9 w-full rounded-none border border-border bg-surface px-2.5 text-xs font-semibold text-ink outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="handover-notes-input" className="block text-[10px] font-bold uppercase text-ink-soft mb-1">
                        Handover Note (Optional)
                      </label>
                      <input
                        id="handover-notes-input"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Size M Passion Tea"
                        className="h-9 w-full rounded-none border border-border bg-surface px-2.5 text-xs font-semibold text-ink outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    loading={redeeming}
                    onClick={handleRedeem}
                    className="w-full h-11 text-xs font-black gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white border-0 shadow-md"
                  >
                    <CheckCircle2 className="size-4" />
                    Hand Over Item &amp; Confirm Claim
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleReset}
            className="gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
          >
            <RotateCcw className="size-3.5" />
            Check Another Code
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onClose}
            className="text-xs font-bold"
          >
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
