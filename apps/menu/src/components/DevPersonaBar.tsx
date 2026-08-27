import { useState, useEffect } from 'react';
import { Sparkle, User, Star, ShieldCheck, SignOut } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import {
  loginAsDevCustomer,
  setDevUserId,
  clearWebLoginToken,
} from '../utils/telegramUser';

export function DevPersonaBar() {
  const [profile, setProfile] = useState<{
    tier?: string;
    firstName?: string;
    loyaltyPoints?: number;
    luckyTickets?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const signedIn = hasIdentity();

  useEffect(() => {
    if (!signedIn) {
      setProfile(null);
      return;
    }
    apiFetch(ME.profile())
      .then(async (res) => {
        if (res.ok) setProfile(await res.json());
      })
      .catch(() => {});
  }, [signedIn]);

  if (!import.meta.env.DEV) return null;

  const handleSwitch = async (type: 'gold' | 'standard' | 'guest') => {
    setLoading(true);
    if (type === 'guest') {
      setDevUserId(null);
      clearWebLoginToken();
      window.location.reload();
      return;
    }

    if (type === 'gold') {
      await loginAsDevCustomer({
        telegramUserId: 'dev_gold_vip',
        firstName: 'Alice',
        lastName: 'Chen',
        tier: 'gold',
        loyaltyPoints: 120, // 12 stamps (enough for free drink)
        luckyTickets: 5,
        phoneNumber: '+85512345678',
        building: 'A',
        roomNumber: '1110',
      });
    } else {
      await loginAsDevCustomer({
        telegramUserId: 'dev_standard_user',
        firstName: 'Bob',
        lastName: 'Sok',
        tier: 'standard',
        loyaltyPoints: 20, // 2 stamps
        luckyTickets: 1,
        phoneNumber: '+85598765432',
        building: 'B',
        roomNumber: '0512',
      });
    }
    window.location.reload();
  };

  return (
    <div className="bg-[#111827] text-white border-b border-white/10 px-3 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 z-50 sticky top-0 shadow-md">
      <div className="flex items-center gap-1.5 font-medium">
        <span className="flex items-center gap-1 font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 text-[11px]">
          <Sparkle size={13} weight="fill" /> Dev Mode
        </span>
        <span className="text-slate-300 hidden sm:inline">Active:</span>
        {!signedIn ? (
          <span className="inline-flex items-center gap-1 text-slate-300 font-semibold bg-white/10 px-2 py-0.5 rounded">
            <User size={12} /> Guest (Unregistered)
          </span>
        ) : profile?.tier === 'gold' ? (
          <span className="inline-flex items-center gap-1 text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
            <Star size={12} weight="fill" /> ⭐ Gold VIP ({profile?.loyaltyPoints || 0} pts • 🎟️ {profile?.luckyTickets || 0})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sky-300 font-semibold bg-sky-500/20 px-2 py-0.5 rounded border border-sky-500/30">
            <ShieldCheck size={12} /> 🛡️ Standard ({profile?.loyaltyPoints || 0} pts • 🎟️ {profile?.luckyTickets || 0})
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-slate-400 mr-1 hidden md:inline">Switch Persona:</span>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSwitch('gold')}
          className={`px-2 py-1 rounded font-bold text-[11px] transition-all flex items-center gap-1 ${
            profile?.tier === 'gold'
              ? 'bg-amber-400 text-slate-950 shadow-xs'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          ⭐ Gold VIP
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSwitch('standard')}
          className={`px-2 py-1 rounded font-bold text-[11px] transition-all flex items-center gap-1 ${
            signedIn && profile?.tier !== 'gold'
              ? 'bg-sky-400 text-slate-950 shadow-xs'
              : 'bg-white/10 hover:bg-white/20 text-white'
          }`}
        >
          🛡️ Standard
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSwitch('guest')}
          className={`px-2 py-1 rounded font-medium text-[11px] transition-all flex items-center gap-1 ${
            !signedIn
              ? 'bg-slate-200 text-slate-950 shadow-xs'
              : 'bg-white/10 hover:bg-white/20 text-slate-300'
          }`}
        >
          <SignOut size={11} /> Guest
        </button>
      </div>
    </div>
  );
}
