import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadSimple, Check, CaretRight, ArrowClockwise, WarningCircle, XCircle } from '@phosphor-icons/react';
import { Button } from './ui/Button';
import { apiFetch } from '../utils/api';
import { launchAbaPayment } from '../utils/abaPaymentLaunch';
import { markOnlinePaymentAvailable, markOnlinePaymentUnavailable } from '../utils/onlinePayment';

/** Seconds -> "m:ss" for the KHQR countdown. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const KHQR_RED = '#bc271a';
const CARD_SHELL_PATH =
  'M189.868 10.8675H27.8677C18.4788 10.8675 10.8677 18.4787 10.8677 27.8675V287.867C10.8677 297.256 18.4788 304.867 27.8677 304.867H189.868C199.257 304.867 206.868 297.256 206.868 287.867V27.8675C206.868 18.4787 199.257 10.8675 189.868 10.8675Z';
const KHQR_HEADER_BACKGROUND_PATH =
  'M178.91 0C188.299 0.00000824649 195.91 7.61117 195.91 17V36.3516H196V54L178.582 37H0V17C0.00000103088 7.61116 7.61116 0 17 0H178.91Z';
const KHQR_HEADER_MARK_PATHS = [
  'M104.488 17.1027V20.5948H100.95C100.596 20.5948 100.331 20.3329 100.331 19.9836V17.1027C100.331 16.7535 100.596 16.4916 100.95 16.4916H103.781C104.223 16.4043 104.488 16.7535 104.488 17.1027Z',
  'M120.944 18.5H119.175C119.175 16.4047 117.494 14.746 115.371 14.746C113.69 14.746 112.274 15.7936 111.743 17.365C111.655 17.7143 111.566 18.1507 111.566 18.5V23.9999H111.478C110.505 23.9999 109.797 23.2142 109.797 22.3412V18.5C109.797 17.0159 110.416 15.5317 111.566 14.4841C112.628 13.5238 113.955 13 115.371 13C118.467 13 120.944 15.4444 120.944 18.5Z',
  'M120.945 24H118.467L117.848 23.3889L116.521 22.0794L114.663 20.2461H117.14L120.945 24Z',
  'M105.107 22.2539H99.7994C99.18 22.2539 98.6492 21.7301 98.6492 21.119V15.8809C98.6492 15.2698 99.18 14.746 99.7994 14.746H105.107C105.727 14.746 106.257 15.2698 106.257 15.8809V21.119L108.027 22.865V14.6587C108.027 13.6984 107.231 13 106.346 13H98.6492C97.6756 13 96.9683 13.7857 96.9683 14.6587V22.2539C96.9683 23.2142 97.7642 23.9126 98.6492 23.9126H106.877L105.107 22.2539Z',
  'M83.6093 23.9999H81.1318L76.0005 18.8492V23.9999H73.9658V13H76.0005V17.8888L80.9553 13H83.3436L78.0356 18.2381L83.6093 23.9999Z',
  'M92.898 13H94.8446V23.9999H92.898V19.1984H87.2358V23.9999H85.2012V13H87.2358V17.6269H92.898V13Z',
];

function formatKhqrAmount(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Official KHQR Vector Logo mark */
function KhqrLogo({ className = 'h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="71 11 52 15"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="KHQR"
    >
      {KHQR_HEADER_MARK_PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/**
 * Render the official ABA PayWay KHQR card template
 * onto a high-resolution canvas and return a PNG Blob to save to Photos.
 */
async function renderKhqrTemplateToBlob(params: {
  qrImageSrc: string;
  merchantName?: string;
  amount: number;
}): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      qrImg.onload = () => {
        // High resolution 4x scale for crisp text and scan reliability (872 x 1264)
        const scale = 4;
        const logicalW = 218;
        const logicalH = 316;
        const canvas = document.createElement('canvas');
        canvas.width = logicalW * scale;
        canvas.height = logicalH * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.scale(scale, scale);

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, logicalW, logicalH);

        const cardPath = new Path2D(CARD_SHELL_PATH);

        // Drop shadow under the rounded card
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
        ctx.shadowBlur = 5.43375;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fill(cardPath);
        ctx.restore();

        // Clip card content strictly inside the rounded card path
        ctx.save();
        ctx.clip(cardPath);

        // KHQR Header Logo & Ribbon Flap
        ctx.save();
        ctx.translate(11, 11);
        ctx.fillStyle = KHQR_RED;
        ctx.fill(new Path2D(KHQR_HEADER_BACKGROUND_PATH));
        ctx.fillStyle = '#ffffff';
        for (const pathStr of KHQR_HEADER_MARK_PATHS) {
          ctx.fill(new Path2D(pathStr));
        }
        ctx.restore();

        // Merchant Name
        ctx.fillStyle = '#111111';
        ctx.font = '10px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(params.merchantName || 'Ai-Cha & Zhengda', 51, 81);

        // Amount
        ctx.fillStyle = '#000000';
        ctx.font = '500 20px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(formatKhqrAmount(params.amount), 51, 108);

        // Dashed line
        ctx.beginPath();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = '#8a8a8a';
        ctx.lineWidth = 1;
        ctx.moveTo(11, 124);
        ctx.lineTo(207, 124);
        ctx.stroke();
        ctx.setLineDash([]);

        // QR Code area
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(37, 145, 144, 144);
        ctx.drawImage(qrImg, 37, 145, 144, 144);

        // KHQR center brand mark
        ctx.beginPath();
        ctx.arc(109, 217, 17, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(109, 217, 13, 0, Math.PI * 2);
        ctx.fillStyle = KHQR_RED;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';
        ctx.stroke(new Path2D('M102 213h3v-3h8v3h3v8h-3v3h-8v-3h-3z'));

        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke(new Path2D('M109 213v8M105 217h8'));

        ctx.restore(); // end card-clip

        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      };
      qrImg.onerror = () => resolve(null);
      qrImg.src = params.qrImageSrc;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Save image blob to user photo library or file downloads.
 * Uses Web Share API on mobile (iOS/Android) for direct Save to Photos,
 * and standard blob download fallback.
 */
async function saveBlobToPhotos(blob: Blob, fileName: string): Promise<boolean> {
  try {
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });

    // 1. Web Share API (native iOS / Android prompt with "Save Image" to Photos)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Ai-Cha KHQR Payment',
      });
      return true;
    }

    // 2. Standard browser download fallback
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') {
      return false;
    }
    console.error('Failed to save image:', err);
    return false;
  }
}

