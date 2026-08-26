import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  Money,
  Receipt,
  Clock,
  CheckCircle,
  X,
  Sparkle,
} from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';
import { useOnlinePaymentState } from '../utils/onlinePayment';
import { formatCurrency } from '../utils/format';
import {
  getDefaultPaymentMethod,
  setDefaultPaymentMethod,
  type PaymentMethod,
} from '../utils/paymentPrefs';
import { KhqrPaymentPanel } from './KhqrPaymentPanel';

interface PaymentOrderItem {
  id: string;
  quantity: number;
}

interface PaymentOrder {
  id: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  pickupCode: string | null;
  transactionId?: string | null;
  pointsEarned?: number | null;
  cancelReason?: string | null;
  items: PaymentOrderItem[];
}

/** How many past orders we show at once. */
const HISTORY_LIMIT = 20;

/** First 6 characters of the order id, so the customer can read it out loud. */
function shortRef(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

/** Short, readable date like "19 Aug, 14:05". */
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

/** Total number of drinks/food in an order. */
function itemCount(order: PaymentOrder): number {
  if (!Array.isArray(order.items)) return 0;
  return order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

interface PaymentViewProps {
  onBrowseMenu?: () => void;
}

export function PaymentView({ onBrowseMenu }: PaymentViewProps) {
  const { t } = useTranslation();
  // Payments and history belong to one account, so a guest has nothing here.
  const signedIn = hasIdentity();
  const khqrOffered = useOnlinePaymentState() === 'available';
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paidCode, setPaidCode] = useState<string | null>(null);
  const [defaultMethod, setMethod] = useState<PaymentMethod>(() => getDefaultPaymentMethod());

  // The panel polls on its own, so we stop our poll while it is open.
  const panelOpenRef = useRef(false);
  panelOpenRef.current = selectedOrderId !== null;

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch(ME.orders());
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    fetchOrders();
    const interval = setInterval(() => {
      if (!panelOpenRef.current) fetchOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders, signedIn]);

  const handlePaid = useCallback(
    (pickupCode: string) => {
      setSelectedOrderId(null);
      setPaidCode(pickupCode);
      fetchOrders();
    },
    [fetchOrders]
  );

  // Keep the saved preference honest: KHQR cannot be the default while the
  // shop has no online payment.
  useEffect(() => {
    if (!khqrOffered && defaultMethod === 'khqr') {
      setMethod('cash');
      setDefaultPaymentMethod('cash');
    }
  }, [khqrOffered, defaultMethod]);

  const handleChangeMethod = (method: PaymentMethod) => {
    setMethod(method);
    setDefaultPaymentMethod(method);
  };

  // Every pending order belongs here, not just the KHQR ones. A pending cash
  // order has nothing to pay online, but it still is not paid -- filtering it
  // out of both this section and the history below made it vanish entirely.
  //
  // The server cancels an unpaid KHQR order once its QR expires, so an order can
  // leave this list on its own between two polls. That is correct: a cancelled
  // order must never offer a way to pay, and it drops into the history below,
  // where it is marked cancelled rather than dressed up as a past payment.
  const unpaid = orders.filter(o => o.status === 'pending');
  const history = orders.filter(o => o.status !== 'pending');
  const shownHistory = history.slice(0, HISTORY_LIMIT);

  if (!signedIn) {
    return (
      <SignInPrompt
        what={t('signInForPayments', 'Open the shop from our Telegram bot to pay for orders and see your payment history.')}
        onBrowseMenu={onBrowseMenu}
      />
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="p-8 text-center text-tg-hint animate-pulse">
        {t('loadingPayments', 'Loading your payments...')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      {/* Success banner after a payment is approved */}
      <AnimatePresence>
        {paidCode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-green-500/15 border border-green-500/30 rounded-2xl p-4 flex items-start gap-3"
          >
            <CheckCircle size={24} weight="fill" className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-bold text-tg-text">{t('paymentDone', 'Payment done')}</h3>
              <p className="text-sm text-tg-hint">
                {t('showThisCode', 'Show this code at the counter:')}
              </p>
              <p className="mt-2 font-mono font-black text-lg text-tg-text bg-tg-bg inline-block px-3 py-1 rounded-lg">
                {paidCode}
              </p>
            </div>
            <button
              onClick={() => setPaidCode(null)}
              aria-label={t('close', 'Close')}
              className="text-tg-hint p-1 active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section A: orders still waiting for payment */}
      {unpaid.length > 0 && (
        <section>
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-tg-text">
            <Clock size={22} weight="fill" className="text-brand-primary" />
            {t('needsPayment', 'Needs payment')}
          </h3>
          <p className="text-sm text-tg-hint mb-3">
            {t('needsPaymentHint', 'These orders are not paid yet.')}
          </p>

          <div className="grid gap-3">
            {unpaid.map(order => (
              <div
                key={order.id}
                className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-tg-text font-mono">#{shortRef(order.id)}</p>
                    <p className="text-xs text-tg-hint mt-1">
                      {itemCount(order)} {t('items', 'items')} · {shortDate(order.createdAt)}
                    </p>
                  </div>
                  <p className="font-bold text-tg-text whitespace-nowrap">
                    {formatCurrency(order.totalAmount)}
                  </p>
                </div>

                {order.paymentMethod === 'cash' || !khqrOffered ? (
                  // Cash is paid at the counter, so there is no button to press
                  // here. Show the pickup code instead -- that is what the
                  // customer actually needs at the shop. An unpaid KHQR order
                  // lands here too while online payment is switched off, so the
                  // customer never taps a button that cannot work.
                  <div className="mt-3 flex items-start gap-2 rounded-xl bg-tg-hint/10 p-3">
                    <Money size={18} weight="fill" className="text-tg-hint flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-tg-text">
                        {t('payCashAtCounter', 'Pay with cash when you pick up')}
                      </p>
                      {order.paymentMethod !== 'cash' && (
                        <p className="text-xs text-tg-hint mt-1">
                          {t('onlinePaymentUnavailable', 'Online payment is not available right now.')}
                        </p>
                      )}
                      {order.pickupCode && (
                        <p className="text-xs text-tg-hint mt-1">
                          {t('showThisCode', 'Show this code at the counter:')}{' '}
                          <span className="font-mono font-bold text-tg-text">{order.pickupCode}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setPaidCode(null);
                      setSelectedOrderId(order.id);
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary text-white font-bold active:scale-95 transition-transform"
                  >
                    <CreditCard size={18} weight="fill" />
                    {t('payNow', 'Pay now')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section B: past payments */}
      <section>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-tg-text">
          <Receipt size={22} weight="fill" className="text-brand-primary" />
          {t('paymentHistory', 'Payment history')}
        </h3>

        {shownHistory.length === 0 ? (
          <div className="text-center p-8 bg-tg-secondary-bg rounded-2xl text-tg-hint border border-tg-hint/10">
            {unpaid.length === 0
              ? t('noPaymentsYet', 'No payments yet. Your paid orders will show up here.')
              : t('noPastPayments', 'No past payments yet.')}
          </div>
        ) : (
          <div className="grid gap-3">
            {shownHistory.map(order => {
              // A cancelled order is not a payment. Showing it with a payment
              // badge, a pickup code and points would tell the customer they
              // bought something they did not.
              const cancelled = order.status === 'cancelled';
              return (
              <div
                key={order.id}
                className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {cancelled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 dark:text-red-400">
                          <X size={14} weight="bold" />
                          {t('orderCancelled', 'Cancelled')}
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
                            order.paymentMethod === 'cash'
                              ? 'bg-tg-hint/15 text-tg-hint'
                              : 'bg-brand-primary/10 text-brand-primary'
                          }`}
                        >
                          {order.paymentMethod === 'cash' ? (
                            <Money size={14} weight="fill" />
                          ) : (
                            <CreditCard size={14} weight="fill" />
                          )}
                          {order.paymentMethod === 'cash' ? t('cash', 'Cash') : t('khqr', 'KHQR')}
                        </span>
                      )}
                      <span className="text-xs font-mono text-tg-hint">#{shortRef(order.id)}</span>
                    </div>
                    <p className="text-xs text-tg-hint mt-2">{shortDate(order.createdAt)}</p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`font-bold whitespace-nowrap ${
                        cancelled ? 'text-tg-hint line-through' : 'text-tg-text'
                      }`}
                    >
                      {formatCurrency(order.totalAmount)}
                    </p>
                    {!cancelled && order.pickupCode && (
                      <p className="text-xs font-mono font-bold mt-1 bg-tg-bg px-2 py-1 rounded">
                        {t('code', 'Code')}: {order.pickupCode}
                      </p>
                    )}
                  </div>
                </div>

                {cancelled ? (
                  <div className="mt-2 text-xs">
                    {order.cancelReason ? (
                      <p className="font-semibold text-rose-500">
                        Reason: {order.cancelReason}
                      </p>
                    ) : null}
                    <p className="text-tg-hint">
                      {t('cancelledNotCharged', 'This order was cancelled. You were not charged.')}
                    </p>
                  </div>
                ) : (
                  (order.pointsEarned ?? 0) > 0 && (() => {
                    const stamps = (order.pointsEarned ?? 0) / 10;
                    const displayCount = stamps % 1 === 0 ? stamps : stamps.toFixed(1);
                    return (
                      <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-primary bg-brand-primary/10 px-2 py-1 rounded-lg">
                        <Sparkle size={14} weight="fill" />
                        +{displayCount} {stamps === 1 ? t('stamp', 'stamp') : t('stamps', 'stamps')}
                      </p>
                    );
                  })()
                )}
              </div>
              );
            })}
          </div>
        )}

        {history.length > HISTORY_LIMIT && (
          <p className="text-xs text-tg-hint text-center mt-3">
            {t('historyTruncated', 'Showing your last 20 payments only.')}
          </p>
        )}
      </section>

      {/* Section C: default payment method */}
      <section>
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-tg-text">
          <CreditCard size={22} weight="fill" className="text-brand-primary" />
          {t('defaultPaymentMethod', 'Default payment method')}
        </h3>
        <p className="text-sm text-tg-hint mb-3">
          {t('defaultPaymentHint', 'We pick this for you at checkout. You can still change it there.')}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {([
            ...(khqrOffered
              ? [{ key: 'khqr' as const, label: t('khqr', 'KHQR'), Icon: CreditCard }]
              : []),
            { key: 'cash' as const, label: t('cash', 'Cash'), Icon: Money },
          ]).map(({ key, label, Icon }) => {
            const active = defaultMethod === key;
            return (
              <button
                key={key}
                onClick={() => handleChangeMethod(key)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 py-4 rounded-2xl border font-bold text-sm transition-colors active:scale-95 ${
                  active
                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                    : 'bg-tg-secondary-bg border-tg-hint/10 text-tg-text'
                }`}
              >
                <Icon size={24} weight="fill" />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* QR sheet */}
      <AnimatePresence>
        {selectedOrderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
            onClick={() => setSelectedOrderId(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full sm:max-w-md bg-tg-bg rounded-t-3xl sm:rounded-3xl p-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-tg-text">{t('payWithKhqr', 'Pay with KHQR')}</h3>
                <button
                  onClick={() => setSelectedOrderId(null)}
                  aria-label={t('close', 'Close')}
                  className="p-2 rounded-full text-tg-hint active:scale-90 transition-transform"
                >
                  <X size={20} />
                </button>
              </div>

              <KhqrPaymentPanel
                orderId={selectedOrderId}
                onPaid={handlePaid}
                onCancel={() => setSelectedOrderId(null)}
                onUseCash={() => setSelectedOrderId(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
