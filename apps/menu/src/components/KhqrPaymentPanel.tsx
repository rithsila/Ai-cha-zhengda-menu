import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadSimple, Check, CaretRight, CaretLeft } from '@phosphor-icons/react';
import { Button } from './ui/Button';
import { apiFetch } from '../utils/api';
import { markOnlinePaymentAvailable, markOnlinePaymentUnavailable } from '../utils/onlinePayment';

/** Seconds -> "m:ss" for the KHQR countdown. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Official KHQR Vector Logo (from Wikimedia Commons / NBC Bakong) */
function KhqrLogo({ className = "h-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 3000 710"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="m 0,0.03316065 h 130.12116 l 0.014,318.13267935 C 233.74068,213.55008 443.94173,2.5596428 444.48677,1.0664481 444.9679,-0.25167388 599.68926,-0.32516983 599.68926,0.99272374 486.57317,115.28505 371.72975,227.87418 257.21308,340.76853 c 20.97523,21.33678 282.3634,288.92492 357.65314,368.20425 0.65411,0.68876 -1.66382,0.99992 -77.17034,0.99992 H 459.73294 L 336.53629,585.72505 C 192.18995,440.14727 131.5997,379.75815 130.74116,379.75815 c -0.97346,110.06303 -0.62,220.14479 -0.62,330.21455 H 0 Z M 1208.4296,400.10055 H 842.95884 V 709.9727 H 716.79789 L 716.22858,0.03316065 H 842.95884 V 297.25838 H 1208.4296 V 0.10393571 L 1335.1563,0 v 709.9727 h -126.7267 z m 1514.243,188.60833 c -66.7198,-66.68699 -121.2089,-121.26394 -121.0692,-121.29991 0.1397,-0.036 35.4501,0.18884 78.4672,0.49963 l 78.2133,0.56505 86.4183,85.46964 c 137.7689,136.25637 155.0701,156.03188 154.7403,156.02941 -0.4084,-0.003 -103.6312,-0.51832 -155.4465,0 z M 1560.4467,709.97304 c -16.1379,-0.55379 -32.9532,-10.24556 -46.6705,-19.51539 -6.9569,-4.70134 -19.2747,-16.38202 -26.5809,-25.20617 -5.9447,-7.17977 -15.0496,-25.92873 -18.2971,-37.67776 l -3.055,-11.05251 -0.3309,-256.54041 c -0.359,-278.392633 -0.5867,-266.806561 5.6132,-285.669744 6.3968,-19.462404 20.5256,-39.027764 37.2996,-51.652247 11.1554,-8.39579 20.5183,-13.2107146 35.4908,-18.2513305 l 11.3149,-3.8092509 261.205,-0.29674884 261.205,-0.29674882 11.3309,2.86097216 c 14.8478,3.7488926 26.437,8.6527199 36.7824,15.5638289 20.3137,13.570359 35.5357,32.794807 42.7843,54.033877 6.4483,18.89392 6.1728,5.744005 6.1777,294.858942 v 266.14221 l -55.4189,-55.344 -55.4191,-55.344 -0.3093,-175.76404 c -0.291,-167.92384 -0.3987,-176.04133 -2.4096,-181.97982 -8.8441,-26.11777 -26.8665,-43.73799 -52.2413,-51.0754 l -9.0122,-2.60596 h -181.6039 -181.6039 l -7.3546,2.62867 c -12.3916,4.42895 -21.5422,10.21361 -30.5502,19.31286 -9.677,9.77482 -15.9266,19.7384 -19.5545,31.17478 l -2.5095,7.91094 v 181.38648 c 0,143.66042 0.3021,182.67929 1.4523,187.60223 0.7989,3.41864 3.6817,10.79277 6.4062,16.38694 8.578,17.61255 21.6642,29.51025 40.3928,36.72405 7.7117,2.97044 11.4807,3.67874 23.4647,4.40965 7.8524,0.47892 86.6496,0.72975 175.1047,0.55739 88.4552,-0.17235 162.086,0.0394 163.6242,0.47031 1.5395,0.43146 27.3682,25.03821 57.466,54.74757 l 54.6697,55.30949 h -264.6848 c -145.5766,0 -272.4039,0.0612 -274.1782,3.4e-4 z m 825.7135,-1.19632 c -26.9307,-3.11842 -54.2309,-19.77939 -71.1259,-41.95624 -11.6294,-15.26477 -17.997,-29.27579 -21.0351,-46.28374 -1.9276,-10.79088 -2.2975,-251.84349 -0.4287,-279.39581 3.9643,-58.45084 14.914,-100.14281 38.5348,-146.72478 23.4952,-46.33445 54.5203,-84.65461 93.8058,-115.863057 56.046,-44.522955 118.0676,-69.6753622 189.5243,-76.8600649 50.7725,-5.1049871 107.4757,2.901448 158.9994,22.4505889 18.2153,6.911221 49.0282,22.704492 65.0829,33.358531 28.5306,18.933106 61.4883,48.706502 81.5007,73.626512 34.6076,43.09443 60.4913,97.70145 71.1609,150.12886 4.2544,20.90466 9.2611,68.41547 7.4337,70.54076 -0.4059,0.47222 -25.4026,0.7265 -55.5478,0.56508 l -54.8096,-0.29351 -0.8411,-12.43146 c -1.7656,-26.10028 -7.7173,-54.37893 -14.9847,-71.19845 -0.8057,-1.86472 -3.1133,-7.20461 -5.1278,-11.86641 -18.9374,-43.82127 -52.4615,-82.6438 -93.4721,-108.24536 -72.0624,-44.98604 -158.5339,-49.629366 -235.2042,-12.62994 -60.7818,29.33194 -108.1942,85.64793 -126.5514,150.31634 -9.6873,34.12675 -8.9807,16.73362 -9.4418,231.33736 l -0.4139,192.62077 c -6.3032,-0.0934 -17.0584,-1.19598 -17.0584,-1.19598 z M 1715.9021,485.02273 c -9.8918,-3.24648 -19.6413,-11.95632 -24.217,-21.63467 l -2.9387,-6.21574 V 354.8952 252.61809 l 2.8287,-5.5517 c 4.2081,-8.259 11.6883,-15.94802 19.0063,-19.53718 l 6.4522,-3.16448 h 101.2682 101.2682 l 6.7317,2.70833 c 8.4892,3.41539 16.2362,10.59855 20.5044,19.01219 l 3.3141,6.53284 0.5658,116.21582 c 0.3111,63.9187 0.3536,116.42756 0.094,116.68633 -0.7905,0.78894 -232.4534,0.29825 -234.8781,-0.49751 z"
      />
    </svg>
  );
}

