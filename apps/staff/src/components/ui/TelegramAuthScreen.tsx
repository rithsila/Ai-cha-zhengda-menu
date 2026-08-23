import { useState, useEffect, useCallback } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { API_BASE, saveSession } from '../../lib/api';
import { AlertCircle, Send, Sparkles } from 'lucide-react';

interface TelegramAuthScreenProps {
  onSuccess: () => void;
}

export function TelegramAuthScreen({ onSuccess }: TelegramAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState('');

  // Authenticate using Telegram ID or initData
  const authenticate = useCallback(async (payload: { telegramUserId?: string; initData?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/staff-telegram-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Access denied: Telegram account is not authorized.');
      }

      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please ask an admin to authorize your Telegram ID.');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  // Check URL hash for token from Telegram redirect if any
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
        return;
      }
    }

    // Auto-detect Telegram Mini App WebApp context
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) {
      authenticate({ initData: tg.initData });
    }
  }, [onSuccess, authenticate]);

  const handleOpenTelegram = () => {
    // If inside Telegram WebApp
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) {
      authenticate({ initData: tg.initData });
      return;
    }
    // Direct link to Telegram bot
    const botUrl = 'https://t.me/aichazhengdabot';
    window.open(botUrl, '_blank');
  };

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = telegramUserId.trim();
    if (!cleanId) {
      setError('Please enter your Telegram User ID.');
      return;
    }
    authenticate({ telegramUserId: cleanId });
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page p-4">
      <Card padding="lg" className="w-full max-w-sm border-border bg-surface shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-md">
            <Sparkles className="size-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Staff &amp; Admin Portal</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            Ai-Cha &amp; Zhengda Store Management
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Direct Telegram ID Login Form */}
        <form onSubmit={handleManualLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              Telegram User ID
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              placeholder="Enter Telegram ID (e.g. 715714775)"
              value={telegramUserId}
              onChange={(e) => {
                setTelegramUserId(e.target.value);
                if (error) setError(null);
              }}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 font-mono text-center text-base font-bold tracking-wider text-ink focus:border-accent outline-none"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className="gap-2 font-bold text-sm h-12 shadow-sm"
          >
            <Send className="size-4" />
            Sign in with Telegram ID
          </Button>
        </form>

        <div className="mt-4 pt-4 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            onClick={handleOpenTelegram}
            className="gap-2 font-bold text-xs h-10 text-ink-soft hover:text-ink"
          >
            <Send className="size-3.5" />
            Open in Telegram App
          </Button>
        </div>
      </Card>
    </div>
  );
}
