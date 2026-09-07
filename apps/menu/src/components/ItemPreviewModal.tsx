import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { MenuItem } from '../types';
import { Button } from './ui/Button';
import { formatCurrency } from '../utils/format';

interface ItemPreviewModalProps {
  item: MenuItem | null;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onClose: () => void;
  onAdd: (item: MenuItem) => void;
}

export function ItemPreviewModal({
  item,
  isFavorite,
  onToggleFavorite,
  onClose,
  onAdd,
}: ItemPreviewModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!item) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [item, onClose]);

  if (!item) return null;

  const isAiCha = item.brand === 'ai-cha';
  const brandBg = isAiCha ? 'bg-brand-primary/10' : 'bg-brand-zhengda/10';

  const handleAdd = () => {
    if (!item.isSoldOut) {
      onAdd(item);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="preview-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md"
      >
        <motion.div
          key="preview-card"
          initial={{ opacity: 0, scale: 0.85, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 16 }}
          transition={{ type: 'spring', damping: 25, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm rounded-3xl bg-tg-bg border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Top Control Bar */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {onToggleFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(item.id);
                }}
                aria-label="Toggle Favorite"
                className={`p-2 rounded-full bg-white/90 backdrop-blur-md shadow-md ring-1 ring-black/5 active:scale-90 transition-transform ${
                  isFavorite ? 'text-brand-primary' : 'text-slate-500'
                }`}
              >
                <Heart size={18} weight={isFavorite ? 'fill' : 'regular'} />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close Preview"
              className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-md shadow-md active:scale-90 transition-transform"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Large Image Preview Area */}
          <div
            className={`relative w-full h-64 sm:h-72 flex items-center justify-center overflow-hidden ${
              item.imageFallback ? 'bg-tg-hint/10' : brandBg
            }`}
          >
            {item.imageFallback ? (
              <img
                src={item.imageFallback}
                alt={t(item.name)}
                className="w-full h-full object-contain p-4 drop-shadow-lg select-none"
                draggable={false}
              />
            ) : (
              <div className="p-4 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-white/50">
                {isAiCha ? (
                  <img
                    src="/images/aicha-icon-cropped.webp"
                    alt="Ai-Cha"
                    className="h-16 w-auto object-contain drop-shadow-sm"
                  />
                ) : (
                  <img
                    src="/images/zhengda_logo_cropped.webp"
                    alt="Zhengda"
                    className="h-16 w-auto object-contain drop-shadow-sm"
                  />
                )}
              </div>
            )}

            {/* Badges on Image */}
            <div className="absolute bottom-3 left-3 flex items-center gap-2">
              <span className="bg-white/95 backdrop-blur-md text-xs font-black px-3 py-1 rounded-full text-brand-primary shadow-md ring-1 ring-black/5">
                {formatCurrency(item.basePrice)}
              </span>
              {item.canClaim && !item.isSoldOut && (
                <span className="bg-brand-primary text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                  <span>🎁</span>
                  <span>10 Stamps</span>
                </span>
              )}
            </div>

            {item.isSoldOut && (
              <div className="absolute top-3 left-3 bg-red-500/95 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
                {t('soldOut', 'Sold Out')}
              </div>
            )}
          </div>

          {/* Item Details */}
          <div className="p-5 flex-1 overflow-y-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  isAiCha
                    ? 'bg-brand-primary/10 text-brand-primary'
                    : 'bg-brand-zhengda/10 text-brand-zhengda'
                }`}
              >
                {isAiCha ? 'Ai-Cha' : 'Zhengda'}
              </span>
              {item.category && (
                <span className="text-[11px] text-tg-hint font-medium">
                  {t(item.category)}
                </span>
              )}
            </div>

            <h2 className="text-xl font-extrabold text-tg-text leading-tight mb-2">
              {t(item.name)}
            </h2>

            {item.description ? (
              <p className="text-sm text-tg-hint leading-relaxed">
                {t(item.description)}
              </p>
            ) : (
              <p className="text-xs text-tg-hint italic">
                {t('noDescription', 'Freshly prepared for you.')}
              </p>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="p-4 bg-tg-bg border-t border-tg-hint/15">
            <Button
              fullWidth
              brand={item.brand}
              onClick={handleAdd}
              disabled={item.isSoldOut}
              className="py-3.5 text-base font-bold shadow-md"
            >
              {item.isSoldOut
                ? t('soldOut', 'Sold Out')
                : `${t('add', 'ADD')} • ${formatCurrency(item.basePrice)}`}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