/**
 * Save KHQR image to the user's photo library or file downloads.
 * Uses Web Share API on mobile (iOS/Android) for direct Save to Photos,
 * Telegram WebApp downloadFile when available, and standard blob download fallback.
 */
async function saveQrToPhotos(qrImageSrc: string): Promise<boolean> {
  try {
    // 1. If inside Telegram Mini App with downloadFile support
    const tg = (window as unknown as { Telegram?: { WebApp?: { downloadFile?: (params: { url: string; file_name: string }) => void } } })
      .Telegram?.WebApp;
    if (tg?.downloadFile && (qrImageSrc.startsWith('http://') || qrImageSrc.startsWith('https://'))) {
      tg.downloadFile({
        url: qrImageSrc,
        file_name: `khqr-${Date.now()}.png`,
      });
      return true;
    }

    // 2. Fetch image data into a blob / file
    const res = await fetch(qrImageSrc);
    const blob = await res.blob();
    const file = new File([blob], `khqr-${Date.now()}.png`, { type: blob.type || 'image/png' });

    // 3. Web Share API (native iOS / Android prompt with "Save Image" to Photos)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'Ai-Cha KHQR Payment',
      });
      return true;
    }

    // 4. Standard browser download fallback
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `khqr-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    return true;
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'name' in err && (err as { name: string }).name === 'AbortError') {
      return false;
    }
    console.error('Failed to save KHQR image:', err);
    return false;
  }
}

interface KhqrPaymentPanelProps {
  orderId: string;
  totalAmount?: number;
  onPaid: (pickupCode: string) => void;
  onCancel?: () => void;
  /** Way out when online payment fails, so the customer is never stuck. */
  onUseCash?: () => void;
}

/**
 * The ABA KHQR payment screen for one existing order.
 *
 * It owns the whole payment lifecycle: it creates the ABA payment itself on
 * mount, polls for confirmation, runs the expiry countdown and offers a retry.
 * Customers can pay directly via ABA Mobile or open the official KHQR template
 * card to scan or save to their photo library.
 */
export function KhqrPaymentPanel({ orderId, totalAmount, onPaid, onCancel, onUseCash }: KhqrPaymentPanelProps) {
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
  const [expired, setExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isViewingKhqr, setIsViewingKhqr] = useState(false);
  // 'unavailable' means the shop has no online payment set up yet; 'failed' is a normal error.
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);
  // Bumped by "Try again" to ask for a fresh QR for the same order.
  const [attempt, setAttempt] = useState(0);

  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // Create (or re-create) the ABA payment for this order.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPayment(null);
    setExpired(false);
    setIsSaved(false);

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
            if (!cancelled) setError('unavailable');
            return;
          }
          if (!cancelled) setError('failed');
          return;
        }

        const data = await res.json();
        markOnlinePaymentAvailable();
        if (cancelled) return;
        setPayment({
          abapayDeeplink: data.abapayDeeplink,
          appStoreUrl: data.appStoreUrl,
          playStoreUrl: data.playStoreUrl,
          qrImage: data.qrImage,
          amount: data.amount,
          merchantName: data.merchantName,
          expiresAt: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 15 * 60 * 1000,
        });
      } catch {
        if (cancelled) return;
        setError('failed');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orderId, attempt]);

  // Poll status from server
  useEffect(() => {
    if (!payment || expired) return;
    let cancelled = false;

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/payment/aba/status/${orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.status === 'APPROVED') {
          setPayment(null);
          onPaidRef.current(data.pickupCode);
        } else if (data.status === 'EXPIRED' || data.status === 'DECLINED') {
          setExpired(true);
        }
      } catch {}
    }, 3000);

    return () => { cancelled = true; clearInterval(interval); };
  }, [orderId, payment, expired]);

  // Countdown timer
  useEffect(() => {
    if (!payment) return;

    const tick = () => {
      const left = Math.max(0, Math.round((payment.expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setExpired(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [payment]);

  const handleRetry = () => setAttempt(a => a + 1);

  const handleSaveKhqr = async () => {
    if (!payment?.qrImage || isSaving) return;
    setIsSaving(true);
    const success = await saveQrToPhotos(payment.qrImage);
    setIsSaving(false);
    if (success) {
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 5000);
    }
  };

  const cancelButton = onCancel ? (
    <button
      type="button"
      onClick={onCancel}
      className="text-sm font-semibold text-tg-hint hover:text-tg-text transition-colors py-2"
    >
      {t('cancel', 'Cancel')}
    </button>
  ) : null;

  const cashButton = onUseCash ? (
    <button
      type="button"
      onClick={onUseCash}
      className="w-full rounded-xl border border-brand-primary/30 bg-brand-primary/10 py-3 text-sm font-bold text-brand-primary active:scale-95 transition-transform"
    >
      {t('payWithCashInstead', 'Pay with cash instead')}
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

  if (error) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6">
        <div className="w-full bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium">
          {error === 'unavailable'
            ? t('onlinePaymentUnavailable', 'Online payment is not available right now.')
            : t('paymentStartFailed', 'Could not start the payment. Please try again.')}
        </div>
        {error === 'unavailable' && (
          <p className="text-sm text-tg-hint">
            {t('orderSavedPayCash', 'Your order is saved. Please pay with cash at the counter.')}
          </p>
        )}
        {error === 'failed' && (
          <Button onClick={handleRetry} className="w-full">
            {t('tryAgain', 'Try again')}
          </Button>
        )}
        {cashButton}
        {cancelButton}
      </div>
    );
  }

  if (!payment || expired) {
    return (
      <div className="flex flex-col gap-4 items-center w-full text-center py-6">
        <h3 className="font-bold text-lg text-tg-text">
          {t('paymentExpired', 'This QR code has expired')}
        </h3>
        <p className="text-sm text-tg-hint">
          {t('paymentExpiredHint', 'Your order is still saved. Get a new QR code to pay.')}
        </p>
        <Button onClick={handleRetry} className="w-full mt-2">
          {t('tryAgain', 'Try again')}
        </Button>
        {cashButton}
        {cancelButton}
      </div>
    );
  }

  const displayAmount = payment.amount ?? totalAmount ?? 0;

  // View 2: KHQR Card Template View (Compact & Clean)
  if (isViewingKhqr) {
    return (
      <div className="flex flex-col gap-3 items-center w-full animate-in fade-in duration-200">
        {/* Top Header bar with Back button, Title & Timer */}
        <div className="w-full flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setIsViewingKhqr(false)}
            className="w-8 h-8 rounded-full bg-tg-secondary-bg flex items-center justify-center text-tg-text active:scale-90 transition-transform"
            aria-label={t('back', 'Back')}
          >
            <CaretLeft size={20} weight="bold" />
          </button>

          <h3 className="font-bold text-base text-tg-text">
            {t('abaKhqr', 'ABA KHQR')}
          </h3>

          <div className="flex items-center gap-1.5 text-xs font-semibold text-tg-text tabular-nums bg-tg-secondary-bg px-2.5 py-1 rounded-full border border-tg-hint/15">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
            <span>{formatCountdown(secondsLeft)}</span>
          </div>
        </div>

        {/* Authentic KHQR Card Template - Compact Size */}
        <div className="w-full max-w-[220px] bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden relative text-gray-900 mt-1">
          {/* Top Red Header with Exact Wikimedia KHQR Logo and Signature Downward Flap */}
          <div
            className="w-full bg-[#E21A1A] text-white pt-2.5 pb-4 px-3 flex items-center justify-center relative"
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 84% 75%, 0 75%)',
            }}
          >
            <div className="pb-1.5 flex items-center justify-center w-full max-w-[95px]">
              <KhqrLogo className="w-full h-auto text-white" />
            </div>
          </div>

          {/* Merchant Name & Amount */}
          <div className="pt-1.5 pb-0.5 px-3 text-center">
            <p className="text-[11px] text-gray-600 font-semibold truncate">
              {payment.merchantName || 'Ai-Cha & Zhengda'}
            </p>
            <p className="font-black text-lg text-gray-900 mt-0.5 flex items-baseline justify-center gap-1">
              <span>{displayAmount.toFixed(2)}</span>
              <span className="text-[10px] font-bold text-gray-500">USD</span>
            </p>
          </div>

          {/* Dashed Line Separator with Side Circular Cutouts */}
          <div className="relative my-1.5">
            <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-tg-bg" />
            <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-tg-bg" />
            <div className="border-b border-dashed border-gray-300 mx-4" />
          </div>

          {/* QR Code Container */}
          <div className="p-2 pb-3 flex items-center justify-center">
            <img
              src={payment.qrImage}
              alt="KHQR"
              className="w-full max-w-[155px] h-auto object-contain"
            />
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-[11px] text-tg-hint text-center max-w-[220px] leading-snug">
          {t('scanWithMobileBankingApp', 'Scan with mobile banking app that supports KHQR')}
        </p>

        {/* Button: Save KHQR to Photos */}
        <button
          type="button"
          onClick={handleSaveKhqr}
          disabled={isSaving}
          className={`w-full max-w-[220px] font-bold py-2.5 px-3 text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-98 ${
            isSaved
              ? 'bg-emerald-600 text-white'
              : 'bg-[#E21A1A] text-white hover:bg-[#D32323]'
          }`}
        >
          {isSaving ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : isSaved ? (
            <Check size={16} weight="bold" />
          ) : (
            <DownloadSimple size={16} weight="bold" />
          )}
          <span>{isSaved ? t('khqrSaved', 'KHQR saved to photos!') : t('saveKhqr', 'Save KHQR to Photos')}</span>
        </button>

        {cancelButton}
      </div>
    );
  }

  // View 1: Main payment options view
  return (
    <div className="flex flex-col justify-between flex-1 w-full min-h-[380px] gap-6">
      <div className="flex flex-col gap-4 items-center w-full">
        <div className="text-center">
          <h3 className="font-bold text-lg mb-1 text-tg-text">
            {t('completePayment', 'Complete Payment')}
          </h3>
          <p className="text-sm text-tg-hint">
            {t('completePaymentHint', 'Pay directly with ABA Mobile or save KHQR to scan in any bank app.')}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          {/* Button 1: Pay directly with ABA Mobile */}
          {payment.abapayDeeplink && (
            <button
              type="button"
              onClick={() => { window.location.href = payment.abapayDeeplink!; }}
              className="w-full bg-[#005E8E] text-white font-bold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#004A70] active:scale-98 transition-all shadow-sm"
            >
              <span className="text-base">📱</span>
              <span>{t('payWithAba', 'Pay with ABA Mobile')}</span>
            </button>
          )}

          {/* Button 2: ABA KHQR Card Button */}
          <button
            type="button"
            onClick={() => setIsViewingKhqr(true)}
            className="w-full bg-tg-secondary-bg hover:bg-tg-hint/5 border border-tg-hint/15 rounded-2xl p-4 flex items-center justify-between transition-all active:scale-98 shadow-sm text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Red KHQR Badge Icon */}
              <div className="w-13 h-13 rounded-2xl bg-[#E21A1A] flex items-center justify-center shrink-0 shadow-sm p-2">
                <KhqrLogo className="w-full h-auto text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base text-tg-text">{t('abaKhqr', 'ABA KHQR')}</div>
                <div className="text-xs text-tg-hint mt-0.5 truncate">
                  {t('scanToPayWithBankApp', 'Scan to pay with member bank app')}
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
