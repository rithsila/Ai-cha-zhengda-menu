import type { Brand } from '../../types';
import { useTranslation } from 'react-i18next';

interface CategoryScrollerProps {
  categories: string[];
  activeCategory: string;
  onChange: (cat: string) => void;
  brand: Brand;
}

export function CategoryScroller({ categories, activeCategory, onChange, brand }: CategoryScrollerProps) {
  const { t } = useTranslation();
  const activeBg = brand === 'ai-cha' ? 'bg-brand-primary' : 'bg-brand-zhengda';

  return (
    <div className="relative mb-4">
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide mask-edges-x px-4 -mx-4">
        {categories.map((cat) => (
          <button 
            key={cat}
            onClick={() => onChange(cat)}
            className={`px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat 
                ? `${activeBg} text-white` 
                : 'bg-tg-secondary-bg text-tg-text'
            }`}
          >
            {t(cat)}
          </button>
        ))}
      </div>
    </div>
  );
}
