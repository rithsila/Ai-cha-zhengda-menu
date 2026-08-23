import { useState, useEffect, useCallback } from 'react';
import { Card } from './Card';
import { API_BASE, saveSession } from '../../lib/api';
import { AlertCircle, Send, Sparkles } from 'lucide-react';

interface TelegramAuthScreenProps {
  onSuccess: () => void;
}

export function TelegramAuthScreen({ onSuccess }: TelegramAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telegramUserId, setTelegramUserId] = useState('');
  const botName = import.meta.env.VITE_BOT_NAME || 'aicha_zhengda_arakawa_bot';

  // Authenticate using Telegram initData or token or numeric ID
  const authenticate = useCallback(async (payload: { initData?: string; telegramUserId?: string }) => {
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
      setError(err.message || 'Login failed. Account is not authorized.');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  // Check URL hash for token from Telegram redirect callback
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
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) {
      authenticate({ initData: tg.initData });
      return;
    }
    window.location.href = `https://t.me/${botName}?startapp=staff`;
  };

  const handleIdLogin = (e: React.FormEvent) => {
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
      <Card padding="lg" className="w-full max-w-sm border-border bg-surface text-center shadow-2xl">
        <div className="mb-6">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-md">
            <Sparkles className="size-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Staff Portal</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            Ai-Cha &amp; Zhengda Store Management
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-left text-xs font-semibold text-danger">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Action 1: Open directly in Telegram App */}
          <button
            type="button"
            disabled={loading}
            onClick={handleOpenTelegram}
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .26z" />
            </svg>
            <span>{loading ? 'Authenticating...' : 'Open in Telegram App'}</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <div className="h-px flex-1 bg-border" />
            <span>or sign in on browser</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Action 2: Direct numeric Telegram ID login */}
          <form onSubmit={handleIdLogin} className="space-y-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Enter Telegram ID (e.g. 715714775)"
              value={telegramUserId}
              onChange={(e) => {
                setTelegramUserId(e.target.value);
                if (error) setError(null);
              }}
              className="h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-center text-sm font-bold tracking-wider text-ink focus:border-accent outline-none"
            />

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-xl border border-border bg-surface-sunken hover:bg-surface-elevated text-xs font-bold text-ink transition-colors disabled:opacity-50"
            >
              <Send className="size-3.5 text-accent" />
              Sign in with Telegram ID
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
