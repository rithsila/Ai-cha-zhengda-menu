export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Visible label rendered beside the track. */
  label?: string;
  /** Accessible name when there is no visible label (or to override it). */
  srLabel?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  srLabel,
  className = '',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={srLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-xl',
        'transition-[background-color,color] duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'relative h-7 w-12 shrink-0 rounded-full border',
          'transition-[background-color,border-color] duration-150 ease-out',
          checked
            ? 'border-transparent bg-accent'
            : 'border-border-strong bg-surface-sunken',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 left-1 size-5 rounded-full border border-border bg-surface-raised',
            'transition-transform duration-150 ease-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      {label ? (
        <span className="text-sm font-medium text-ink">{label}</span>
      ) : null}
    </button>
  );
}
