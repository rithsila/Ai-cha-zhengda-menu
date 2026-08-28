
import type { Brand, MenuTabConfig } from '../../types';

interface BrandTabsProps {
  activeBrand: Brand;
  onChange: (brand: Brand) => void;
  tabs?: MenuTabConfig[];
}

const DEFAULT_TABS: MenuTabConfig[] = [
  { id: 'ai-cha', label: 'Ai-Cha', icon: '/images/aicha-logo.webp', enabled: true },
  { id: 'zhengda', label: 'Zhengda', icon: '/images/zhengda_logo_cropped.webp', enabled: true },
];

export function BrandTabs({ activeBrand, onChange, tabs }: BrandTabsProps) {
  const enabledTabs = (tabs ?? DEFAULT_TABS).filter((t) => t.enabled !== false);

  if (enabledTabs.length === 0) return null;

  return (
    <div className="flex bg-gradient-to-b from-white/20 via-white/10 to-white/5 backdrop-blur-2xl p-1.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.25),inset_0_1.5px_1px_rgba(255,255,255,0.4),inset_0_-1px_1px_rgba(0,0,0,0.15)] border border-white/30 gap-1">
      {enabledTabs.map((tab) => {
        const isActive = activeBrand === tab.id;
        const isZhengda = tab.id === 'zhengda';
        const isAicha = tab.id === 'ai-cha';
        const textColor = isAicha ? 'text-brand-primary' : isZhengda ? 'text-brand-zhengda' : 'text-amber-500';

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 rounded-xl text-sm font-bold transition-all duration-300 min-w-0 ${
              isActive
                ? `bg-white/95 ${textColor} shadow-[0_4px_16px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-black/5`
                : 'text-white/90 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.icon && (
              <img
                src={tab.icon}
                alt={tab.label}
                className={`h-7 w-auto max-w-[32px] object-contain transition-all duration-300 ${
                  isActive ? 'drop-shadow-sm' : 'opacity-70 grayscale hover:grayscale-0'
                }`}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