/**
 * Fallback to save raw square QR image if canvas rendering is unavailable.
 */
async function saveQrToPhotos(qrImageSrc: string): Promise<boolean> {
  try {
    const res = await fetch(qrImageSrc);
    const blob = await res.blob();
    return await saveBlobToPhotos(blob, `khqr-${Date.now()}.png`);
  } catch (err) {
    console.error('Failed to save fallback QR image:', err);
    return false;
  }
}

interface KhqrPaymentPanelProps {
  orderId: string;
  totalAmount?: number;
  onPaid: (pickupCode: string) => void;
  onCancel?: () => void;
  onExpired?: () => void;
  isViewingKhqr?: boolean;
  onViewingKhqrChange?: (viewing: boolean) => void;
}

/**
 * The ABA KHQR payment screen for one existing order.
 *
 * It owns the whole payment lifecycle: it creates the ABA payment itself on
 * mount, polls for confirmation, runs the expiry countdown and offers a retry.
 * Customers can pay directly via ABA Mobile or open the official KHQR template
 * card to scan or save to their photo library.
 */
export function KhqrPaymentPanel({
  orderId,
  totalAmount,
  onPaid,
  onCancel,
  onExpired,
  isViewingKhqr: controlledViewingKhqr,
  onViewingKhqrChange,
}: KhqrPaymentPanelProps) {
  const { t } = useTranslation();

  const [payment, setPayment] = useState<{
    abapayDeeplink?: string;
    appStoreUrl?: string;
    playStoreUrl?: string;
    qrImage: string;
    amount?: number;
    merchantName?: string;
    expiresAt: number;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [resultState, setResultState] = useState<'pending' | 'declined' | 'expired' | 'cancelled'>('pending');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [networkInterrupted, setNetworkInterrupted] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [abaLaunchHint, setAbaLaunchHint] = useState<string | null>(null);
  const [internalViewingKhqr, setInternalViewingKhqr] = useState(false);
  const isViewingKhqr = controlledViewingKhqr !== undefined ? controlledViewingKhqr : internalViewingKhqr;
  const setIsViewingKhqr = (val: boolean) => {
    setInternalViewingKhqr(val);
    onViewingKhqrChange?.(val);
  };
  // 'unavailable' means the shop has no online payment set up yet; 'failed' is a payment start error.
  const [startError, setStartError] = useState<'unavailable' | 'failed' | null>(null);
  // Bumped by "Try again" to ask for a fresh QR for the same order.
  const [attempt, setAttempt] = useState(0);

  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // Check payment status with server
  const checkStatusNow = useCallback(async (manual = false) => {
    if (manual) setIsCheckingStatus(true);
    try {
      const res = await apiFetch(`/api/payment/aba/status/${orderId}`);
      setNetworkInterrupted(false);
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        if (res.status === 409 && errData?.lateApproved) {
          sessionStorage.removeItem('ai_cha_active_payment');
          setPayment(null);
          onPaidRef.current(errData.pickupCode || '');
          return;
        }
        return;
      }

      const data = await res.json();
      if (data.status === 'APPROVED') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setPayment(null);
        onPaidRef.current(data.pickupCode);
      } else if (data.status === 'DECLINED') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setResultState('declined');
      } else if (data.status === 'EXPIRED') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setResultState('expired');
      } else if (data.status === 'CANCELLED') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setResultState('cancelled');
      }
    } catch {
      setNetworkInterrupted(true);
    } finally {
      if (manual) setIsCheckingStatus(false);
    }
  }, [orderId]);

  // Create (or re-create) the ABA payment for this order.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setStartError(null);
    setPayment(null);
    setResultState('pending');
    setIsSaved(false);
    setConfirmingCancel(false);
    setCancelError(null);

    (async () => {
      try {
        const res = await apiFetch('/api/payment/aba/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });

        if (!res.ok) {
          if (res.status === 503) {
            markOnlinePaymentUnavailable();
            if (!cancelled) setStartError('unavailable');
            return;
          }
          if (!cancelled) setStartError('failed');
          return;
        }

        const data = await res.json();
        markOnlinePaymentAvailable();
        sessionStorage.setItem('ai_cha_active_payment', orderId);

        if (cancelled) return;
        setPayment({
          abapayDeeplink: data.abapayDeeplink,
          appStoreUrl: data.appStoreUrl,
          playStoreUrl: data.playStoreUrl,
          qrImage: data.qrImage,
          amount: data.amount,
          merchantName: data.merchantName,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 3 * 60 * 1000,
        });
      } catch {
        if (cancelled) return;
        setStartError('failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orderId, attempt]);

  // Poll status from server every 3s while pending
  useEffect(() => {
    if (!payment || resultState !== 'pending') return;

    const interval = setInterval(() => {
      checkStatusNow(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [payment, resultState, checkStatusNow]);

  // Check status immediately when returning to tab from ABA Mobile
  useEffect(() => {
    if (!payment || resultState !== 'pending') return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkStatusNow(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [payment, resultState, checkStatusNow]);

  // Countdown timer: on reaching 0, check with server before declaring expired
  useEffect(() => {
    if (!payment || resultState !== 'pending') return;

    const tick = () => {
      const left = Math.max(0, Math.round((payment.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        // Reconcile with server before claiming expired
        checkStatusNow(false);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [payment, resultState, checkStatusNow]);

  const displayAmount = payment?.amount ?? totalAmount ?? 0;
  const handleRetry = () => {
    setResultState('pending');
    setAttempt(a => a + 1);
  };

  const handleOpenAbaPayment = () => {
    if (!payment?.abapayDeeplink) return;
    const result = launchAbaPayment(payment.abapayDeeplink);
    if (!result.ok) {
      setAbaLaunchHint(t('abaLaunchInvalid', 'This ABA payment link is invalid. Please use KHQR or try again.'));
      return;
    }

    setAbaLaunchHint(null);
    window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        setAbaLaunchHint(t('abaLaunchFallback', 'If ABA Mobile did not open, use ABA KHQR below or make sure ABA Mobile is installed.'));
      }
    }, result.mode === 'telegram-external-browser' ? 1800 : 1400);
  };

  const handleSaveKhqr = async () => {
    if (!payment?.qrImage || isSaving) return;
    setIsSaving(true);
    let success = false;
    try {
      const templateBlob = await renderKhqrTemplateToBlob({
        qrImageSrc: payment.qrImage,
        merchantName: payment.merchantName || 'Ai-Cha & Zhengda',
        amount: displayAmount,
      });
      if (templateBlob) {
        success = await saveBlobToPhotos(templateBlob, `khqr-${Date.now()}.png`);
      } else {
        success = await saveQrToPhotos(payment.qrImage);
      }
    } catch {
      success = await saveQrToPhotos(payment.qrImage);
    } finally {
      setIsSaving(false);
    }

    if (success) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 5000);
    }
  };

  const handleCancelOrder = async () => {
    setIsCancelling(true);
    setCancelError(null);
    try {
      const res = await apiFetch('/api/payment/aba/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.status === 'cancelled') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setResultState('cancelled');
        setConfirmingCancel(false);
        onCancel?.();
        return;
      }
      if (res.status === 409 && data?.status === 'APPROVED') {
        sessionStorage.removeItem('ai_cha_active_payment');
        setPayment(null);
        onPaidRef.current(data.pickupCode);
        return;
      }
      setCancelError(data?.error || t('cancelFailed', 'Could not cancel order. Please try again.'));
    } catch {
      setCancelError(t('cancelFailed', 'Could not cancel order. Please try again.'));
    } finally {
      setIsCancelling(false);
    }
  };

  const cancelButton = onCancel ? (
    <button
      type="button"
      onClick={() => setConfirmingCancel(true)}
      className="text-sm font-semibold text-tg-hint hover:text-tg-text transition-colors py-2"
    >
      {t('cancel', 'Cancel')}
    </button>
  ) : null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-10">
        <span className="w-8 h-8 rounded-full border-2 border-tg-hint/25 border-t-brand-primary animate-spin" />
        <p className="text-sm text-tg-hint" aria-live="polite">
          {t('preparingPayment', 'Preparing your payment...')}
        </p>
        {cancelButton}
      </div>
    );
  }

  // Payment start failure (distinguished from bank decline and expiry)
  if (startError) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6">
        <div className="w-full bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium">
          {startError === 'unavailable'
            ? t('onlinePaymentUnavailable', 'Online payment is not available right now.')
            : t('paymentStartFailed', 'Could not start the payment. Please try again.')}
        </div>
        {startError === 'unavailable' && (
          <p className="text-sm text-tg-hint">
            {t('orderSavedPayCash', 'Your order is saved. Please pay with cash at the counter.')}
          </p>
        )}
        {startError === 'failed' && (
          <Button onClick={handleRetry} className="w-full">
            {t('tryAgain', 'Try again')}
          </Button>
        )}
        {cancelButton}
      </div>
    );
  }

  // Cancel confirmation dialog
  if (confirmingCancel) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
          <WarningCircle size={36} weight="fill" />
        </div>
        <h3 className="font-bold text-lg text-tg-text">
          {t('confirmCancelPayment', 'Cancel payment?')}
        </h3>
        <p className="text-sm text-tg-hint max-w-xs">
          {t('confirmCancelPaymentHint', 'If you already approved payment in ABA Mobile, please wait a moment for confirmation.')}
        </p>
        {cancelError && (
          <div className="w-full bg-[#E53935]/10 text-[#E53935] text-xs p-3 rounded-xl">
            {cancelError}
          </div>
        )}
        <div className="flex flex-col gap-2 w-full mt-2">
          <Button
            onClick={() => setConfirmingCancel(false)}
            className="w-full"
            disabled={isCancelling}
          >
            {t('keepWaiting', 'Keep waiting')}
          </Button>
          <button
            type="button"
            onClick={handleCancelOrder}
            disabled={isCancelling}
            className="w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-500 font-semibold text-sm hover:bg-rose-500/10 transition-colors"
          >
            {isCancelling ? t('saving', 'Cancelling...') : t('cancelOrder', 'Cancel order')}
          </button>
        </div>
      </div>
    );
  }

  // Result: Declined by bank
  if (resultState === 'declined') {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center">
          <XCircle size={40} weight="fill" />
        </div>
        <h3 className="font-bold text-lg text-tg-text">
          {t('paymentDeclined', 'Payment declined')}
        </h3>
        <p className="text-sm text-tg-hint max-w-xs">
          {t('paymentDeclinedHint', 'Your bank declined this transaction. Please try again or pay with cash.')}
        </p>
        <Button onClick={handleRetry} className="w-full mt-2">
          {t('tryAgain', 'Try again')}
        </Button>
        {cancelButton}
      </div>
    );
  }

  // Result: Cancelled confirmed by server
  if (resultState === 'cancelled') {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-tg-hint/15 text-tg-hint flex items-center justify-center">
          <XCircle size={40} weight="fill" />
        </div>
        <h3 className="font-bold text-lg text-tg-text">
          {t('paymentCancelled', 'Payment cancelled')}
        </h3>
        <p className="text-sm text-tg-hint max-w-xs">
          {t('paymentCancelledDesc', 'Your payment was cancelled and your order has not been placed.')}
        </p>
        {onCancel && (
          <Button onClick={onCancel} className="w-full mt-2">
            {t('backToMenu', 'Back to Menu')}
          </Button>
        )}
      </div>
    );
  }

  // Result: Expired QR confirmed by server
  if (resultState === 'expired' || !payment) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6 animate-in fade-in">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
          <WarningCircle size={40} weight="fill" />
        </div>
        <h3 className="font-bold text-lg text-tg-text">
          {t('paymentExpired', 'This QR code has expired')}
        </h3>
        <p className="text-sm text-tg-hint max-w-xs">
          {t('paymentExpiredHint', 'Your order is still saved. Get a new QR code to pay.')}
        </p>
        <Button onClick={handleRetry} className="w-full mt-2">
          {t('tryAgain', 'Try again')}
        </Button>
        {cancelButton}
      </div>
    );
  }

  // View 2: KHQR Card Template View (Compact & Clean)
  if (isViewingKhqr) {
    return (
      <div className="flex flex-col gap-3 items-center w-full animate-in fade-in duration-200">
        {/* Countdown Timer Badge */}
        <div className="flex items-center gap-1.5 text-xs font-semibold text-tg-text tabular-nums bg-tg-secondary-bg px-3 py-1 rounded-full border border-tg-hint/15 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
          <span>{formatCountdown(secondsLeft)}</span>
        </div>

        {/* Authentic KHQR Card Template - ABA Bank Specification */}
        <div className="w-full max-w-[220px] flex justify-center mt-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 218 316"
            className="w-full h-auto drop-shadow-md select-none rounded-2xl overflow-hidden"
            role="img"
            aria-label="PayWay KHQR payment card"
          >
            <defs>
              <filter
                id="card-shadow"
                x="0"
                y="0"
                width="217.735"
                height="315.735"
                filterUnits="userSpaceOnUse"
                colorInterpolationFilters="sRGB"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix" />
                <feColorMatrix
                  in="SourceAlpha"
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                  result="hardAlpha"
                />
                <feOffset />
                <feGaussianBlur stdDeviation="5.43375" />
                <feComposite in2="hardAlpha" operator="out" />
                <feColorMatrix
                  type="matrix"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.16 0"
                />
                <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow" />
                <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape" />
              </filter>
              <clipPath id="card-clip">
                <path d={CARD_SHELL_PATH} />
              </clipPath>
              <clipPath id="qr-clip">
                <rect id="qr-area" x="37" y="145" width="144" height="144" />
              </clipPath>
            </defs>
            <rect width="218" height="316" fill="#ffffff" />
            <g filter="url(#card-shadow)">
              <path d={CARD_SHELL_PATH} fill="#ffffff" />
            </g>
            <g clipPath="url(#card-clip)">
              <g id="khqr-header-logo" transform="translate(11,11)" aria-label="KHQR logo">
                <path d={KHQR_HEADER_BACKGROUND_PATH} fill={KHQR_RED} />
                {KHQR_HEADER_MARK_PATHS.map((d, i) => (
                  <path key={i} d={d} fill="#ffffff" />
                ))}
              </g>
              <text x="51" y="81" fill="#111111" fontFamily="Arial, Helvetica, sans-serif" fontSize="10">
                {payment.merchantName || 'Ai-Cha & Zhengda'}
              </text>
              <text
                x="51"
                y="108"
                fill="#000000"
                fontFamily="Arial, Helvetica, sans-serif"
                fontSize="20"
                fontWeight="500"
              >
                {formatKhqrAmount(displayAmount)}
              </text>
              <line x1="11" y1="124" x2="207" y2="124" stroke="#8a8a8a" strokeWidth="1" strokeDasharray="4 5" />
              <rect x="37" y="145" width="144" height="144" fill="#ffffff" />
              <g clipPath="url(#qr-clip)">
                <image
                  href={payment.qrImage}
                  x="37"
                  y="145"
                  width="144"
                  height="144"
                  preserveAspectRatio="none"
                />
              </g>
              <g aria-label="KHQR brand mark">
                <circle cx="109" cy="217" r="17" fill="#ffffff" />
                <circle cx="109" cy="217" r="13" fill={KHQR_RED} />
                <path
                  d="M102 213h3v-3h8v3h3v8h-3v3h-8v-3h-3z"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
                <path d="M109 213v8M105 217h8" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        </div>

        {/* Subtitle */}
        <p className="text-[11px] text-tg-hint text-center max-w-[220px] leading-snug">
          {t('scanWithMobileBankingApp', 'Scan with mobile banking app that supports KHQR')}
        </p>

        {/* Status Indicator & Manual Check */}
        <div className="flex flex-col items-center gap-1.5 w-full max-w-[220px]">
          <div className="flex items-center gap-1.5 text-xs text-tg-hint">
            <span className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
            <span>{t('awaitingPaymentConfirmation', 'Awaiting payment confirmation')}</span>
          </div>

          <button
            type="button"
            onClick={() => checkStatusNow(true)}
            disabled={isCheckingStatus}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary py-1 px-3 rounded-full hover:bg-brand-primary/10 transition-colors disabled:opacity-60"
          >
            <ArrowClockwise size={12} className={isCheckingStatus ? 'animate-spin' : ''} />
            <span>{isCheckingStatus ? t('checkingPaymentStatus', 'Checking...') : t('checkStatus', 'Check status')}</span>
          </button>
        </div>

        {networkInterrupted && (
          <div className="w-full max-w-[220px] bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] p-2 rounded-xl border border-amber-500/20 text-center">
            {t('connectionInterrupted', 'Connection interrupted. Tap below to check status.')}
          </div>
        )}

        {/* Button: Save KHQR to Photos */}
        <button
          type="button"
          onClick={handleSaveKhqr}
          disabled={isSaving}
          className={`w-full max-w-[220px] font-bold py-2.5 px-3 text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 ${
            isSaved
              ? 'bg-emerald-600 text-white'
              : 'bg-[#bc271a] text-white hover:bg-[#a52115]'
          }`}
        >
          {isSaving ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : isSaved ? (
            <Check size={16} weight="bold" />
          ) : (
            <DownloadSimple size={16} weight="bold" />
          )}
          <span>{isSaved ? t('khqrSaved', 'Saved!') : t('saveKhqr', 'Save')}</span>
        </button>

        {cancelButton}
      </div>
    );
  }

  // View 1: Main payment options view
  return (
    <div className="flex flex-col items-center w-full min-h-[380px] animate-in fade-in duration-200">
      <div className="w-full flex flex-col items-center">
        {/* Total Amount Badge */}
        <div className="mb-4 text-center">
          <span className="text-xs font-bold text-tg-hint uppercase tracking-wider">
            {t('total', 'Total')}
          </span>
          <div className="text-3xl font-black text-tg-text mt-0.5">
            {formatKhqrAmount(displayAmount)}
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-5">
          <h3 className="font-bold text-lg mb-1 text-tg-text">
            {t('completePayment', 'Complete Payment')}
          </h3>
          <p className="text-sm text-tg-hint">
            {t('completePaymentHint', 'Pay directly with ABA Mobile or save KHQR to scan in any bank app.')}
          </p>
        </div>

        {/* Status Indicator & Manual Check */}
        <div className="flex flex-col items-center gap-1.5 mb-4">
          <div className="flex items-center gap-1.5 text-xs text-tg-hint">
            <span className="w-2 h-2 rounded-full bg-brand-primary animate-ping" />
            <span>{t('awaitingPaymentConfirmation', 'Awaiting payment confirmation')}</span>
          </div>

          <button
            type="button"
            onClick={() => checkStatusNow(true)}
            disabled={isCheckingStatus}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary py-1 px-3 rounded-full hover:bg-brand-primary/10 transition-colors disabled:opacity-60"
          >
            <ArrowClockwise size={12} className={isCheckingStatus ? 'animate-spin' : ''} />
            <span>{isCheckingStatus ? t('checkingPaymentStatus', 'Checking...') : t('checkStatus', 'Check status')}</span>
          </button>
        </div>

        {networkInterrupted && (
          <div className="w-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs p-2.5 rounded-xl border border-amber-500/20 text-center mb-3">
            {t('connectionInterrupted', 'Connection interrupted. Tap below to check status.')}
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-3">
          {/* Option 1: Pay directly with ABA Mobile */}
          {payment.abapayDeeplink && (
            <button
              type="button"
              onClick={handleOpenAbaPayment}
              className="w-full bg-tg-secondary-bg hover:bg-tg-hint/5 border border-tg-hint/15 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-98 shadow-sm text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Official ABA Bank Logo */}
                <img
                  src="/images/aba-logo.png"
                  alt="ABA Mobile"
                  className="w-12 h-12 rounded-2xl shrink-0 shadow-sm object-cover"
                />
                <div className="min-w-0">
                  <div className="font-bold text-base text-tg-text">{t('payWithAba', 'ABA Mobile')}</div>
                  <div className="text-xs text-tg-hint mt-0.5 truncate">
                    {t('payWithAbaDesc', 'Tap to open & pay instantly in ABA app')}
                  </div>
                </div>
              </div>
              <CaretRight size={20} className="text-tg-hint shrink-0 ml-2" />
            </button>
          )}
          {abaLaunchHint && (
            <p className="text-xs leading-5 text-tg-hint px-1 -mt-1">
              {abaLaunchHint}
            </p>
          )}

          {/* Option 2: ABA KHQR Card Button */}
          <button
            type="button"
            onClick={() => setIsViewingKhqr(true)}
            className="w-full bg-tg-secondary-bg hover:bg-tg-hint/5 border border-tg-hint/15 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-98 shadow-sm text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Red KHQR Badge Icon */}
              <div className="w-12 h-12 rounded-2xl bg-[#bc271a] flex items-center justify-center shrink-0 shadow-sm p-2">
                <KhqrLogo className="w-full h-auto text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base text-tg-text">{t('abaKhqr', 'ABA KHQR')}</div>
                <div className="text-xs text-tg-hint mt-0.5 truncate">
                  {t('scanToPayWithBankApp', 'Scan to pay with any bank app')}
                </div>
              </div>
            </div>
            <CaretRight size={20} className="text-tg-hint shrink-0 ml-2" />
          </button>
        </div>
      </div>

      {/* Bottom Footer links: ABA Mobile is not installed? & Cancel */}
      <div className="w-full flex flex-col items-center gap-3 mt-auto pt-6">
        {(payment.playStoreUrl || payment.appStoreUrl) && (
          <div className="text-center text-xs text-tg-hint">
            <p>{t('abaNotInstalled', 'ABA Mobile is not installed?')}</p>
            <div className="mt-1 flex justify-center gap-3 font-semibold text-brand-primary">
              {payment.playStoreUrl && <a href={payment.playStoreUrl} target="_blank" rel="noreferrer">Google Play</a>}
              {payment.appStoreUrl && <a href={payment.appStoreUrl} target="_blank" rel="noreferrer">App Store</a>}
            </div>
          </div>
        )}

        {cancelButton}
      </div>
    </div>
  );
}
