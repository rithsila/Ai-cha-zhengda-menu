import { motion, AnimatePresence } from 'motion/react';
import type { MenuItem, ModifierGroup, ModifierOption } from '../types';
import { Button } from './ui/Button';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/format';

interface ModifierModalProps {
  item: MenuItem | null;
  initialSelected?: Record<string, ModifierOption[]>;
  editingCartItemId?: string | null;
  onClose: () => void;
  onConfirm: (item: MenuItem, selectedOptions: Record<string, ModifierOption[]>, editingCartItemId?: string | null) => void;
}

export function ModifierModal({ item, initialSelected, editingCartItemId, onClose, onConfirm }: ModifierModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Record<string, ModifierOption[]>>(initialSelected || {});
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (initialSelected) {
      setSelected(initialSelected);
    }
  }, [initialSelected]);

  useEffect(() => {
    if (item) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [item]);

  if (!item) return null;

  const handleToggle = (group: ModifierGroup, option: ModifierOption) => {
    setSelected(prev => {
      const current = prev[group.id] || [];
      if (group.type === 'single') {
        return { ...prev, [group.id]: [option] };
      } else {
        const exists = current.find(o => o.id === option.id);
        if (exists) {
          return { ...prev, [group.id]: current.filter(o => o.id !== option.id) };
        } else {
          return { ...prev, [group.id]: [...current, option] };
        }
      }
    });
  };

  const requiredGroups = item.modifiers?.filter(g => g.required) ?? [];
  const missingRequired = requiredGroups.filter(
    g => !selected[g.id] || selected[g.id].length === 0
  );
  const isValid = missingRequired.length === 0;

  const handleSubmit = () => {
    if (!isValid) {
      setAttempted(true);
      return;
    }
    onConfirm(item, selected, editingCartItemId);
  };

  const calculateTotal = () => {
    let total = item.basePrice;
    Object.values(selected).forEach(options => {
      options.forEach(opt => total += opt.priceDelta);
    });
    return total;
  };

  const isGroupMissing = (groupId: string) =>
    attempted && requiredGroups.some(g => g.id === groupId) && (!selected[groupId] || selected[groupId].length === 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-50 flex items-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-tg-bg/75 backdrop-blur-lg backdrop-brightness-200 w-full rounded-t-3xl max-h-[85vh] overflow-y-auto pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b border-tg-hint/20 sticky top-0 bg-tg-bg/90 backdrop-blur-md z-10">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">{t(item.name)}</h2>
                {item.description && <p className="text-sm text-tg-hint">{t(item.description)}</p>}
              </div>
              <button onClick={onClose} className="p-2 bg-tg-secondary-bg rounded-full text-tg-hint">
                ✕
              </button>
            </div>
          </div>

          <div className="p-4 space-y-6">
            {item.modifiers?.map(group => (
              <div key={group.id}>
                <div className="flex justify-between items-end mb-3">
                  <h3 className={`font-bold ${isGroupMissing(group.id) ? 'text-[#E53935]' : ''}`}>
                    {t(group.name)}
                    {isGroupMissing(group.id) && (
                      <span className="text-xs font-normal ml-2">— {t('pleaseSelect')}</span>
                    )}
                  </h3>
                  <span className={`text-xs ${isGroupMissing(group.id) ? 'text-[#E53935] font-bold' : 'text-tg-hint'}`}>
                    {group.required ? t('required') : t('optional')} {group.type === 'single' ? t('pick1') : t('multi')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map(opt => {
                    const isSelected = (selected[group.id] || []).some(o => o.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleToggle(group, opt)}
                        className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                          isSelected 
                            ? 'border-brand-primary text-brand-primary bg-brand-primary/10 font-bold'
                            : isGroupMissing(group.id)
                              ? 'border-brand-primary/40 text-tg-text bg-tg-secondary-bg'
                              : 'border-tg-hint/20 text-tg-text bg-tg-secondary-bg'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span>
                            {t(opt.name)} {opt.priceDelta > 0 && `(+${formatCurrency(opt.priceDelta)})`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-0 bg-tg-bg/90 backdrop-blur-md p-4 border-t border-tg-hint/20 pb-8">
            {attempted && !isValid && (
              <p className="text-xs text-[#E53935] text-center mb-3">
                {t('selectRequiredOptions')}
              </p>
            )}
            <Button 
              fullWidth 
              brand={item.brand}
              onClick={handleSubmit}
              className="py-4 font-bold text-lg"
            >
              {editingCartItemId ? t('saveChanges') : t('addToCart')} - {formatCurrency(calculateTotal())}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

