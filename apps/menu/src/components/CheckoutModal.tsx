import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { MapPin, Storefront, CaretLeft, X } from '@phosphor-icons/react';
import { AddressForm, AddressSummary, type AddressFormHandle } from './AddressForm';
import { isValidBuilding, isValidRoom, isValidName, isValidPhone } from '../utils/address';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { KhqrPaymentPanel } from './KhqrPaymentPanel';
import { getDefaultPaymentMethod } from '../utils/paymentPrefs';
import { isOnlinePaymentOffered, refreshOnlinePaymentState, useOnlinePaymentState } from '../utils/onlinePayment';
import { useStoreStatus, refreshStoreStatus } from '../utils/storeStatus';

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
  const storeStatus = useStoreStatus();
  const khqrOffered = onlinePaymentState === 'available' && storeStatus.enableKhqr;
  // A guest may still order for pickup and pay cash; everything tied to an
  // account (points, saved address, delivery) needs a verified identity.
  const signedIn = hasIdentity();
  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<'khqr' | 'cash'>(initialPaymentMethod);
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [branchId, setBranchId] = useState<string>('');
  const [editingAddress, setEditingAddress] = useState(false);
  const [claimedCount, setClaimedCount] = useState(0);
  const [pointsPerDollar, setPointsPerDollar] = useState(100);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  // Free inside Arakawa today; the shop can change it with PUT /api/config.
  const [deliveryFeeRate, setDeliveryFeeRate] = useState(0);
  const [allowCashForStandard, setAllowCashForStandard] = useState(false);
  const [showCashLockedBanner, setShowCashLockedBanner] = useState(false);
  
  // The order waiting for KHQR payment. KhqrPaymentPanel owns everything else
  // about the payment (creating it, polling, expiry, retry).
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [paymentOrderCode, setPaymentOrderCode] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  // Lets the single-page checkout save the typed address before placing the order
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

  // Fetch branches, config and user profile dynamically when open, reset on close
  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStep(1);
      setError(null);
      setMethod(initialPaymentMethod());
      setOrderType(storeStatus.enablePickup ? 'pickup' : 'delivery');
      setEditingAddress(false);
      setClaimedCount(0);
      setBranchId('');
      setPaymentOrderId(null);
      setPaymentOrderCode(null);
      setShowCashLockedBanner(false);
      return;
    }

    // Refresh payment and live store status
    refreshStoreStatus();
    refreshOnlinePaymentState();

    const fetchData = async () => {
      try {
        const [branchRes, userRes, cfgRes, catRes] = await Promise.all([
          apiFetch('/api/branches'),
          signedIn ? apiFetch(ME.profile()) : Promise.resolve(null),
          apiFetch('/api/config'),
          apiFetch('/api/catalog')
        ]);
        if (branchRes.ok) {
          const data = await branchRes.json();
          setBranches(data);
          if (data.length > 0) setBranchId(data[0].id);
        }
        if (userRes?.ok) {
          const user = await userRes.json();
          setUserProfile(user);
        }
        if (catRes.ok) {
          setCatalogItems(await catRes.json());
        }
        if (cfgRes.ok) {
          const rows: { key: string; value: string }[] = await cfgRes.json();
          const rate = Number(rows.find(r => r.key === 'pointsPerDollar')?.value);
          if (Number.isFinite(rate) && rate > 0) setPointsPerDollar(rate);
          const fee = Number(rows.find(r => r.key === 'deliveryFee')?.value);
          if (Number.isFinite(fee) && fee >= 0) setDeliveryFeeRate(fee);
          const allowCashRow = rows.find(r => r.key === 'allowCashForStandard');
          if (allowCashRow) setAllowCashForStandard(allowCashRow.value === '1');
        }
      } catch (err) {
        console.error('Failed to fetch checkout data', err);
      }
    };
    fetchData();
  }, [isOpen, signedIn, storeStatus.enablePickup]);

  const userTier = userProfile?.tier || 'standard';
  const isCashUnlocked = userTier === 'gold' || allowCashForStandard;

  // Auto-select valid order type based on manager toggles
  useEffect(() => {
    if (!storeStatus.enablePickup && storeStatus.enableDelivery) {
      setOrderType('delivery');
    } else if (storeStatus.enablePickup && !storeStatus.enableDelivery) {
      setOrderType('pickup');
    }
  }, [storeStatus.enablePickup, storeStatus.enableDelivery]);

  // Auto-select valid payment method based on manager toggles and customer tier
  useEffect(() => {
    if ((!storeStatus.enableCash || !isCashUnlocked) && storeStatus.enableKhqr && khqrOffered) {
      setMethod('khqr');
    } else if (!storeStatus.enableKhqr || !khqrOffered) {
      setMethod('cash');
    }
  }, [storeStatus.enableCash, storeStatus.enableKhqr, khqrOffered, isCashUnlocked]);

  const deliveryFee = orderType === 'delivery' ? deliveryFeeRate : 0;
  // A delivery order needs a complete saved profile: room, name and phone.
  const hasAddress = !!userProfile
    && isValidBuilding(userProfile.building)
    && isValidRoom(userProfile.roomNumber)
    && isValidName(userProfile.contactName)
    && isValidPhone(userProfile.phoneNumber);

  const pointsPerStamp = Math.max(1, Math.round(pointsPerDollar / 10));
  const userPoints = userProfile?.loyaltyPoints ?? 0;
  const userStamps = Math.floor(userPoints / pointsPerStamp);

  // List all individual claimable units in cart
  const claimableCartUnits: { name: string; unitPrice: number; menuItemId: string }[] = [];
  for (const c of cart) {
    const item = catalogItems.find((i) => i.id === c.menuItemId);
    if (item && item.canClaim) {
      for (let q = 0; q < c.quantity; q++) {
        claimableCartUnits.push({ name: c.name, unitPrice: c.unitPrice, menuItemId: c.menuItemId });
      }
    }
  }
  // Sort descending by unitPrice so most expensive items get discounted first
  claimableCartUnits.sort((a, b) => b.unitPrice - a.unitPrice);

  const totalClaimableUnits = claimableCartUnits.length;
  const maxStampsCanClaim = Math.floor(userStamps / 10);
  const maxClaimableCount = Math.min(totalClaimableUnits, maxStampsCanClaim);

  const effectiveClaimCount = Math.min(claimedCount, maxClaimableCount);
  const claimedUnits = claimableCartUnits.slice(0, effectiveClaimCount);
  const discountApplied = claimedUnits.reduce((sum, u) => sum + u.unitPrice, 0);
  const finalTotal = Math.max(0, total + deliveryFee - discountApplied);

  const handleConfirm = async () => {
    if (!storeStatus.isOpen) {
      setError(t('shopClosedSchedule', 'Shop is currently closed. Opening hours: {{open}} – {{close}}.', { open: storeStatus.openTime, close: storeStatus.closeTime }));
      return;
    }
    if (orderType === 'pickup' && !storeStatus.enablePickup) {
      setError(t('pickupDisabled', 'Pickup orders are currently turned off.'));
      return;
    }
    if (orderType === 'delivery' && !storeStatus.enableDelivery) {
      setError(t('deliveryDisabled', 'Delivery orders are currently turned off.'));
      return;
    }
    if (orderType === 'pickup' && !branchId) {
      setError(t('selectBranchFirst', 'Please select a branch.'));
      return;
    }
    if (orderType === 'delivery') {
      if (!signedIn) {
        setError(t('deliveryNeedsTelegram', 'Delivery needs a saved address. Open the shop from Telegram to use it.'));
        return;
      }
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
    if (method === 'cash' && !storeStatus.enableCash) {
      setError(t('cashDisabled', 'Cash payment is currently turned off.'));
      return;
    }
    if (method === 'cash' && !isCashUnlocked) {
      setError(t('cashLockedForStandard', 'Cash on Delivery is reserved for Gold members. Please pay via KHQR.'));
      return;
    }
    if (method === 'khqr' && (!storeStatus.enableKhqr || !khqrOffered)) {
      setError(t('khqrDisabled', 'KHQR payment is currently turned off.'));
      return;
    }
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
          building: userProfile?.building || null,
          roomNumber: userProfile?.roomNumber || null,
          contactName: userProfile?.contactName || null,
          contactPhone: userProfile?.phoneNumber || null,
          pointsToUse: effectiveClaimCount * (pointsPerStamp * 10),
          claimReward: effectiveClaimCount > 0 ? effectiveClaimCount : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData?.error) {
          setError(errorData.error);
          setIsLoading(false);
          return;
        }
        throw new Error('order-failed');
      }

      const orderData = await response.json();

      if (method === 'khqr') {
        setPaymentOrderId(orderData.id);
        setPaymentOrderCode(orderData.pickupCode ?? null);
        setStep(2);
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
              {step === 2 ? t('pay', 'Pay') : ''}
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6 max-w-md mx-auto w-full pb-32">
            {error && (
              <div className="bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium text-center">
                {error}
              </div>
            )}

            {!storeStatus.isOpen && (
              <div className="bg-[#E53935]/10 text-[#E53935] text-sm p-4 rounded-2xl border border-[#E53935]/20 font-medium text-center">
                <div className="font-bold">{t('shopClosed', 'Shop is currently closed')}</div>
                <div className="text-xs mt-1 text-tg-hint">
                  {t('shopOpeningHours', 'Operating hours: {{hours}}', { hours: `${storeStatus.openTime} – ${storeStatus.closeTime}` })}
                </div>
              </div>
            )}

            {step === 2 && paymentOrderId ? (
              <KhqrPaymentPanel
                orderId={paymentOrderId}
                totalAmount={finalTotal}
                onPaid={(code) => onSuccess(code)}
                onUseCash={handlePayCashInstead}
              />
            ) : (
              <>
                {/* 1. Order Summary */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">
                    {t('orderSummary', 'Order Summary')}
                  </h3>
                  <div className="bg-tg-secondary-bg rounded-2xl p-4 flex flex-col gap-3">
                    {cart.map(item => {
                      const catalogItem = catalogItems.find(i => i.id === item.menuItemId);
                      const isEligible = catalogItem?.canClaim ?? false;
                      return (
                        <div key={item.id} className="flex justify-between items-start gap-4 py-2 border-b border-tg-hint/5 last:border-0">
                          <div className="flex-1">
                            <div className="font-bold text-sm">{item.quantity}x {t(item.name)}</div>
                            {signedIn && userStamps >= 10 && (
                              <div className="mt-0.5">
                                {isEligible ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded-md">
                                    🎁 {t('eligibleForStamps', 'Stamp reward eligible')}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-medium text-tg-hint bg-tg-bg/70 px-1.5 py-0.5 rounded-md border border-tg-hint/10">
                                    {t('notEligibleForStamps', 'Not eligible for stamp rewards')}
                                  </span>
                                )}
                              </div>
                            )}
                            {Object.keys(item.selectedModifiers).length > 0 && (
                              <div className="text-xs text-tg-hint mt-1">
                                {Object.values(item.selectedModifiers).flat().map(o => t(o.name)).join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="font-bold text-sm">{formatCurrency(item.totalPrice)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Stamp Loyalty Rewards */}
                {signedIn && userProfile && (
                  <div className="space-y-2">
                    {/* Case 1: Has at least 10 stamps AND has eligible claimable items in cart */}
                    {maxClaimableCount > 0 && (
                      <div className={`rounded-2xl p-4 border transition-all ${
                        effectiveClaimCount > 0
                          ? 'bg-brand-primary/10 border-brand-primary/40 shadow-xs'
                          : 'bg-tg-secondary-bg border-tg-hint/15'
                      }`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-primary text-white text-lg shrink-0">
                              🎁
                            </div>
                            <div>
                              <div className="font-bold text-sm text-tg-text">
                                {t('claimFreeDrink', 'Claim Free Item (10 Stamps each)')}
                              </div>
                              <div className="text-xs text-tg-hint">
                                {t('stampsAvailableCount', '{{stamps}} stamps available (can claim up to {{max}} free)', {
                                  stamps: userStamps,
                                  max: maxClaimableCount,
                                })}
                              </div>
                            </div>
                          </div>

                          {maxClaimableCount === 1 ? (
                            <button
                              type="button"
                              onClick={() => setClaimedCount(effectiveClaimCount > 0 ? 0 : 1)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                                effectiveClaimCount > 0
                                  ? 'bg-brand-primary text-white shadow-xs'
                                  : 'bg-tg-hint/15 text-tg-text hover:bg-tg-hint/25'
                              }`}
                            >
                              {effectiveClaimCount > 0 ? t('applied', 'Applied ✓') : t('apply', 'Apply')}
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 bg-tg-bg border border-tg-hint/20 rounded-xl p-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setClaimedCount(Math.max(0, effectiveClaimCount - 1))}
                                disabled={effectiveClaimCount <= 0}
                                className="w-7 h-7 rounded-lg bg-tg-secondary-bg font-bold text-sm flex items-center justify-center disabled:opacity-40 text-tg-text active:scale-95 transition-transform"
                                aria-label="Decrease free items"
                              >
                                -
                              </button>
                              <span className="w-5 text-center font-bold text-sm text-tg-text">
                                {effectiveClaimCount}
                              </span>
                              <button
                                type="button"
                                onClick={() => setClaimedCount(Math.min(maxClaimableCount, effectiveClaimCount + 1))}
                                disabled={effectiveClaimCount >= maxClaimableCount}
                                className="w-7 h-7 rounded-lg bg-brand-primary text-white font-bold text-sm flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                                aria-label="Increase free items"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>

                        {effectiveClaimCount > 0 && (
                          <div className="text-xs font-bold text-brand-primary mt-3 flex flex-col gap-1 border-t border-brand-primary/20 pt-2">
                            {claimedUnits.map((u, idx) => (
                              <div key={idx} className="flex items-center justify-between">
                                <span>🎁 {u.name} (Free)</span>
                                <span>-{formatCurrency(u.unitPrice)}</span>
                              </div>
                            ))}
                            <div className="text-[11px] text-tg-hint font-normal mt-0.5">
                              {t('stampsDeducted', 'Using {{stamps}} stamps', {
                                stamps: effectiveClaimCount * 10,
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Case 2: Customer has >= 10 stamps, but NO claimable items in cart */}
                    {userStamps >= 10 && totalClaimableUnits === 0 && (
                      <div className="rounded-2xl p-4 bg-tg-secondary-bg border border-tg-hint/15 flex items-start gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 text-lg shrink-0 mt-0.5">
                          🎁
                        </div>
                        <div className="space-y-1">
                          <div className="font-bold text-sm text-tg-text">
                            {t('stampsReady', 'You have {{stamps}} stamps ready!')}
                          </div>
                          <div className="text-xs text-tg-hint leading-relaxed">
                            {t('addClaimableItemHint', 'Add an eligible drink to your cart to claim for free.')}
                          </div>
                          <div className="text-[11px] text-amber-600 font-medium pt-0.5">
                            ⚠️ {t('ineligibleItemsInCartNotice', 'Items currently in your cart are not eligible for stamp rewards.')}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Case 3: Customer has less than 10 stamps */}
                    {userStamps < 10 && userStamps > 0 && (
                      <div className="rounded-2xl p-3 bg-tg-secondary-bg border border-tg-hint/10 flex items-center justify-between text-xs text-tg-hint">
                        <span>🥣 {t('yourStamps', 'Your Stamps')}: <strong className="text-tg-text">{userStamps}/10</strong></span>
                        <span>{t('needMoreStampsCount', '{{count}} more for free item', { count: 10 - userStamps })}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Pricing Breakdown */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">{t('pricingBreakdown', 'Pricing Breakdown')}</h3>
                  <div className="bg-tg-secondary-bg rounded-2xl p-4 flex flex-col gap-3 border border-tg-hint/15">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-tg-hint">{t('subtotal', 'Subtotal')}</span>
                      <span className="font-medium text-tg-text">{formatCurrency(total)}</span>
                    </div>

                    {discountApplied > 0 && (
                      <div className="flex justify-between items-center text-sm text-brand-primary">
                        <span>
                          {t('stampRewardDiscount', '10-Stamp Reward ({{count}} free)', {
                            count: effectiveClaimCount,
                          })}
                        </span>
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

                {/* 4. Payment Method */}
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-sm">{t('paymentMethod')}</h3>
                  {storeStatus.enableKhqr && khqrOffered ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowCashLockedBanner(false);
                        setMethod('khqr');
                      }}
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
                  ) : null}

                  {storeStatus.enableCash ? (
                    <div className="flex flex-col gap-1.5">
                      <button 
                        type="button"
                        onClick={() => {
                          if (!isCashUnlocked) {
                            setShowCashLockedBanner(true);
                            if (khqrOffered) setMethod('khqr');
                            return;
                          }
                          setShowCashLockedBanner(false);
                          setMethod('cash');
                        }}
                        aria-pressed={method === 'cash'}
                        className={`rounded-2xl border p-4 flex justify-between items-center transition-all text-left ${
                          !isCashUnlocked
                            ? 'bg-tg-secondary-bg/60 border-tg-hint/15 opacity-80'
                            : method === 'cash' 
                            ? 'bg-brand-primary/10 border-brand-primary/30 shadow-sm' 
                            : 'bg-tg-secondary-bg border-tg-hint/15 hover:bg-tg-hint/5'
                        }`}
                      >
                        <div className="flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-tg-text">{t('cash')}</span>
                            {isCashUnlocked ? (
                              userTier === 'gold' && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-300 font-extrabold text-[11px] border border-amber-400/30 flex items-center gap-1">
                                  ⭐ {t('goldPerk', 'Gold Perk')}
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-tg-hint/15 text-tg-hint font-bold text-[11px] flex items-center gap-1">
                                🔒 {t('goldMember', 'Gold Only')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-tg-hint mt-1">
                            {isCashUnlocked
                              ? t('cashDescription', 'Pay at counter or upon delivery')
                              : t('cashLockedForStandard', 'Cash on Delivery is reserved for Gold members. Please pay via KHQR.')}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                          !isCashUnlocked
                            ? 'border-tg-hint/20'
                            : method === 'cash'
                            ? 'border-brand-primary'
                            : 'border-tg-hint/25'
                        }`}>
                          {isCashUnlocked && method === 'cash' && (
                            <div className="w-2.5 h-2.5 bg-brand-primary rounded-full" />
                          )}
                          {!isCashUnlocked && <span className="text-[10px]">🔒</span>}
                        </div>
                      </button>

                      {showCashLockedBanner && !isCashUnlocked && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 font-medium flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          <span className="text-base leading-none">🔒</span>
                          <span>{t('cashLockedForStandard', 'Cash on Delivery is reserved for Gold members. Please pay via KHQR.')}</span>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {!storeStatus.enableCash && (!storeStatus.enableKhqr || !khqrOffered) && (
                    <p className="text-xs text-[#E53935] font-medium bg-[#E53935]/10 p-3 rounded-xl border border-[#E53935]/20 text-center">
                      {t('noPaymentAvailable', 'No payment methods are available right now.')}
                    </p>
                  )}
                </div>

                {/* 5. Order Type (Pickup / Delivery) & Branch or Address */}
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">{t('orderType', 'Order Type')}</h3>
                    {!storeStatus.enablePickup && !storeStatus.enableDelivery ? (
                      <div className="bg-[#E53935]/10 text-[#E53935] text-xs p-3 rounded-xl text-center font-medium">
                        {t('orderingDisabled', 'Ordering is temporarily disabled.')}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => storeStatus.enablePickup && setOrderType('pickup')}
                          disabled={!storeStatus.enablePickup}
                          aria-pressed={orderType === 'pickup'}
                          className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                            !storeStatus.enablePickup
                              ? 'opacity-40 bg-tg-secondary-bg border-tg-hint/10 cursor-not-allowed text-tg-hint'
                              : orderType === 'pickup' 
                                ? 'bg-brand-primary/10 border-brand-primary/30 text-tg-text shadow-sm' 
                                : 'bg-tg-secondary-bg border-tg-hint/15 text-tg-hint hover:bg-tg-hint/5'
                          }`}
                        >
                          <Storefront size={20} className={orderType === 'pickup' && storeStatus.enablePickup ? 'text-brand-primary' : ''} />
                          {t('pickup', 'Pickup')} {!storeStatus.enablePickup ? `(${t('off', 'Off')})` : ''}
                        </button>
                        <button 
                          onClick={() => storeStatus.enableDelivery && setOrderType('delivery')}
                          disabled={!storeStatus.enableDelivery}
                          aria-pressed={orderType === 'delivery'}
                          className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                            !storeStatus.enableDelivery
                              ? 'opacity-40 bg-tg-secondary-bg border-tg-hint/10 cursor-not-allowed text-tg-hint'
                              : orderType === 'delivery' 
                                ? 'bg-brand-primary/10 border-brand-primary/30 text-tg-text shadow-sm' 
                                : 'bg-tg-secondary-bg border-tg-hint/15 text-tg-hint hover:bg-tg-hint/5'
                          }`}
                        >
                          <MapPin size={20} className={orderType === 'delivery' && storeStatus.enableDelivery ? 'text-brand-primary' : ''} />
                          {t('delivery', 'Delivery')} {!storeStatus.enableDelivery ? `(${t('off', 'Off')})` : ''}
                        </button>
                      </div>
                    )}
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
              </>
            )}
          </div>

          {/* Bottom sticky action bar */}
          <div className="sticky bottom-0 bg-tg-bg border-t border-tg-hint/10 w-full z-10">
            {step === 1 && (
              <div className="max-w-md mx-auto px-4 pt-4 pb-8 flex gap-3">
                <Button
                  fullWidth
                  className="py-4"
                  onClick={() => { void handleConfirm(); }}
                  disabled={isLoading || !storeStatus.isOpen || (!storeStatus.enablePickup && !storeStatus.enableDelivery) || (!storeStatus.enableCash && (!storeStatus.enableKhqr || !khqrOffered))}
                >
                  {isLoading
                    ? t('processing', 'Processing...')
                    : !storeStatus.isOpen
                      ? t('shopClosed', 'Shop Closed')
                      : (!storeStatus.enablePickup && !storeStatus.enableDelivery)
                        ? t('orderingDisabled', 'Ordering Disabled')
                        : `${t('pay', 'Pay')} ${formatCurrency(finalTotal)}`}
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
