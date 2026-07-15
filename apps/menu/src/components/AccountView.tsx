import { useState, useEffect } from 'react';
import { Phone, Gift, Coin } from '@phosphor-icons/react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};

export function AccountView() {
  const [profile, setProfile] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userId = WebApp?.initDataUnsafe?.user?.id?.toString() || 'test-user-id';
        const [userRes, rewardsRes] = await Promise.all([
          fetch(`http://localhost:4000/api/user/${userId}`),
          fetch('http://localhost:4000/api/rewards')
        ]);
        
        if (userRes.ok) setProfile(await userRes.json());
        if (rewardsRes.ok) setRewards(await rewardsRes.json());
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
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex items-center gap-4">
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

      {/* Points Card */}
      <div className="bg-gradient-to-r from-brand-primary to-[#ff7a7a] rounded-2xl p-6 shadow-md text-white flex justify-between items-center">
        <div>
          <h3 className="text-white/80 font-semibold text-sm mb-1">Loyalty Points</h3>
          <div className="text-3xl font-black">{profile.loyaltyPoints}</div>
        </div>
        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
          <Coin size={28} weight="fill" className="text-white" />
        </div>
      </div>

      {/* Reward Catalog */}
      <div>
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-tg-text">
          <Gift size={24} className="text-brand-primary" weight="fill" /> Reward Catalog
        </h3>
        
        {rewards.length === 0 ? (
          <div className="text-center p-8 bg-tg-secondary-bg rounded-2xl text-tg-hint border border-tg-hint/10">
            No rewards available right now. Check back later!
          </div>
        ) : (
          <div className="grid gap-3">
            {rewards.map(reward => (
              <div key={reward.id} className="bg-white rounded-2xl p-4 shadow-sm border border-tg-hint/10 flex gap-4 items-center">
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
                  {reward.image ? (
                    <img src={reward.image} alt={reward.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Gift size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-tg-text">{reward.name}</h4>
                  {reward.description && <p className="text-xs text-tg-hint line-clamp-1">{reward.description}</p>}
                  <div className="mt-2 font-bold text-sm text-brand-primary bg-brand-primary/10 inline-block px-2 py-1 rounded-lg">
                    {reward.pointsCost} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
