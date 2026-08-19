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
}

export function PinScreen({
  title,
  subtitle,
  buttonLabel,
  onSubmit,
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
      </Card>
    </div>
  );
}
