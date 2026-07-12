import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';

interface CheckoutModalProps {
  isOpen: boolean;
  total: number;
  cart: CartItem[];
  onClose: () => void;
  onSuccess: (pickupCode: string) => void;
}

export function CheckoutModal({ isOpen, total, cart, onClose, onSuccess }: CheckoutModalProps) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<'khqr' | 'cash'>('khqr');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:4000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          totalAmount: total,
          paymentMethod: method,
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-tg-bg w-full max-w-sm rounded-3xl p-6 flex flex-col gap-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <h2 className="text-2xl font-bold">{t('checkout')}</h2>
              <p className="text-tg-hint mt-1">{t('total')}: {formatCurrency(total)}</p>
            </div>

            {error && (
              <div className="bg-[#E53935]/10 text-[#E53935] text-sm p-3 rounded-xl border border-[#E53935]/20 font-medium text-center">
                {error}
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

            <Button fullWidth onClick={handleConfirm} className="py-4" disabled={isLoading}>
              {isLoading ? t('processing', 'Processing...') : t('confirmOrder')}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
