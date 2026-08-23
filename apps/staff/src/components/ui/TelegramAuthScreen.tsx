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

  // Authenticate using Telegram initData or token or widget auth
  const authenticate = useCallback(async (payload: { initData?: string; telegramUserId?: string; telegramAuth?: any }) => {
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

  // Set up Telegram Web Login Widget and auto-detect Mini App context
  useEffect(() => {
    (window as any).onTelegramAuth = (user: any) => {
      authenticate({ telegramAuth: user });
    };

    const container = document.getElementById('telegram-login-container');
    if (container && !container.hasChildNodes()) {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.setAttribute('data-telegram-login', botName);
      script.setAttribute('data-size', 'large');
      script.setAttribute('data-radius', '12');
      script.setAttribute('data-onauth', 'onTelegramAuth(user)');
      script.setAttribute('data-request-access', 'write');
      script.async = true;
      container.appendChild(script);
    }

    // Check URL hash for token from redirect if any
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

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botName, onSuccess, authenticate]);

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
          {/* Action 1: Official Telegram Web Login Button */}
          <div
            id="telegram-login-container"
            className="flex justify-center min-h-[44px] items-center"
          />

          <div className="flex items-center gap-2 text-xs text-ink-faint">
            <div className="h-px flex-1 bg-border" />
            <span>or sign in with ID</span>
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
