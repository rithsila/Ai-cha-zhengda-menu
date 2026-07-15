import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { CaretRight, MapPin, Storefront, Coins, CaretLeft, X } from '@phosphor-icons/react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};

interface CheckoutModalProps {
  isOpen: boolean;
  total: number;
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (pickupCode: string) => void;
}

export function CheckoutModal({ isOpen, total, cart, onClose, onSuccess }: CheckoutModalProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<'khqr' | 'cash'>('khqr');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [branchId, setBranchId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [usePoints, setUsePoints] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Fetch branches and user profile dynamically when open, reset on close
  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStep(1);
      setError(null);
      setMethod('khqr');
      setOrderType('pickup');
      setDeliveryAddress('');
      setUsePoints(false);
      setBranchId('');
      return;
    }

    const fetchData = async () => {
      try {
        const [branchRes, userRes] = await Promise.all([
          fetch('http://localhost:4000/api/branches'),
          fetch(`http://localhost:4000/api/user/${WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id'}`)
        ]);
        if (branchRes.ok) {
          const data = await branchRes.json();
          setBranches(data);
          if (data.length > 0) setBranchId(data[0].id);
        }
        if (userRes.ok) {
          setUserProfile(await userRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch checkout data', err);
      }
    };
    fetchData();
  }, [isOpen]);

  const deliveryFee = orderType === 'delivery' ? 1.00 : 0;
  const maxDiscountFromPoints = userProfile ? userProfile.loyaltyPoints / 100 : 0;
  const discountApplied = usePoints ? Math.min(maxDiscountFromPoints, total + deliveryFee) : 0;
  const finalTotal = total + deliveryFee - discountApplied;

  const handleNext = () => {
    if (orderType === 'pickup' && !branchId) {
      setError('Please select a branch.');
      return;
    }
    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      setError('Please provide a delivery address.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (method === 'khqr') {
        // Mock KHQR Integration call
        const khqrRes = await fetch('http://localhost:4000/api/payment/khqr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: finalTotal }),
        });
        if (!khqrRes.ok) throw new Error('Failed to generate KHQR');
        await khqrRes.json();
        
        // Simulate waiting for user to scan and pay
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const response = await fetch('http://localhost:4000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          totalAmount: total + deliveryFee,
          paymentMethod: method,
          telegramUserId: WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id',
          branchId: orderType === 'pickup' ? branchId : null,
          orderType,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          usePoints
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const data = await response.json();
      onSuccess(data.pickupCode);
    } catch (err: any) {
      setError(err.message || 'An error occurred during checkout');
    } finally {
      setIsLoading(false);
    }
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
          <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-md border-b border-tg-hint/10 px-4 py-3 flex items-center justify-between z-10">
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
              {step}/2
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

            {step === 1 ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">{t('orderType', 'Order Type')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setOrderType('pickup')}
                      aria-pressed={orderType === 'pickup'}
                      className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                        orderType === 'pickup' 
                          ? 'border-brand-primary text-brand-primary bg-brand-primary/5' 
                          : 'border-tg-hint/15 text-tg-hint bg-tg-secondary-bg'
                      }`}
                    >
                      <Storefront size={20} /> {t('pickup', 'Pickup')}
                    </button>
                    <button 
                      onClick={() => setOrderType('delivery')}
                      aria-pressed={orderType === 'delivery'}
                      className={`p-3 rounded-2xl border font-bold flex items-center justify-center gap-2 transition-all ${
                        orderType === 'delivery' 
                          ? 'border-brand-primary text-brand-primary bg-brand-primary/5' 
                          : 'border-tg-hint/15 text-tg-hint bg-tg-secondary-bg'
                      }`}
                    >
                      <MapPin size={20} /> {t('delivery', 'Delivery')}
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
                              ? 'border-brand-primary bg-brand-primary/5 shadow-sm' 
                              : 'border-tg-hint/15 bg-tg-secondary-bg hover:bg-tg-hint/5'
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
                    <h3 id="delivery-address-label" className="font-semibold text-sm">{t('deliveryAddress', 'Delivery Address')}</h3>
                    <textarea 
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      placeholder={t('enterFullAddress', 'Enter your full address...')}
                      aria-labelledby="delivery-address-label"
                      className="w-full bg-tg-secondary-bg border border-tg-hint/15 rounded-2xl p-4 text-sm focus:outline-none focus:border-brand-primary min-h-[88px] text-tg-text"
                      rows={3}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {userProfile && userProfile.loyaltyPoints > 0 && (
                  <div className="bg-brand-primary/10 border border-brand-primary/20 rounded-2xl p-4 flex justify-between items-center transition-all">
                    <div>
                      <div className="font-bold text-brand-primary flex items-center gap-2">
                        <Coins size={20} weight="fill" /> 
                        {userProfile.loyaltyPoints} {t('pointsAvailable', 'Points Available')}
                      </div>
                      <div className="text-xs text-brand-primary/80 mt-1">
                        {t('usePointsText', 'Use {{points}} points for {{discount}} off', {
                          points: Math.min(userProfile.loyaltyPoints, Math.round((total + deliveryFee) * 100)),
                          discount: formatCurrency(Math.min(maxDiscountFromPoints, total + deliveryFee))
                        })}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer min-h-[44px] px-2">
                      <input type="checkbox" className="sr-only peer" checked={usePoints} onChange={() => setUsePoints(!usePoints)} aria-label="Use loyalty points" />
                      <div className="w-11 h-6 bg-tg-hint/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-sm">{t('paymentMethod')}</h3>
                  <button 
                    onClick={() => setMethod('khqr')}
                    aria-pressed={method === 'khqr'}
                    className={`rounded-2xl border p-4 flex justify-between items-center transition-all text-left ${
                      method === 'khqr' 
                        ? 'border-brand-primary bg-brand-primary/5 shadow-sm' 
                        : 'border-tg-hint/15 bg-tg-secondary-bg hover:bg-tg-hint/5'
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

                  <button 
                    onClick={() => setMethod('cash')}
                    aria-pressed={method === 'cash'}
                    className={`rounded-2xl border p-4 flex justify-between items-center transition-all text-left ${
                      method === 'cash' 
                        ? 'border-brand-primary bg-brand-primary/5 shadow-sm' 
                        : 'border-tg-hint/15 bg-tg-secondary-bg hover:bg-tg-hint/5'
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
                        <span className="font-medium text-tg-text">{formatCurrency(deliveryFee)}</span>
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
            <div className="max-w-md mx-auto px-4 pt-4 pb-8 flex gap-3">
              {step === 1 ? (
                <Button fullWidth onClick={handleNext} className="py-4 flex items-center justify-center gap-2">
                  {t('continueToPayment', 'Continue to Payment')} <CaretRight size={20} />
                </Button>
              ) : (
                <>
                  <button 
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 bg-tg-secondary-bg hover:bg-tg-hint/5 text-tg-text font-bold rounded-2xl active:scale-95 transition-transform border border-tg-hint/15"
                  >
                    {t('back', 'Back')}
                  </button>
                  <Button className="flex-[2] py-4" onClick={handleConfirm} disabled={isLoading}>
                    {isLoading ? t('processing', 'Processing...') : `${t('pay', 'Pay')} ${formatCurrency(finalTotal)}`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
