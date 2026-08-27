import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { CartItem } from '../types';
import { formatCurrency } from '../utils/format';
import { Button } from './ui/Button';
import { CATALOG } from '../data/catalog';

interface CartDrawerProps {
  isOpen: boolean;
  cart: CartItem[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onUpdateQuantity: (id: string, newQuantity: number) => void;
  onEdit: (item: CartItem) => void;
  onCheckout: () => void;
}

export function CartDrawer({ isOpen, cart, onClose, onRemove, onUpdateQuantity, onEdit, onCheckout }: CartDrawerProps) {
  const { t } = useTranslation();
  const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 z-40 flex flex-col justify-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="bg-tg-bg/75 backdrop-blur-lg backdrop-brightness-200 w-full rounded-t-3xl max-h-[85vh] flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.15)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-tg-hint/20 flex justify-between items-center sticky top-0 bg-tg-bg/90 backdrop-blur-md z-10">
              <h2 className="text-xl font-bold">{t('cartTitle')}</h2>
              <button onClick={onClose} className="p-2 bg-tg-secondary-bg rounded-full text-tg-hint">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-tg-secondary-bg flex items-center justify-center mb-6 text-tg-hint/80">
                    <ShoppingCart size={40} weight="duotone" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{t('emptyCartTitle', 'Your cart is empty')}</h3>
                  <p className="text-tg-hint text-sm mb-6 max-w-[250px]">
                    {t('emptyCartDesc', 'Looks like you haven\'t added any delicious drinks yet.')}
                  </p>
                  <Button 
                    onClick={onClose}
                    className="px-8"
                  >
                    {t('browseMenu')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => {
                    const menuItem = CATALOG.find(i => i.id === item.menuItemId);
                    const hasModifiers = menuItem && menuItem.modifiers && menuItem.modifiers.length > 0;
                    
                    return (
                      <div key={item.id} className="bg-tg-secondary-bg p-4 rounded-2xl flex flex-col gap-3 relative">
                        <div className="flex justify-between items-start gap-2">
                          <div className="font-bold flex-1">{t(item.name)}</div>
                          <div className="font-bold">{formatCurrency(item.totalPrice)}</div>
                        </div>
                        
                        {Object.entries(item.selectedModifiers).length > 0 ? (
                          <div 
                            className="text-xs text-tg-hint bg-tg-bg/50 p-2 rounded-xl cursor-pointer hover:bg-tg-bg transition-colors flex justify-between items-center"
                            onClick={() => onEdit(item)}
                          >
                            <div>
                              {Object.values(item.selectedModifiers).flat().map(opt => (
                                <div key={opt.id}>• {t(opt.name)}</div>
                              ))}
                            </div>
                            <div className="text-brand-primary font-medium px-2 py-1 bg-brand-primary/10 rounded-lg">{t('edit')}</div>
                          </div>
                        ) : hasModifiers ? (
                          <div className="text-xs text-brand-primary font-medium cursor-pointer flex items-center mt-[-4px]" onClick={() => onEdit(item)}>
                            + {t('addModifiers', 'Add Modifiers')}
                          </div>
                        ) : null}
                        
                        <div className="flex justify-between items-center pt-1 mt-1 border-t border-tg-hint/10">
                          <button 
                            onClick={() => onRemove(item.id)}
                            className="text-xs text-brand-primary bg-brand-primary/10 px-3 py-1.5 rounded-xl font-medium"
                          >
                            {t('remove')}
                          </button>
                          
                          <div className="flex items-center gap-3 bg-tg-bg p-1 rounded-full border border-tg-hint/10">
                            <button 
                              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-tg-text bg-tg-secondary-bg active:scale-95 transition-transform"
                            >
                              −
                            </button>
                            <span className="font-bold text-sm min-w-[1.2rem] text-center">{item.quantity}</span>
                            <button 
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                              className="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center font-bold active:scale-95 transition-transform"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-tg-hint/20 bg-tg-bg/90 backdrop-blur-md sticky bottom-0 pb-8">
                <div className="flex justify-between items-center font-bold text-xl mb-6">
                  <span>{t('total')}</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <Button fullWidth onClick={onCheckout} className="py-4 text-lg">
                  {t('proceed')}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
