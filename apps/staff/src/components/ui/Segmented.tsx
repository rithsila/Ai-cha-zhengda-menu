import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Small count rendered after the label, e.g. how many items match. */
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name for the group. */
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

/*
 * A filter control, not navigation.
 *
 * The dashboard previously used <Tabs> for filtering, which announces "tab 1 of 3"
 * to a screen reader and promises a tabpanel that does not exist. This is a real
 * radiogroup: arrow keys move between options, Tab enters and leaves the group,
 * and the selected option is announced as checked.
 */
const sizeClasses = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
} as const;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  className = '',
}: SegmentedProps<T>) {
  const move = (delta: number) => {
    const index = options.findIndex((option) => option.id === value);
    if (index === -1) return;
    const next = options[(index + delta + options.length) % options.length];
    onChange(next.id);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center gap-1 rounded-xl bg-surface-sunken p-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.id)}
            className={[
              'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap',
              'transition-[background-color,color] duration-150 ease-out',
              sizeClasses[size],
              selected
                ? 'border border-border bg-surface-raised text-ink'
                : 'border border-transparent text-ink-soft hover:bg-surface-raised/60 hover:text-ink',
            ].join(' ')}
          >
            {option.icon ? (
              <span className="shrink-0 [&_svg]:size-4" aria-hidden="true">
                {option.icon}
              </span>
            ) : null}
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={`tabular-nums ${selected ? 'text-ink-soft' : 'text-ink-faint'}`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
