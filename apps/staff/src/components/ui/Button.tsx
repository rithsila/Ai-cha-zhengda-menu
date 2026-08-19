import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';

export type ButtonSize = 'md' | 'lg' | 'icon';

interface ButtonBaseProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  /** Shows a spinner, disables the button, and keeps its width stable. */
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export type ButtonProps = ButtonBaseProps &
  (
    | { size: 'icon'; 'aria-label': string }
    | { size?: Exclude<ButtonSize, 'icon'>; 'aria-label'?: string }
  );

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary:
    'border border-border bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'bg-transparent text-ink hover:bg-surface-sunken',
  danger: 'bg-danger text-on-danger hover:bg-danger-strong',
  success: 'bg-success text-on-success hover:bg-success-strong',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-13 px-6 text-base',
  icon: 'size-11 justify-center p-0',
};

const contentGapClasses: Record<ButtonSize, string> = {
  md: 'gap-2',
  lg: 'gap-2.5',
  icon: '',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'relative inline-flex shrink-0 items-center justify-center rounded-xl font-semibold',
        'transition-[background-color,border-color,color,transform] duration-150 ease-out',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <span
        className={[
          'inline-flex items-center',
          contentGapClasses[size],
          loading ? 'opacity-0' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoaderCircle
            className="size-5 motion-safe:animate-spin"
            aria-hidden="true"
          />
        </span>
      ) : null}
    </button>
  );
}
