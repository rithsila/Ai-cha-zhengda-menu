
import type { Brand } from '../../types';

interface BrandTabsProps {
  activeBrand: Brand;
  onChange: (brand: Brand) => void;
}

export function BrandTabs({ activeBrand, onChange }: BrandTabsProps) {
  return (
    <div className="flex bg-white/10 backdrop-blur-xl p-1.5 rounded-2xl mb-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] border border-white/20">
      <button
        onClick={() => onChange('ai-cha')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
          activeBrand === 'ai-cha' 
            ? 'bg-white/95 text-brand-primary shadow-md ring-1 ring-black/5' 
            : 'text-white/90 hover:bg-white/10 hover:text-white'
        }`}
      >
        <img src="/images/aicha-logo.png" alt="Ai-Cha" className={`h-8 w-auto object-contain transition-all duration-300 ${activeBrand === 'ai-cha' ? 'drop-shadow-sm' : 'opacity-70 grayscale hover:grayscale-0'}`} />
        Ai-Cha
      </button>
      <button
        onClick={() => onChange('zhengda')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
          activeBrand === 'zhengda' 
            ? 'bg-white/95 text-brand-zhengda shadow-md ring-1 ring-black/5' 
            : 'text-white/90 hover:bg-white/10 hover:text-white'
        }`}
      >
        <img src="/images/zhengda_logo_cropped.png" alt="Zhengda" className={`h-8 w-auto object-contain transition-all duration-300 ${activeBrand === 'zhengda' ? 'drop-shadow-sm' : 'opacity-70 grayscale hover:grayscale-0'}`} />
        Zhengda
      </button>
    </div>
  );
}
