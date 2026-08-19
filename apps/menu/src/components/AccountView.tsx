import { useState, useEffect } from 'react';
import { Phone } from '@phosphor-icons/react';
import { getTelegramUserId } from '../utils/telegramUser';
import { API_BASE } from '../utils/api';

export function AccountView() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userId = getTelegramUserId() || 'test-user-id';
        const userRes = await fetch(`${API_BASE}/api/user/${userId}`);

        if (userRes.ok) setProfile(await userRes.json());
      } catch (err) {
        console.error('Failed to fetch account data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-tg-hint animate-pulse">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center text-[#E53935]">Could not load profile.</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      {/* Profile Card */}
      <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex items-center gap-4">
        <div className="w-14 h-14 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary">
          <Phone size={28} weight="fill" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-tg-text">
            {[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Telegram User'}
          </h2>
          <p className="text-sm text-tg-hint font-medium">
            {profile.phoneNumber ? `+${profile.phoneNumber}` : 'No phone linked yet'}
          </p>
        </div>
      </div>
    </div>
  );
}
