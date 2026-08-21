import type { ReactNode } from 'react';

export type BadgeVariant =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'neutral'
  | 'danger'
  | 'delivery'
  | 'pickup'
  | 'success'
  | 'default';

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  /** Optional leading icon slot (sized to 14px). */
  icon?: ReactNode;
  /** Optional leading dot in the badge's own text color. */
  dot?: boolean;
  className?: string;
}

/*
 * Every variant pairs a "soft" tinted background with its "strong" token as
 * text color; each pair is verified >= 4.5:1 in both themes.
 * Order-type tags reuse semantic pairs: delivery = blue (out on the road),
 * pickup = accent green (in-store).
 */
const variantClasses: Record<BadgeVariant, string> = {
  pending: 'bg-status-pending-soft text-status-pending',
  preparing: 'bg-status-preparing-soft text-status-preparing',
  ready: 'bg-status-ready-soft text-status-ready',
  completed: 'bg-status-completed-soft text-status-completed',
  neutral: 'bg-surface-sunken text-ink-soft',
  danger: 'bg-danger-soft text-danger',
  delivery: 'bg-status-preparing-soft text-status-preparing',
  pickup: 'bg-accent-soft text-accent-strong',
  success: 'bg-success-soft text-success',
  default: 'bg-surface-sunken text-ink-soft',
};

export function Badge({
  variant,
  children,
  icon,
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      ) : null}
      {icon ? (
        <span className="shrink-0 [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
