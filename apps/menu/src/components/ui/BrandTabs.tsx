
import type { Brand } from '../../types';

interface BrandTabsProps {
  activeBrand: Brand;
  onChange: (brand: Brand) => void;
}

export function BrandTabs({ activeBrand, onChange }: BrandTabsProps) {
  return (
    <div className="flex bg-gradient-to-b from-white/20 via-white/10 to-white/5 backdrop-blur-2xl p-1.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.25),inset_0_1.5px_1px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(0,0,0,0.15)] border border-white/30">
      <button
        onClick={() => onChange('ai-cha')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
          activeBrand === 'ai-cha' 
            ? 'bg-white/95 text-brand-primary shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-black/5' 
            : 'text-white/90 hover:bg-white/10 hover:text-white'
        }`}
      >
        <img src="/images/aicha-logo.webp" alt="Ai-Cha" className={`h-8 w-auto object-contain transition-all duration-300 ${activeBrand === 'ai-cha' ? 'drop-shadow-sm' : 'opacity-70 grayscale hover:grayscale-0'}`} />
        Ai-Cha
      </button>
      <button
        onClick={() => onChange('zhengda')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
          activeBrand === 'zhengda' 
            ? 'bg-white/95 text-brand-zhengda shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-black/5' 
            : 'text-white/90 hover:bg-white/10 hover:text-white'
        }`}
      >
        <img src="/images/zhengda_logo_cropped.webp" alt="Zhengda" className={`h-8 w-auto object-contain transition-all duration-300 ${activeBrand === 'zhengda' ? 'drop-shadow-sm' : 'opacity-70 grayscale hover:grayscale-0'}`} />
        Zhengda
      </button>
    </div>
  );
}
