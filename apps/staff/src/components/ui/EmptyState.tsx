import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Leading visual — pass a lucide icon; sized to 40px automatically. */
  icon: ReactNode;
  title: string;
  description?: string;
  /** Optional call-to-action, e.g. a <Button>. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="mb-1 text-ink-faint [&_svg]:size-10" aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-ink-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
