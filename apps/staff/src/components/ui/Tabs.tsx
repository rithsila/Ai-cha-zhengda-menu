import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small count bubble rendered in accent next to the label. */
  badge?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  /** Id of the currently active tab. */
  active: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  size?: 'md' | 'lg';
  className?: string;
}

const tabSizeClasses: Record<NonNullable<TabsProps['size']>, string> = {
  md: 'h-11 px-4 text-sm [&_svg]:size-4',
  lg: 'h-13 px-5 text-base [&_svg]:size-5',
};

export function Tabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectAndFocus = (index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    tabRefs.current[index]?.focus();
    onChange(tab.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    if (currentIndex === -1) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      selectAndFocus(nextIndex);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={[
        'inline-flex items-center gap-1 rounded-xl bg-surface-sunken p-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={[
              'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
              'transition-[background-color,color,transform] duration-150 ease-out',
              tabSizeClasses[size],
              isActive
                ? 'border border-border bg-surface-raised text-ink'
                : 'border border-transparent text-ink-soft hover:bg-surface-raised/60 hover:text-ink',
            ].join(' ')}
          >
            {tab.icon ? (
              <span className="shrink-0" aria-hidden="true">
                {tab.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{tab.label}</span>
            {typeof tab.badge === 'number' ? (
              <span className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-xs font-semibold leading-none text-on-accent">
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
