import { useState, useEffect, useCallback } from 'react';
import { Card } from './Card';
import { API_BASE, saveSession } from '../../lib/api';
import { AlertCircle, Phone, ShieldCheck, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';

interface TelegramAuthScreenProps {
  onSuccess: () => void;
}

// The API always sends `error` as a string, but a proxy, a gateway or the
// Telegram widget can hand back an object instead. Rendering that raw turns the
// banner into "[object Object]", which tells the person at the till nothing.
function readError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const inner = (value as Record<string, unknown>).error ?? (value as Record<string, unknown>).message;
    if (typeof inner === 'string' && inner.trim()) return inner;
  }
  return fallback;
}

export function TelegramAuthScreen({ onSuccess }: TelegramAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Phone OTP States
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const botName = import.meta.env.VITE_BOT_NAME || 'aicha_zhengda_arakawa_bot';

  // Authenticate using Telegram Web Login Widget or WebApp
  const authenticateTelegram = useCallback(async (payload: { initData?: string; telegramAuth?: any }) => {
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
        throw new Error(readError(data.error, 'Access denied: Telegram account is not authorized.'));
      }

      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(readError(err, 'Login failed. Account is not authorized.'));
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Set up Telegram Web Login Widget and auto-detect Mini App context
  useEffect(() => {
    (window as any).onTelegramAuth = (user: any) => {
      authenticateTelegram({ telegramAuth: user });
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
      authenticateTelegram({ initData: tg.initData });
    }

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [botName, onSuccess, authenticateTelegram]);

  // Handle Requesting OTP Code
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPhone = phoneNumber.trim();
    if (!cleanPhone) {
      setError('Please enter your authorized phone number.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/staff/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`API server is not responding (${res.status}). Make sure apps/api is running.`);
      }

      if (!res.ok || !data.ok) {
        throw new Error(readError(data.error, 'Access denied: Phone number is not authorized by Admin.'));
      }

      setOtpSent(true);
      setCountdown(60);
    } catch (err: any) {
      setError(readError(err, 'Phone number is not authorized by Admin.'));
    } finally {
      setLoading(false);
    }
  };

  // Handle Verifying OTP Code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneNumber.trim();
    const cleanCode = otpCode.trim();

    if (!cleanCode || cleanCode.length < 4) {
      setError('Please enter the verification code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/staff/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone, code: cleanCode }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`API server is not responding (${res.status}). Make sure apps/api is running.`);
      }

      if (!res.ok || !data.ok) {
        throw new Error(readError(data.error, 'Invalid verification code.'));
      }

      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(readError(err, 'Verification failed. Please check the code.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page p-4">
      <Card padding="lg" className="w-full max-w-sm border-border bg-surface text-center shadow-2xl">
        <div className="mb-6">
          <img
            src="/images/zhengda_logo_cropped.png"
            alt="Zhengda"
            className="mx-auto mb-3 h-16 w-auto object-contain drop-shadow-sm"
          />
          <h1 className="text-2xl font-black tracking-tight text-ink">Staff Portal</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            Ai-Cha &amp; Zhengda Store Management
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-none bg-danger-soft p-3 text-left text-xs font-semibold text-danger">
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
            <span>or sign in with phone OTP</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Action 2: Phone OTP Authentication */}
          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div className="text-left">
                <label className="mb-1 block text-[11px] font-bold text-ink-soft">
                  Authorized Phone Number
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="e.g. 012 345 678 or +855..."
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      if (error) setError(null);
                    }}
                    className="h-11 w-full rounded-none border border-border bg-surface px-3 pl-9 font-medium text-sm text-ink focus:border-accent outline-none"
                  />
                  <Phone className="absolute left-3 top-3.5 size-4 text-ink-faint" />
                </div>
                <p className="mt-1 text-[10px] text-ink-faint">
                  Only phone numbers authorized by Admin can receive OTP.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !phoneNumber.trim()}
                className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-none bg-accent text-on-accent hover:opacity-90 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                <ArrowRight className="size-4" />
                {loading ? 'Sending Code...' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div className="text-left">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-ink-soft">
                    Enter 6-Digit Code
                  </label>
                  <span className="font-mono text-[10px] text-accent font-semibold">
                    Sent to {phoneNumber}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    placeholder="••••••"
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value);
                      if (error) setError(null);
                    }}
                    className="h-12 w-full rounded-none border border-border bg-surface px-3 pl-9 font-mono text-center text-lg font-bold tracking-[0.25em] text-ink focus:border-accent outline-none"
                  />
                  <ShieldCheck className="absolute left-3 top-3.5 size-5 text-accent" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpCode.trim().length < 4}
                className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-none bg-accent text-on-accent hover:opacity-90 font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                <ShieldCheck className="size-4" />
                {loading ? 'Verifying...' : 'Verify & Sign In'}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                    setError(null);
                  }}
                  className="text-[11px] font-semibold text-ink-faint hover:text-ink transition-colors"
                >
                  Change phone
                </button>

                <button
                  type="button"
                  disabled={countdown > 0 || loading}
                  onClick={() => handleSendOtp()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  <RotateCcw className="size-3" />
                  {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* Dev Quick Login Box for local testing */}
          {import.meta.env.DEV && (
            <div className="pt-3 border-t border-border/80 mt-4 text-left">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-accent uppercase tracking-wider mb-1.5">
                <Sparkles className="size-3.5" /> Local Dev Quick Login
              </div>
              <p className="text-[10px] text-ink-faint mb-2.5 leading-relaxed">
                Telegram Login requires an HTTPS domain in @BotFather. For local development on localhost, use 1-click dev login:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => authenticateTelegram({ telegramUserId: 'dev_manager' } as any)}
                  disabled={loading}
                  className="h-9 px-2 rounded-none bg-surface-sunken hover:bg-surface-elevated border border-border text-[11px] font-bold text-ink flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  👑 Store Manager
                </button>
                <button
                  type="button"
                  onClick={() => authenticateTelegram({ telegramUserId: 'dev_staff' } as any)}
                  disabled={loading}
                  className="h-9 px-2 rounded-none bg-surface-sunken hover:bg-surface-elevated border border-border text-[11px] font-bold text-ink flex items-center justify-center gap-1.5 transition-all shadow-xs"
                >
                  🧑‍🍳 Staff Member
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
