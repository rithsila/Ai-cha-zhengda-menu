import { useState, useEffect, useRef } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { API_BASE, saveSession } from '../../lib/api';
import { ShieldCheck, AlertCircle, Send } from 'lucide-react';

interface TelegramAuthScreenProps {
  onSuccess: () => void;
}

export function TelegramAuthScreen({ onSuccess }: TelegramAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devTelegramId, setDevTelegramId] = useState('');
  const widgetContainerRef = useRef<HTMLDivElement>(null);

  const botName = import.meta.env.VITE_BOT_NAME || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'AiChaZhengda_bot';

  // Check URL hash for token from redirect
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('staff_token=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const token = params.get('staff_token');
      const role = (params.get('role') || 'staff') as 'staff' | 'manager';
      const expiresAt = Number(params.get('expiresAt')) || Date.now() + 12 * 60 * 60 * 1000;

      if (token) {
        saveSession({ token, role, expiresAt });
        window.history.replaceState(null, '', window.location.pathname);
        onSuccess();
      }
    }
  }, [onSuccess]);

  // Render official Telegram login widget
  useEffect(() => {
    if (widgetContainerRef.current && !widgetContainerRef.current.hasChildNodes()) {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botName);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-auth-url', `${API_BASE}/api/auth/staff-telegram/callback`);
      script.setAttribute('data-request-access', 'write');
      widgetContainerRef.current.appendChild(script);
    }
  }, [botName]);

  // Dev mode direct login
  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = devTelegramId.trim();
    if (!id) {
      setError('Please enter a Telegram User ID.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/staff-telegram-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramUserId: id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Authentication failed');
      }
      const data = await res.json();
      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate via Telegram');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page p-4">
      <Card padding="lg" className="w-full max-w-sm border-border bg-surface shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-md">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-bold text-ink">Staff &amp; Admin Access</h1>
          <p className="mt-1 text-xs text-ink-soft">
            Authorized Telegram Account Required
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Telegram Login Widget */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-surface-sunken/40 p-4">
            <p className="mb-3 text-xs font-bold text-ink-soft">Sign in with Telegram</p>
            <div ref={widgetContainerRef} className="flex min-h-[44px] justify-center items-center" />
          </div>

          {/* Dev Telegram ID Login */}
          <div className="border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Dev Telegram User ID
              </span>
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                Dev Mode
              </span>
            </div>

            <form onSubmit={handleDevLogin} className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Enter Telegram ID (e.g. 123456789)"
                value={devTelegramId}
                onChange={(e) => setDevTelegramId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-mono font-medium text-ink focus:border-accent outline-none"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                fullWidth
                loading={loading}
                className="gap-2 font-bold text-xs"
              >
                <Send className="size-3.5" />
                Authenticate Telegram ID
              </Button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
