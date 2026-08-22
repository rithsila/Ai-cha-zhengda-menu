import { useState, useEffect } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { API_BASE, saveSession } from '../../lib/api';
import { ShieldCheck, AlertCircle, KeyRound, Send } from 'lucide-react';

interface TelegramAuthScreenProps {
  onSuccess: () => void;
}

export function TelegramAuthScreen({ onSuccess }: TelegramAuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [selectedRole, setSelectedRole] = useState<'staff' | 'manager'>('staff');
  const [devTelegramId, setDevTelegramId] = useState('');
  const [showTelegramId, setShowTelegramId] = useState(false);

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
      }
    }
  }, [onSuccess]);

  // PIN Login (Staff 1234, Manager 9999)
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setError('Please enter your PIN.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let role = selectedRole;
      let res = await fetch(`${API_BASE}/api/auth/staff-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin, role }),
      });

      // Auto-fallback: If role was staff and failed, try manager
      if (!res.ok) {
        const altRole = role === 'staff' ? 'manager' : 'staff';
        const altRes = await fetch(`${API_BASE}/api/auth/staff-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: cleanPin, role: altRole }),
        });
        if (altRes.ok) {
          res = altRes;
          role = altRole;
        }
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Invalid PIN');
      }

      const data = await res.json();
      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Incorrect PIN. Try 1234 for Staff or 9999 for Manager.');
    } finally {
      setLoading(false);
    }
  };

  // Direct Telegram ID login
  const handleTelegramIdLogin = async (e: React.FormEvent) => {
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
        throw new Error(data.error || 'Telegram ID not authorized.');
      }
      const data = await res.json();
      saveSession({
        token: data.token,
        role: data.role,
        expiresAt: data.expiresAt,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate via Telegram ID');
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
            Enter PIN or Authorized Account
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PIN Login Form */}
        <form onSubmit={handlePinLogin} className="space-y-4">
          <div className="flex rounded-xl bg-surface-sunken p-1 border border-border">
            <button
              type="button"
              onClick={() => setSelectedRole('staff')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                selectedRole === 'staff'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              Staff Portal
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('manager')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                selectedRole === 'manager'
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              Manager Mode
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
              Access PIN (Staff: 1234 | Manager: 9999)
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) setError(null);
              }}
              className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-center text-2xl font-bold tracking-widest text-ink focus:border-accent outline-none"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className="gap-2 font-bold text-sm"
          >
            <KeyRound className="size-4" />
            Unlock Dashboard
          </Button>
        </form>

        {/* Optional Telegram ID Toggle */}
        <div className="border-t border-border mt-6 pt-4">
          <button
            type="button"
            onClick={() => setShowTelegramId(!showTelegramId)}
            className="text-[11px] font-bold text-ink-soft hover:text-accent flex items-center justify-center w-full"
          >
            {showTelegramId ? 'Hide Telegram ID Login' : 'Login with Telegram User ID'}
          </button>

          {showTelegramId && (
            <form onSubmit={handleTelegramIdLogin} className="space-y-2 mt-3">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Telegram User ID (e.g. 715714775)"
                value={devTelegramId}
                onChange={(e) => setDevTelegramId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-xs font-mono text-ink focus:border-accent outline-none"
              />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                fullWidth
                loading={loading}
                className="gap-2 font-bold text-xs"
              >
                <Send className="size-3.5" />
                Authenticate Telegram ID
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
