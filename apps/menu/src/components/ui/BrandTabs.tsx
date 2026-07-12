
import type { Brand } from '../../types';

interface BrandTabsProps {
  activeBrand: Brand;
  onChange: (brand: Brand) => void;
}

export function BrandTabs({ activeBrand, onChange }: BrandTabsProps) {
  return (
    <div className="flex bg-tg-secondary-bg p-1 rounded-2xl mb-6 shadow-sm">
      <button
        onClick={() => onChange('ai-cha')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors ${
          activeBrand === 'ai-cha' ? 'bg-tg-bg text-brand-primary shadow-sm' : 'text-tg-hint'
        }`}
      >
        <img src="/images/aicha-logo.png" alt="Ai-Cha" className={`h-8 w-auto object-contain ${activeBrand === 'ai-cha' ? '' : 'opacity-50 grayscale'}`} />
        Ai-Cha
      </button>
      <button
        onClick={() => onChange('zhengda')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-colors ${
          activeBrand === 'zhengda' ? 'bg-tg-bg text-brand-zhengda shadow-sm' : 'text-tg-hint'
        }`}
      >
        <img src="/images/zhengda_logo_cropped.png" alt="Zhengda" className={`h-8 w-auto object-contain ${activeBrand === 'zhengda' ? '' : 'opacity-50 grayscale'}`} />
        Zhengda
      </button>
    </div>
  );
}
