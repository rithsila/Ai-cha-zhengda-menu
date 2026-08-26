import { motion } from 'motion/react';
import { Heart } from '@phosphor-icons/react';
import type { MenuItem } from '../types';
import { Button } from './ui/Button';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/format';

interface MenuItemCardProps {
  item: MenuItem;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
  onAdd: (item: MenuItem) => void;
}

export function MenuItemCard({ item, isFavorite, onToggleFavorite, onAdd }: MenuItemCardProps) {
  const { t } = useTranslation();
  const isAiCha = item.brand === 'ai-cha';
  const brandBg = isAiCha ? 'bg-brand-primary/10' : 'bg-brand-zhengda/10';

  return (
    <motion.div 
      whileTap={{ scale: item.isSoldOut ? 1 : 0.98 }}
      className={`bg-tg-secondary-bg rounded-2xl overflow-hidden shadow-sm flex flex-col ${item.isSoldOut ? 'opacity-60 grayscale-[0.5]' : ''}`}
    >
      <div className={`h-32 flex items-center justify-center relative ${item.imageFallback ? 'bg-tg-hint/10' : brandBg}`}>
         {item.imageFallback ? (
           <img 
             src={item.imageFallback} 
             alt={t(item.name)} 
             loading="lazy"
             decoding="async"
             className="w-full h-full object-contain p-2" 
           />
         ) : (
           <div className="p-2.5 rounded-full bg-white/95 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-white/50 ring-1 ring-black/5">
             {isAiCha ? (
               <img src="/images/aicha-icon-cropped.webp" alt="Ai-Cha" className="h-10 w-auto object-contain drop-shadow-sm" />
             ) : (
               <img src="/images/zhengda_logo_cropped.webp" alt="Zhengda" className="h-10 w-auto object-contain drop-shadow-sm" />
             )}
           </div>
         )}
         {item.isSoldOut ? (
           <div className="absolute top-2 right-2 bg-red-500/95 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
             Sold Out
           </div>
         ) : (
           <div className="absolute top-2 right-2 bg-white/95 text-xs font-black px-2.5 py-1 rounded-full text-brand-primary shadow-sm ring-1 ring-black/5">
             {formatCurrency(item.basePrice)}
           </div>
         )}
         {item.canClaim && !item.isSoldOut && (
           <div className="absolute bottom-2 left-2 bg-brand-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
             <span>🎁</span>
             <span>10 Stamps</span>
           </div>
         )}
          {onToggleFavorite && (
            <button 
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.id); }}
              className={`absolute top-2 left-2 p-1.5 rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 transition-transform active:scale-90 ${isFavorite ? 'text-brand-primary' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <Heart size={16} weight={isFavorite ? "fill" : "regular"} />
            </button>
          )}
      </div>
      <div className="p-3 flex flex-col flex-1 justify-between">
        <div>
          <h3 className="font-bold text-sm leading-tight mb-1">{t(item.name)}</h3>
        {item.description && (
          <p className="text-xs text-tg-hint line-clamp-2 mb-3">
            {t(item.description)}
          </p>
        )}
        </div>
        <Button 
          brand={item.brand}
          onClick={() => !item.isSoldOut && onAdd(item)}
          className={`py-2 ${item.isSoldOut ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={item.isSoldOut}
        >
          {item.isSoldOut ? t('soldOut', 'Sold Out') : t('add', 'ADD')}
        </Button>
      </div>
    </motion.div>
  );
}
