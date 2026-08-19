import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { CaretRight, MapPin, Storefront, Coins, CaretLeft, X } from '@phosphor-icons/react';
import twa from '@twa-dev/sdk';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const WebApp = (twa as any)?.WebApp || twa || {};

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

function LocationMarker({ position, setPosition }: any) {
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom());
    }
  }, [position, map]);

  return position === null ? null : (
    <Marker 
      position={position} 
      icon={customIcon} 
      draggable={true} 
      eventHandlers={{
        dragend: (e) => {
          setPosition(e.target.getLatLng());
        }
      }} 
    />
  );
}
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
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<'khqr' | 'cash'>('khqr');
  const [orderType, setOrderType] = useState<'pickup' | 'delivery'>('pickup');
  const [branchId, setBranchId] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [pointsPerDollar, setPointsPerDollar] = useState(100);
  
  const [paymentScreen, setPaymentScreen] = useState<{ checkoutUrl: string; khqrSvg: string; orderId: string; } | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    let interval: any;
    if (paymentScreen) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:4000/api/orders/${paymentScreen.orderId}`);
          const data = await res.json();
          if (data.status === 'paid') {
            setPaymentScreen(null);
            onSuccess(data.pickupCode);
          }
        } catch {}
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [paymentScreen, onSuccess]);

  // Fetch branches and user profile dynamically when open, reset on close
  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStep(1);
      setError(null);
      setMethod('khqr');
      setOrderType('pickup');
      setDeliveryAddress('');
      setDeliveryLat(null);
      setDeliveryLng(null);
      setPointsToUse(0);
      setBranchId('');
      return;
    }

    const fetchData = async () => {
      try {
        const [branchRes, userRes, cfgRes] = await Promise.all([
          fetch('http://localhost:4000/api/branches'),
          fetch(`http://localhost:4000/api/user/${WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id'}`),
          fetch('http://localhost:4000/api/config')
        ]);
        if (branchRes.ok) {
          const data = await branchRes.json();
          setBranches(data);
          if (data.length > 0) setBranchId(data[0].id);
        }
        if (userRes.ok) {
          setUserProfile(await userRes.json());
        }
        if (cfgRes.ok) {
          const rows: { key: string; value: string }[] = await cfgRes.json();
          const rate = Number(rows.find(r => r.key === 'pointsPerDollar')?.value);
          if (Number.isFinite(rate) && rate > 0) setPointsPerDollar(rate);
        }
      } catch (err) {
        console.error('Failed to fetch checkout data', err);
      }
    };
    fetchData();
  }, [isOpen]);

  const deliveryFee = orderType === 'delivery' ? 1.00 : 0;
  const maxUsablePoints = userProfile
    ? Math.min(userProfile.loyaltyPoints, Math.floor((total + deliveryFee) * pointsPerDollar))
    : 0;
  const discountApplied = pointsToUse / pointsPerDollar;
  const finalTotal = Math.max(0, total + deliveryFee - discountApplied);

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
      const response = await fetch('http://localhost:4000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          paymentMethod: method,
          telegramUserId: WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id',
          branchId: orderType === 'pickup' ? branchId : null,
          orderType,
          deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
          deliveryLat: orderType === 'delivery' ? deliveryLat : null,
          deliveryLng: orderType === 'delivery' ? deliveryLng : null,
          pointsToUse
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create order');
      }

      const orderData = await response.json();

      if (method === 'khqr') {
        const abaRes = await fetch('http://localhost:4000/api/payment/aba/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: orderData.id }),
        });
        
        if (!abaRes.ok) {
          throw new Error('Failed to generate ABA payment link');
        }
        
        const abaData = await abaRes.json();
        
        setPaymentScreen({
          checkoutUrl: abaData.checkoutUrl,
          khqrSvg: abaData.khqrSvg,
          orderId: orderData.id
        });
        setStep(3);
        setIsLoading(false);
        return;
      }

      onSuccess(orderData.pickupCode);
    } catch (err: any) {
      setError(err.message || 'An error occurred during checkout');
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
          className="fixed inset-0 z-50 bg-tg-bg/75 backdrop-blur-lg backdrop-brightness-200 flex flex-col overflow-hidden"
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

            {step === 3 && paymentScreen ? (
              <div className="flex flex-col gap-6 items-center w-full">
                <div className="text-center">
                  <h3 className="font-bold text-lg mb-2 text-tg-text">Complete Payment</h3>
                  <p className="text-sm text-tg-hint mb-4">You can pay with ABA Mobile or scan the KHQR below.</p>
                </div>
                
                <button 
                  onClick={() => {
                    if (WebApp?.openLink) {
                      WebApp.openLink(paymentScreen.checkoutUrl);
                    } else {
                      window.location.href = paymentScreen.checkoutUrl;
                    }
                  }}
                  className="w-full bg-[#005E8E] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-[#004A70] transition-colors"
                >
                  Pay with ABA Mobile
                </button>

                <div className="relative w-full max-w-[280px] bg-white p-4 rounded-2xl shadow-sm border border-tg-hint/15 mt-4 flex items-center justify-center">
                  <img src={paymentScreen.khqrSvg} alt="KHQR" className="w-full max-w-[250px] h-auto" />
                </div>
                
                <p className="text-xs text-tg-hint text-center flex items-center justify-center gap-2 mt-4 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-brand-primary"></span> Waiting for payment confirmation...
                </p>
              </div>
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h3 id="delivery-address-label" className="font-semibold text-sm">{t('deliveryAddress', 'Delivery Address')}</h3>
                      </div>
                      <textarea 
                        value={deliveryAddress}
                        onChange={e => setDeliveryAddress(e.target.value)}
                        placeholder={t('enterFullAddress', 'Enter your full address...')}
                        aria-labelledby="delivery-address-label"
                        className="w-full bg-tg-secondary-bg border border-tg-hint/15 rounded-2xl p-4 text-sm focus:outline-none focus:border-brand-primary min-h-[88px] text-tg-text"
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-sm">Pin Location</h3>
                        <button 
                          type="button" 
                          onClick={() => {
                            setIsLocating(true);
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setDeliveryLat(pos.coords.latitude);
                                setDeliveryLng(pos.coords.longitude);
                                setIsLocating(false);
                              },
                              (err) => {
                                console.error(err);
                                setIsLocating(false);
                                setError('Could not get your location. Please drag the pin on the map.');
                              }
                            );
                          }}
                          className="text-brand-primary text-xs font-bold bg-brand-primary/10 px-3 py-1 rounded-full"
                          disabled={isLocating}
                        >
                          {isLocating ? 'Locating...' : 'Use Current Location'}
                        </button>
                      </div>
                      <div className="h-[200px] w-full rounded-2xl overflow-hidden border border-tg-hint/15 relative z-0">
                        <MapContainer 
                          center={deliveryLat && deliveryLng ? [deliveryLat, deliveryLng] : [11.5564, 104.9282]}
                          zoom={13} 
                          style={{ height: '100%', width: '100%' }}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          />
                          <LocationMarker 
                            position={deliveryLat && deliveryLng ? {lat: deliveryLat, lng: deliveryLng} : null}
                            setPosition={(pos: any) => { setDeliveryLat(pos.lat); setDeliveryLng(pos.lng); }}
                          />
                        </MapContainer>
                      </div>
                    </div>
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
          <div className="sticky bottom-0 bg-tg-bg/90 backdrop-blur-md border-t border-tg-hint/10 w-full z-10">
            {step !== 3 && (
              <div className="max-w-md mx-auto px-4 pt-4 pb-8 flex gap-3">
                {step === 1 ? (
                  <Button fullWidth onClick={handleNext} className="py-4 flex items-center justify-center gap-2">
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
