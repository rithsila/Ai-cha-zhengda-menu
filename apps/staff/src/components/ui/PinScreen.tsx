import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';

export interface PinScreenProps {
  title: string;
  subtitle?: string;
  buttonLabel: string;
  /** Return/resolve true when the PIN is accepted, false to show an error. */
  onSubmit: (pin: string) => Promise<boolean> | boolean;
  /** Optional handler to initiate Telegram authentication redirect/popup. */
  onTelegramLogin?: () => void;
}

export function PinScreen({
  title,
  subtitle,
  buttonLabel,
  onSubmit,
  onTelegramLogin,
}: PinScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const errorId = useId();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (pin.length === 0) {
      setError('Enter your PIN.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const accepted = await onSubmit(pin);
      if (!accepted) {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page p-4">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={6}
              autoFocus
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder="••••"
              className={[
                'w-full rounded-xl border-2 bg-surface py-3 pr-14 pl-4',
                'text-center text-3xl font-semibold tracking-[0.5em] text-ink indent-[0.5em]',
                'placeholder:text-ink-faint',
                'transition-[border-color] duration-150 ease-out',
                'focus:border-accent focus:outline-none',
                error ? 'border-danger' : 'border-border',
              ].join(' ')}
            />
            <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
              <Button
                variant="ghost"
                size="icon"
                aria-label={show ? 'Hide PIN' : 'Show PIN'}
                aria-pressed={show}
                onClick={() => setShow((previous) => !previous)}
              >
                {show ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <div aria-live="polite" className="mt-3 min-h-5">
            {error ? (
              <p id={errorId} className="text-center text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={loading}
            className="mt-4"
          >
            {buttonLabel}
          </Button>
        </form>

        {onTelegramLogin ? (
          <div className="mt-6">
            <div className="relative mb-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <span className="relative bg-surface px-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Or
              </span>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              onClick={onTelegramLogin}
              className="gap-2.5 bg-[#229ED9]/10 text-[#229ED9] border-[#229ED9]/30 hover:bg-[#229ED9]/20 hover:border-[#229ED9]/50"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
                aria-hidden="true"
                className="shrink-0"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
              </svg>
              <span>Log in with Telegram</span>
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
