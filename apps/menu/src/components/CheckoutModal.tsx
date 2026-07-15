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

  // Fetch branches and user profile on mount
  useEffect(() => {
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
  }, []);

  const maxDiscountFromPoints = userProfile ? userProfile.loyaltyPoints / 100 : 0;
  const discountApplied = usePoints ? Math.min(maxDiscountFromPoints, total) : 0;
  const finalTotal = total - discountApplied;

  const handleNext = () => {
    if (!branchId) {
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
          totalAmount: total, // send original total, server handles points logic
          paymentMethod: method,
          telegramUserId: WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id',
          branchId,
          orderType,
          deliveryAddress,
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
          transition={shouldReduceMotion ? { duration: 0.2 } : { type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-50 bg-tg-bg flex flex-col overflow-hidden"
        >
          {/* Sticky top navigation header */}
          <div className="sticky top-0 bg-tg-bg/95 backdrop-blur-md border-b border-tg-hint/10 px-4 py-3 flex items-center justify-between z-10">
            <button
              onClick={step === 2 ? () => setStep(1) : onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-tg-hint/10 text-tg-text transition-colors"
              aria-label="Back"
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
          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6 max-w-md mx-auto w-full pb-24">
            {step === 2 && (
              <div className="text-center bg-tg-secondary-bg/50 p-4 rounded-2xl border border-tg-hint/5">
                <p className="text-tg-hint text-sm">{t('total', 'Total')}</p>
                <p className="text-3xl font-extrabold text-tg-text mt-1">{formatCurrency(finalTotal)}</p>
              </div>
            )}

            {error && (
              <div className="bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium text-center">
                {error}
              </div>
            )}

            {step === 1 ? (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Select Branch</h3>
                  <div className="flex flex-col gap-2">
                    {branches.map(b => (
                      <button 
                        key={b.id}
                        onClick={() => setBranchId(b.id)}
                        className={`p-3 rounded-xl border-2 transition-colors flex justify-between items-center text-left ${branchId === b.id ? 'border-brand-primary bg-brand-primary/5' : 'border-tg-hint/20 bg-tg-secondary-bg'}`}
                      >
                        <div>
                          <div className="font-bold">{b.name}</div>
                          <div className="text-xs text-tg-hint">{b.address}</div>
                        </div>
                        {branchId === b.id && <div className="w-3 h-3 bg-brand-primary rounded-full" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Order Type</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setOrderType('pickup')}
                      className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 ${orderType === 'pickup' ? 'border-brand-primary text-brand-primary bg-brand-primary/5' : 'border-tg-hint/20 text-tg-hint'}`}
                    >
                      <Storefront size={20} /> Pickup
                    </button>
                    <button 
                      onClick={() => setOrderType('delivery')}
                      className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 ${orderType === 'delivery' ? 'border-brand-primary text-brand-primary bg-brand-primary/5' : 'border-tg-hint/20 text-tg-hint'}`}
                    >
                      <MapPin size={20} /> Delivery
                    </button>
                  </div>
                </div>

                {orderType === 'delivery' && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Delivery Address</h3>
                    <textarea 
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      placeholder="Enter your full address..."
                      className="w-full bg-tg-secondary-bg border-2 border-tg-hint/20 rounded-xl p-3 text-sm focus:outline-none focus:border-brand-primary"
                      rows={3}
                    />
                  </div>
                )}
                
                <Button fullWidth onClick={handleNext} className="py-4 mt-2">
                  Continue to Payment <CaretRight size={20} />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {userProfile && userProfile.loyaltyPoints > 0 && (
                  <div className="bg-brand-primary/10 border-2 border-brand-primary/20 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-brand-primary flex items-center gap-2">
                        <Coins size={20} weight="fill" /> 
                        {userProfile.loyaltyPoints} Points Available
                      </div>
                      <div className="text-xs text-brand-primary/80 mt-1">
                        Use {Math.min(userProfile.loyaltyPoints, total * 100)} points for {formatCurrency(Math.min(maxDiscountFromPoints, total))} off
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={usePoints} onChange={() => setUsePoints(!usePoints)} />
                      <div className="w-11 h-6 bg-tg-hint/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                    </label>
                  </div>
                )}

                {usePoints && discountApplied > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold text-brand-primary px-2">
                    <span>Discount Applied:</span>
                    <span>-{formatCurrency(discountApplied)}</span>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-sm">{t('paymentMethod')}</h3>
                  <button 
                    onClick={() => setMethod('khqr')}
                    className={`p-4 rounded-xl border-2 transition-colors flex justify-between items-center ${
                      method === 'khqr' ? 'border-brand-primary bg-brand-primary/5' : 'border-tg-hint/20 bg-tg-secondary-bg'
                    }`}
                  >
                    <div className="font-bold text-lg">{t('khqr')}</div>
                    <div className="w-5 h-5 rounded-full border-2 border-brand-primary flex items-center justify-center">
                      {method === 'khqr' && <div className="w-3 h-3 bg-brand-primary rounded-full" />}
                    </div>
                  </button>

                  <button 
                    onClick={() => setMethod('cash')}
                    className={`p-4 rounded-xl border-2 transition-colors flex justify-between items-center ${
                      method === 'cash' ? 'border-brand-primary bg-brand-primary/5' : 'border-tg-hint/20 bg-tg-secondary-bg'
                    }`}
                  >
                    <div className="font-bold text-lg">{t('cash')}</div>
                    <div className="w-5 h-5 rounded-full border-2 border-brand-primary flex items-center justify-center">
                      {method === 'cash' && <div className="w-3 h-3 bg-brand-primary rounded-full" />}
                    </div>
                  </button>
                </div>

                <div className="flex gap-3 mt-2">
                  <button 
                    onClick={() => setStep(1)}
                    className="flex-1 py-4 bg-tg-secondary-bg text-tg-text font-bold rounded-xl active:scale-95 transition-transform"
                  >
                    Back
                  </button>
                  <Button className="flex-[2] py-4" onClick={handleConfirm} disabled={isLoading}>
                    {isLoading ? t('processing', 'Processing...') : `Pay ${formatCurrency(finalTotal)}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
