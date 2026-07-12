import { forwardRef } from 'react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};
import { motion } from 'motion/react';
import type { HTMLMotionProps } from 'motion/react';

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: 'primary' | 'secondary';
  brand?: 'ai-cha' | 'zhengda';
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', brand = 'ai-cha', fullWidth, onClick, children, ...props }, ref) => {
    const handleTap = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (WebApp?.HapticFeedback) {
        WebApp.HapticFeedback.impactOccurred?.('light');
      }
      onClick?.(e);
    };

    let bgClass = '';
    let textClass = 'text-white';

    if (variant === 'primary') {
      bgClass = brand === 'ai-cha' ? 'bg-brand-primary' : 'bg-brand-zhengda';
    } else {
      bgClass = 'bg-tg-secondary-bg';
      textClass = 'text-tg-text';
    }

    const widthClass = fullWidth ? 'w-full' : '';

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.96 }}
        onClick={handleTap}
        className={`py-3 px-6 rounded-xl text-sm font-bold active:opacity-90 transition-colors flex items-center justify-center gap-2 ${bgClass} ${textClass} ${widthClass} ${className}`}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';
