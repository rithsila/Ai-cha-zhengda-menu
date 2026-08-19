import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /**
   * Flat by default. Set raised only for floating layers (popovers, dialogs)
   * to add the subtle --shadow-raised.
   */
  raised?: boolean;
}

const paddingClasses: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({
  children,
  className = '',
  padding = 'md',
  raised = false,
}: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-border bg-surface',
        paddingClasses[padding],
        raised ? 'shadow-raised' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
