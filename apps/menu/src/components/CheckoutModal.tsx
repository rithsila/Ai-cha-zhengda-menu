import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { CaretRight, MapPin, Storefront, Coins, CaretLeft, X } from '@phosphor-icons/react';
import { AddressForm, AddressSummary, type AddressFormHandle } from './AddressForm';
import { isValidBuilding, isValidRoom, isValidName, isValidPhone } from '../utils/address';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { KhqrPaymentPanel } from './KhqrPaymentPanel';
import { getDefaultPaymentMethod } from '../utils/paymentPrefs';
import { isOnlinePaymentOffered, refreshOnlinePaymentState, useOnlinePaymentState } from '../utils/onlinePayment';

interface CheckoutModalProps {
  isOpen: boolean;
  total: number;
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (pickupCode: string) => void;
}

/** The saved preference, but never KHQR while online payment is switched off. */
function initialPaymentMethod(): 'khqr' | 'cash' {
  return isOnlinePaymentOffered() ? getDefaultPaymentMethod() : 'cash';
}

export function CheckoutModal({ isOpen, total, cart, onClose, onSuccess }: CheckoutModalProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const onlinePaymentState = useOnlinePaymentState();
  const khqrOffered = onlinePaymentState === 'available';
  // A guest may still order for pickup and pay cash; everything tied to an
  // account (points, saved address, delivery) needs a verified identity.
  const signedIn = hasIdentity();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<'khqr' | 'cash'>(initialPaymentMethod);
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [branchId, setBranchId] = useState<string>('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsPerDollar, setPointsPerDollar] = useState(100);
  // Free inside Arakawa today; the shop can change it with PUT /api/config.
  const [deliveryFeeRate, setDeliveryFeeRate] = useState(0);
  
  // The order waiting for KHQR payment. KhqrPaymentPanel owns everything else
  // about the payment (creating it, polling, expiry, retry).
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentOrderCode, setPaymentOrderCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  // Lets "Continue to Payment" save the typed address first — the form's own
  // save button sits under the sticky footer where nobody sees it.
  const addressFormRef = useRef<AddressFormHandle | null>(null);

  // Lock background scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Fetch branches and user profile dynamically when open, reset on close
  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStep(1);
      setError(null);
      setMethod(initialPaymentMethod());
      setOrderType('pickup');
      setEditingAddress(false);
      setPointsToUse(0);
      setBranchId('');
      setPaymentOrderId(null);
      setPaymentOrderCode(null);
      return;
    }

    // Settle whether the shop can take a QR payment before the payment step is
    // drawn, so KHQR is never offered when it would only fail.
    refreshOnlinePaymentState();

    const fetchData = async () => {
      try {
        const [branchRes, userRes, cfgRes] = await Promise.all([
          apiFetch('/api/branches'),
          signedIn ? apiFetch(ME.profile()) : Promise.resolve(null),
          apiFetch('/api/config')
        ]);
        if (branchRes.ok) {
          const data = await branchRes.json();
          setBranches(data);
          if (data.length > 0) setBranchId(data[0].id);
        }
        if (userRes?.ok) {
          setUserProfile(await userRes.json());
        }
        if (cfgRes.ok) {
          const rows: { key: string; value: string }[] = await cfgRes.json();
          const rate = Number(rows.find(r => r.key === 'pointsPerDollar')?.value);
          if (Number.isFinite(rate) && rate > 0) setPointsPerDollar(rate);
          const fee = Number(rows.find(r => r.key === 'deliveryFee')?.value);
          if (Number.isFinite(fee) && fee >= 0) setDeliveryFeeRate(fee);
        }
      } catch (err) {
        console.error('Failed to fetch checkout data', err);
      }
    };
    fetchData();
  }, [isOpen, signedIn]);

  // If KHQR turns out to be off while this screen is open, quietly fall back to
  // cash rather than leaving a selected option that cannot be paid.
  useEffect(() => {
    if (!khqrOffered) setMethod('cash');
  }, [khqrOffered]);

  const deliveryFee = orderType === 'delivery' ? deliveryFeeRate : 0;
  // A delivery order needs a complete saved profile: room, name and phone.
  const hasAddress = !!userProfile
    && isValidBuilding(userProfile.building)
    && isValidRoom(userProfile.roomNumber)
    && isValidName(userProfile.contactName)
    && isValidPhone(userProfile.phoneNumber);
  const maxUsablePoints = userProfile
    ? Math.min(userProfile.loyaltyPoints, Math.floor((total + deliveryFee) * pointsPerDollar))
    : 0;
  const discountApplied = pointsToUse / pointsPerDollar;
  const finalTotal = Math.max(0, total + deliveryFee - discountApplied);

  const handleNext = async () => {
    if (orderType === 'pickup' && !branchId) {
      setError(t('selectBranchFirst', 'Please select a branch.'));
      return;
    }
    if (orderType === 'delivery') {
      if (!signedIn) {
        setError(t('deliveryNeedsTelegram', 'Delivery needs a saved address. Open the shop from Telegram to use it.'));
        return;
      }
      // The address form's own save button sits below this sticky footer and is
      // easy to miss, so a filled-in form is saved here before moving on.
      const form = addressFormRef.current;
      if (form) {
        if (!form.canSave) {
          setError(t('addressRequired', 'Please add your building, room, name and phone number.'));
          return;
        }
        setIsLoading(true);
        const saved = await form.save();
        setIsLoading(false);
        if (!saved) return;
      } else if (!hasAddress) {
        setError(t('addressRequired', 'Please add your building, room, name and phone number.'));
        return;
      }
    }
    setError(null);
    setStep(2);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // No telegramUserId in the body: the server reads the customer from the
      // identity headers apiFetch attaches, and a guest simply has none.
      const response = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          paymentMethod: method,
          // Delivery orders carry a branch too — it is the shop the food leaves
          // from. Sending null here hid every delivery order from the staff
          // board, which filters by branch and defaults to the first one.
          branchId: branchId || null,
          orderType,
          building: orderType === 'delivery' ? userProfile?.building : null,
          roomNumber: orderType === 'delivery' ? userProfile?.roomNumber : null,
          contactName: orderType === 'delivery' ? userProfile?.contactName : null,
          contactPhone: orderType === 'delivery' ? userProfile?.phoneNumber : null,
          pointsToUse
        }),
      });

      if (!response.ok) {
        throw new Error('order-failed');
      }

      const orderData = await response.json();

      if (method === 'khqr') {
        setPaymentOrderId(orderData.id);
        setPaymentOrderCode(orderData.pickupCode ?? null);
        setStep(3);
        setIsLoading(false);
        return;
      }

      onSuccess(orderData.pickupCode);
    } catch {
      // Never show the server's own wording — it is written for developers.
      setError(t('orderFailed', 'We could not place your order. Please try again.'));
      setIsLoading(false);
    }
  };

  // The order is already saved when online payment fails, so finish it here and
  // let the customer pay at the counter instead of leaving them stuck.
  const handlePayCashInstead = () => {
    if (paymentOrderCode) onSuccess(paymentOrderCode);
    else onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
          animate={shouldReduceMotion ? { opacity: 1 } : { y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
          transition={shouldReduceMotion ? { duration: 0.2 } : { type: 'spring', damping: 28, stiffness: 220 }}
          className="fixed inset-0 z-50 bg-tg-bg flex flex-col overflow-hidden"
        >
          {/* Sticky top navigation header */}
          <div className="sticky top-0 bg-tg-bg border-b border-tg-hint/10 px-4 py-3 flex items-center justify-between z-10">
            <button
              onClick={step === 2 ? () => setStep(1) : onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-tg-hint/10 text-tg-text transition-colors"
              aria-label={step === 2 ? t('back', 'Back') : t('close', 'Close')}
            >
              {step === 2 ? <CaretLeft size={24} /> : <X size={24} />}
            </button>

            <h2 className="text-lg font-bold text-tg-text">
              {t('checkout', 'Checkout')}
            </h2>

            <div className="text-sm font-semibold text-tg-hint min-w-[44px] text-right">
              {step === 3 ? 'Pay' : `${step}/2`}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6 max-w-md mx-auto w-full pb-32">
            {/* Order Summary */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">
                {t('orderSummary', 'Order Summary')}
              </h3>
              <div className="bg-tg-secondary-bg rounded-2xl p-4 flex flex-col gap-3">
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between items-start gap-4 py-2 border-b border-tg-hint/5 last:border-0">
                    <div className="flex-1">
                      <div className="font-bold text-sm">{item.quantity}x {t(item.name)}</div>
                      {Object.keys(item.selectedModifiers).length > 0 && (
                        <div className="text-xs text-tg-hint mt-1">
                          {Object.values(item.selectedModifiers).flat().map(o => t(o.name)).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm">{formatCurrency(item.totalPrice)}</div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium text-center">
                {error}
              </div>
            )}

            {step === 3 && paymentOrderId ? (
              <KhqrPaymentPanel
                orderId={paymentOrderId}
                onPaid={(code) => onSuccess(code)}
                onUseCash={handlePayCashInstead}
              />
            ) : step === 1 ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">{t('orderType', 'Order Type')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setOrderType('pickup')}
                      aria-pressed={orderType === 'pickup'}
                      className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                        orderType === 'pickup' 
                          ? 'bg-brand-primary/10 border-brand-primary/30 text-tg-text shadow-sm' 
                          : 'bg-tg-secondary-bg border-tg-hint/15 text-tg-hint hover:bg-tg-hint/5'
                      }`}
                    >
                      <Storefront size={20} className={orderType === 'pickup' ? 'text-brand-primary' : ''} /> {t('pickup', 'Pickup')}
                    </button>
                    <button 
                      onClick={() => setOrderType('delivery')}
                      aria-pressed={orderType === 'delivery'}
                      className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                        orderType === 'delivery' 
                          ? 'bg-brand-primary/10 border-brand-primary/30 text-tg-text shadow-sm' 
                          : 'bg-tg-secondary-bg border-tg-hint/15 text-tg-hint hover:bg-tg-hint/5'
                      }`}
                    >
                      <MapPin size={20} className={orderType === 'delivery' ? 'text-brand-primary' : ''} /> {t('delivery', 'Delivery')}
                    </button>
                  </div>
                </div>

                {orderType === 'pickup' ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">{t('selectBranch', 'Select Branch')}</h3>
                    <div className="flex flex-col gap-2">
                      {branches.map(b => (
                        <button 
                          key={b.id}
                          onClick={() => setBranchId(b.id)}
                          className={`rounded-2xl border p-4 flex items-center justify-between transition-all text-left ${
                            branchId === b.id 
                              ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm' 
                              : 'bg-tg-secondary-bg border-tg-hint/15 hover:bg-tg-hint/5'
                          }`}
                        >
                          <div>
                            <div className="font-bold text-sm text-tg-text">{b.name}</div>
                            <div className="text-xs text-tg-hint mt-1">{b.address}</div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            branchId === b.id ? 'border-brand-primary' : 'border-tg-hint/25'
                          }`}>
                            {branchId === b.id && <div className="w-2.5 h-2.5 bg-brand-primary rounded-full" />}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">{t('deliveryAddress', 'Delivery Address')}</h3>
                    <div className="rounded-2xl border border-tg-hint/15 bg-tg-secondary-bg p-4">
                      {!signedIn ? (
                        <p className="text-sm text-tg-hint text-center py-2">
                          {t('deliveryNeedsTelegram', 'Delivery needs a saved address. Open the shop from Telegram to use it.')}
                        </p>
                      ) : hasAddress && !editingAddress ? (
                        <AddressSummary
                          profile={userProfile}
                          compact
                          onEdit={() => setEditingAddress(true)}
                        />
                      ) : (
                        <AddressForm
                          profile={userProfile}
                          saveRef={addressFormRef}
                          onSaved={(user) => { setUserProfile(user); setEditingAddress(false); setError(null); }}
                          onCancel={hasAddress ? () => setEditingAddress(false) : undefined}
                        />
                      )}
                    </div>
                    <p className="text-xs text-tg-hint">
                      {t('arakawaOnly', 'We deliver inside Arakawa only, from our shop at J03 on the ground floor.')}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {userProfile && userProfile.loyaltyPoints > 0 && (
                  <div className={`rounded-2xl p-4 border transition-all ${
                    pointsToUse > 0 ? 'bg-brand-primary/10 border-brand-primary/30' : 'bg-tg-secondary-bg border-tg-hint/15'
                  }`}>
                    <div className="font-bold text-tg-text flex items-center gap-2 mb-1">
                      <Coins size={20} weight="fill" className={pointsToUse > 0 ? 'text-brand-primary' : 'text-tg-hint'} />
                      {userProfile.loyaltyPoints} {t('pointsAvailable', 'Points Available')}
                    </div>
                    <p className="text-xs text-tg-hint mb-3">
                      {t('choosePoints', 'Choose how many points to use. {{rate}} points = $1 off.', { rate: pointsPerDollar })}
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range" min={0} max={maxUsablePoints} step={1} value={pointsToUse}
                        onChange={e => setPointsToUse(Number(e.target.value))}
                        className="flex-1 accent-brand-primary"
                        aria-label="Points to use"
                      />
                      <input
                        type="number" min={0} max={maxUsablePoints} value={pointsToUse}
                        onChange={e => {
                          const v = Math.floor(Number(e.target.value) || 0);
                          setPointsToUse(Math.max(0, Math.min(v, maxUsablePoints)));
                        }}
                        className="w-20 bg-tg-bg border border-tg-hint/20 rounded-lg px-2 py-1 text-sm font-bold text-center text-tg-text"
                        aria-label="Points to use (number)"
                      />
                    </div>
                    <div className="text-xs font-bold text-brand-primary mt-2">
                      -{formatCurrency(discountApplied)} {t('discount', 'discount')}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-sm">{t('paymentMethod')}</h3>
                  {/* KHQR hides itself once the server says online payment is
                      not set up, and comes back on its own when it is. */}
                  {khqrOffered ? (
                    <button
                      onClick={() => setMethod('khqr')}
                      aria-pressed={method === 'khqr'}
                      className={`rounded-2xl border p-4 flex justify-between items-center transition-all text-left ${
                        method === 'khqr'
                          ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm'
                          : 'bg-tg-secondary-bg border-tg-hint/15 hover:bg-tg-hint/5'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-base text-tg-text">{t('khqr')}</div>
                        <div className="text-xs text-tg-hint mt-1">{t('khqrDescription', 'Pay instantly via any Cambodian bank app')}</div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        method === 'khqr' ? 'border-brand-primary' : 'border-tg-hint/25'
                      }`}>
                        {method === 'khqr' && <div className="w-2.5 h-2.5 bg-brand-primary rounded-full" />}
                      </div>
                    </button>
                  ) : (
                    <p className="text-xs text-tg-hint">
                      {t('onlinePaymentUnavailable', 'Online payment is not available right now.')}
                    </p>
                  )}

                  <button 
                    onClick={() => setMethod('cash')}
                    aria-pressed={method === 'cash'}
                    className={`rounded-2xl border p-4 flex justify-between items-center transition-all text-left ${
                      method === 'cash' 
                        ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm' 
                        : 'bg-tg-secondary-bg border-tg-hint/15 hover:bg-tg-hint/5'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-base text-tg-text">{t('cash')}</div>
                      <div className="text-xs text-tg-hint mt-1">{t('cashDescription', 'Pay at counter or upon delivery')}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      method === 'cash' ? 'border-brand-primary' : 'border-tg-hint/25'
                    }`}>
                      {method === 'cash' && <div className="w-2.5 h-2.5 bg-brand-primary rounded-full" />}
                    </div>
                  </button>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">{t('pricingBreakdown', 'Pricing Breakdown')}</h3>
                  <div className="bg-tg-secondary-bg rounded-2xl p-4 flex flex-col gap-3 border border-tg-hint/15">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tg-hint">{t('subtotal', 'Subtotal')}</span>
                      <span className="font-medium text-tg-text">{formatCurrency(total)}</span>
                    </div>

                    {discountApplied > 0 && (
                      <div className="flex justify-between items-center text-sm text-brand-primary">
                        <span>{t('pointsDiscount', 'Points Discount')}</span>
                        <span className="font-medium">-{formatCurrency(discountApplied)}</span>
                      </div>
                    )}

                    {orderType === 'delivery' && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-tg-hint">{t('deliveryFee', 'Delivery Fee')}</span>
                        <span className={`font-medium ${deliveryFee === 0 ? 'text-brand-primary' : 'text-tg-text'}`}>
                          {deliveryFee === 0 ? t('free', 'FREE') : formatCurrency(deliveryFee)}
                        </span>
                      </div>
                    )}

                    <div className="border-t border-tg-hint/10 my-1" />

                    <div className="flex justify-between items-center">
                      <span className="font-bold text-tg-text">{t('totalAmount', 'Total Amount')}</span>
                      <span className="font-extrabold text-lg text-tg-text">{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom sticky action bar */}
          <div className="sticky bottom-0 bg-tg-bg border-t border-tg-hint/10 w-full z-10">
            {step !== 3 && (
              <div className="max-w-md mx-auto px-4 pt-4 pb-8 flex gap-3">
                {step === 1 ? (
                  <Button fullWidth onClick={() => { void handleNext(); }} disabled={isLoading} className="py-4 flex items-center justify-center gap-2">
                    {t('continueToPayment', 'Continue to Payment')} <CaretRight size={20} />
                  </Button>
                ) : (
                  <Button fullWidth className="py-4" onClick={handleConfirm} disabled={isLoading}>
                    {isLoading ? t('processing', 'Processing...') : `${t('pay', 'Pay')} ${formatCurrency(finalTotal)}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
