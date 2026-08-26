import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  Package,
  ArrowCounterClockwise,
  CreditCard,
  Money,
  CheckCircle,
  X,
  Coins,
  Clock,
  ShoppingCart,
} from '@phosphor-icons/react';
import { formatCurrency } from '../utils/format';
import type { CartItem, MenuItem } from '../types';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';
import { useOnlinePaymentState } from '../utils/onlinePayment';
import { KhqrPaymentPanel } from './KhqrPaymentPanel';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menuItem: MenuItem;
  modifiers: string;
}

interface Order {
  id: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  pickupCode: string | null;
  transactionId?: string | null;
  pointsEarned?: number | null;
  cancelReason?: string | null;
  items: OrderItem[];
}

interface OrdersViewProps {
  onReorder: (items: CartItem[]) => void;
  onBrowseMenu?: () => void;
}

function shortRef(id: string): string {
  return id.slice(0, 6).toUpperCase();
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

export function OrdersView({ onReorder, onBrowseMenu }: OrdersViewProps) {
  const { t } = useTranslation();
  const signedIn = hasIdentity();
  const khqrOffered = useOnlinePaymentState() === 'available';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [paidCode, setPaidCode] = useState<string | null>(null);

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

  const handleReorder = (order: Order) => {
    const cartItems: CartItem[] = order.items.map(item => ({
      id: crypto.randomUUID(),
      menuItemId: item.menuItem.id,
      name: item.menuItem.name,
      basePrice: item.menuItem.basePrice,
      quantity: item.quantity,
      selectedModifiers: item.modifiers ? JSON.parse(item.modifiers) : {},
      unitPrice: item.price / item.quantity,
      totalPrice: item.price,
    }));
    onReorder(cartItems);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500/15 text-yellow-700 dark:text-yellow-300">
            <Clock size={13} weight="bold" />
            {t('pending', 'Pending')}
          </span>
        );
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
            {t('preparing', 'Preparing')}
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/15 text-green-700 dark:text-green-300">
            <CheckCircle size={13} weight="bold" />
            {t('ready', 'Ready')}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-tg-hint/15 text-tg-hint">
            {t('completed', 'Completed')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">
            <X size={13} weight="bold" />
            {t('cancelled', 'Cancelled')}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-tg-hint/15 text-tg-hint">
            {status}
          </span>
        );
    }
  };

  if (!signedIn) {
    return (
      <SignInPrompt
        what={t('signInForOrders', 'Open the shop from our Telegram bot to see your orders and reorder quickly.')}
        onBrowseMenu={onBrowseMenu}
      />
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-tg-hint">
        <ArrowCounterClockwise size={26} className="animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <Package size={48} weight="duotone" className="text-tg-hint/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">{t('noOrdersYet', 'No Orders Yet')}</h2>
        <p className="text-tg-hint text-sm">{t('ordersEmptyHint', 'Your order history will appear here.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-md mx-auto">
      {/* Success banner after payment approved */}
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

      {/* Orders list */}
      <div className="space-y-4">
        {orders.map(order => {
          const isCancelled = order.status === 'cancelled';
          const isPending = order.status === 'pending';

          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm border border-tg-hint/10"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-3 border-b border-tg-hint/10 pb-3 gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(order.status)}
                    <span className="text-xs font-mono text-tg-hint font-medium">
                      #{shortRef(order.id)}
                    </span>
                    {!isCancelled && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          order.paymentMethod === 'cash'
                            ? 'bg-tg-hint/15 text-tg-hint'
                            : 'bg-brand-primary/10 text-brand-primary'
                        }`}
                      >
                        {order.paymentMethod === 'cash' ? (
                          <Money size={13} weight="fill" />
                        ) : (
                          <CreditCard size={13} weight="fill" />
                        )}
                        {order.paymentMethod === 'cash' ? t('cash', 'Cash') : t('khqr', 'KHQR')}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-tg-hint mt-2">
                    {shortDate(order.createdAt)}
                  </p>

                  {isCancelled && order.cancelReason && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">
                      Reason: {order.cancelReason}
                    </p>
                  )}
                  {isCancelled && (
                    <p className="text-xs text-tg-hint mt-0.5">
                      {t('cancelledNotCharged', 'This order was cancelled. You were not charged.')}
                    </p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p
                    className={`font-bold ${
                      isCancelled ? 'text-tg-hint line-through' : 'text-tg-text'
                    }`}
                  >
                    {formatCurrency(order.totalAmount)}
                  </p>
                  {!isCancelled && order.pickupCode && (
                    <p className="text-xs font-mono font-bold mt-1 bg-tg-bg px-2 py-1 rounded">
                      {t('code', 'Code')}: {order.pickupCode}
                    </p>
                  )}
                </div>
              </div>

              {/* Items List */}
              <ul className="space-y-1.5 mb-3 text-sm">
                {order.items.map(item => (
                  <li key={item.id} className="flex justify-between text-tg-text">
                    <span className="font-medium">{item.quantity}x {item.menuItem?.name || 'Item'}</span>
                    <span className="text-tg-hint text-xs">{formatCurrency(item.price)}</span>
                  </li>
                ))}
              </ul>

              {/* Points Earned Tag */}
              {!isCancelled && (order.pointsEarned ?? 0) > 0 && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary bg-brand-primary/10 px-2 py-1 rounded-lg">
                    <Coins size={14} weight="fill" />+{order.pointsEarned} {t('points', 'points')}
                  </span>
                </div>
              )}

              {/* Actions: Pay Now for unpaid orders, or Reorder for past orders */}
              {isPending ? (
                order.paymentMethod === 'cash' || !khqrOffered ? (
                  <div className="flex items-start gap-2 rounded-xl bg-tg-hint/10 p-3">
                    <Money size={18} weight="fill" className="text-tg-hint flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-tg-text">
                        {t('payCashAtCounter', 'Pay with cash when you pick up')}
                      </p>
                      {order.pickupCode && (
                        <p className="text-xs text-tg-hint mt-0.5">
                          {t('showThisCode', 'Show code at counter:')}{' '}
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
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary text-white font-bold active:scale-95 transition-transform"
                  >
                    <CreditCard size={18} weight="fill" />
                    {t('payNow', 'Pay now')}
                  </button>
                )
              ) : (
                <button
                  onClick={() => handleReorder(order)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-primary/10 text-brand-primary font-bold text-sm active:scale-95 transition-transform"
                >
                  <ShoppingCart size={16} weight="bold" /> {t('reorder', 'Reorder')}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* KHQR Sheet */}
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
