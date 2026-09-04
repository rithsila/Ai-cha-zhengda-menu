export interface SkeletonProps {
  /** Size the block, e.g. "h-4 w-32" or "h-24 w-full". */
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'rounded-none bg-surface-sunken motion-safe:animate-pulse',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}
