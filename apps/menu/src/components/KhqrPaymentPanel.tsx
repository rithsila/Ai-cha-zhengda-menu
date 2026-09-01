import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { apiFetch } from '../utils/api';
import { markOnlinePaymentAvailable, markOnlinePaymentUnavailable } from '../utils/onlinePayment';

/** Seconds -> "m:ss" for the KHQR countdown. */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** A desktop browser cannot open ABA Mobile's custom URL scheme. */
function isMobilePayer(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

interface KhqrPaymentPanelProps {
  orderId: string;
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
 * The caller only has to render it with an order id and handle `onPaid`, so
 * checkout and "pay for an unpaid order later" share exactly the same rules.
 *
 * Renders panel contents only — no modal chrome, no backdrop. The caller
 * supplies the container.
 */
export function KhqrPaymentPanel({ orderId, onPaid, onCancel, onUseCash }: KhqrPaymentPanelProps) {
  const { t } = useTranslation();
  const mobilePayer = isMobilePayer();

  const [payment, setPayment] = useState<{
    abapayDeeplink?: string;
    appStoreUrl?: string;
    playStoreUrl?: string;
    qrImage: string;
    expiresAt: number;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // 'unavailable' means the shop has no online payment set up yet, so retrying
  // can never help; 'failed' is a normal error worth trying again.
  const [error, setError] = useState<'unavailable' | 'failed' | null>(null);
  // Bumped by "Try again" to ask for a fresh QR for the same order.
  const [attempt, setAttempt] = useState(0);

  // Kept in refs so a re-render of the parent (or a language switch) never
  // restarts the payment or resets the polling interval.
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // Create (or re-create) the ABA payment for this order.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPayment(null);
    setExpired(false);

    (async () => {
      try {
        const res = await apiFetch('/api/payment/aba/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });

        if (!res.ok) {
          // 503 = the shop has not added its ABA credentials. Remember that so
          // the KHQR option hides itself everywhere until it starts working.
          if (res.status === 503) {
            markOnlinePaymentUnavailable();
            if (!cancelled) setError('unavailable');
            return;
          }
          // The server's own message names internal config and is written for
          // developers, so it never reaches the customer.
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

  // Ask the server to check with ABA. Polling the order row alone is not enough:
  // ABA's webhook cannot reach a machine on localhost, so in development the
  // order would stay "pending" forever and this screen would spin.
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

  // Countdown on the QR. ABA gives the customer about 15 minutes.
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
        {/* Retrying a missing setup can never work, so it is only offered for
            errors that might pass on a second try. */}
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

  return (
    <div className="flex flex-col gap-6 items-center w-full">
      <div className="text-center">
        <h3 className="font-bold text-lg mb-2 text-tg-text">
          {t('completePayment', 'Complete Payment')}
        </h3>
        <p className="text-sm text-tg-hint mb-4">
          {t('completePaymentHint', 'You can pay with ABA Mobile or scan the KHQR below.')}
        </p>
      </div>

      {mobilePayer && payment.abapayDeeplink && (
        <button
          onClick={() => { window.location.href = payment.abapayDeeplink!; }}
          className="w-full bg-[#005E8E] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#004A70] transition-colors"
        >
          {t('payWithAba', 'Open ABA Mobile')}
        </button>
      )}

      <div className="relative w-full max-w-[280px] bg-white p-4 rounded-2xl shadow-sm border border-tg-hint/15 mt-4 flex items-center justify-center">
        <img src={payment.qrImage} alt="KHQR" className="w-full max-w-[250px] h-auto" />
      </div>

      {(payment.playStoreUrl || payment.appStoreUrl) && (
        <div className="text-center text-xs text-tg-hint">
          <p>{t('abaNotInstalled', 'ABA Mobile is not installed?')}</p>
          <div className="mt-1 flex justify-center gap-3 font-semibold text-brand-primary">
            {payment.playStoreUrl && <a href={payment.playStoreUrl} target="_blank" rel="noreferrer">Google Play</a>}
            {payment.appStoreUrl && <a href={payment.appStoreUrl} target="_blank" rel="noreferrer">App Store</a>}
          </div>
        </div>
      )}

      <p className="text-sm font-semibold text-tg-text tabular-nums" aria-live="polite">
        {t('timeRemaining', 'Time remaining')}: {formatCountdown(secondsLeft)}
      </p>

      <p className="text-xs text-tg-hint text-center flex items-center justify-center gap-2 animate-pulse">
        <span className="w-2 h-2 rounded-full bg-brand-primary"></span>
        {t('waitingForPayment', 'Waiting for payment confirmation...')}
      </p>

      {cancelButton}
    </div>
  );
}
