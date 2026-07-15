import { useState, useEffect } from 'react';
import { BarChart3, Users, Plus, Save } from 'lucide-react';

export function ManagerDashboard({ managerPin }: { managerPin: string }) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'loyalty'>('analytics');

  const [analytics, setAnalytics] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Loyalty Config states
  const [userSearch, setUserSearch] = useState('');
  const [foundUser, setFoundUser] = useState<any>(null);
  const [pointsAdjust, setPointsAdjust] = useState<number>(0);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [analyticsRes, rewardsRes] = await Promise.all([
          fetch('http://localhost:4000/api/analytics/sales', { headers: { 'x-manager-pin': managerPin } }),
          fetch('http://localhost:4000/api/rewards')
        ]);
        if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
        if (rewardsRes.ok) setRewards(await rewardsRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [managerPin]);

  const handleSearchUser = async () => {
    // We would need an API to search by phone or ID. For simplicity we assume ID search is enough for now or we build a small fetch logic here.
    try {
      const res = await fetch(`http://localhost:4000/api/users/${userSearch}`, {
        headers: { 'x-manager-pin': managerPin }
      });
      if (res.ok) {
        const data = await res.json();
        setFoundUser(data);
        setPointsAdjust(data.loyaltyPoints);
      } else {
        alert('User not found');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePoints = async () => {
    if (!foundUser) return;
    try {
      const res = await fetch(`http://localhost:4000/api/users/${foundUser.telegramUserId}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-manager-pin': managerPin },
        body: JSON.stringify({ points: pointsAdjust })
      });
      if (res.ok) {
        alert('Points updated!');
      } else {
        alert('Failed to update points. Please check your Manager PIN.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Loading Manager Dashboard...</div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-nav */}
      <div className="flex gap-4 border-b border-gray-200 pb-4">
        <button 
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${activeTab === 'analytics' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <BarChart3 size={20} /> Analytics
        </button>
        <button 
          onClick={() => setActiveTab('loyalty')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${activeTab === 'loyalty' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <Users size={20} /> Loyalty & Rewards
        </button>
      </div>

      {activeTab === 'analytics' && analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-2">
            <h3 className="text-gray-500 font-bold uppercase tracking-wider text-xs">Total Revenue (Paid)</h3>
            <div className="text-4xl font-black text-gray-900">${analytics.totalRevenue.toFixed(2)}</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col gap-2">
            <h3 className="text-gray-500 font-bold uppercase tracking-wider text-xs">Total Orders</h3>
            <div className="text-4xl font-black text-gray-900">{analytics.orderCount}</div>
          </div>
          <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="text-gray-800 font-bold mb-4">Daily Sales Volume</h3>
            <div className="h-64 flex items-end gap-2 border-b border-l border-gray-200 p-4">
              {Object.entries(analytics.byDate).map(([date, amount]: any) => (
                <div key={date} className="relative group flex-1 flex flex-col items-center justify-end h-full">
                  <div 
                    className="w-full bg-indigo-500 rounded-t-sm transition-all hover:bg-indigo-600" 
                    style={{ height: `${Math.min((amount / Math.max(...Object.values(analytics.byDate) as number[])) * 100, 100)}%` }}
                  ></div>
                  <span className="absolute -bottom-6 text-xs text-gray-400 rotate-45">{date.slice(5)}</span>
                  <div className="absolute -top-10 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-xs py-1 px-2 rounded-md transition-opacity pointer-events-none">
                    ${amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center text-sm text-gray-400">Time range: Lifetime</div>
          </div>
        </div>
      )}

      {activeTab === 'loyalty' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Points Adjustment */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Users size={20}/> Adjust User Points</h3>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                placeholder="Telegram User ID" 
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={handleSearchUser} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold">Search</button>
            </div>
            {foundUser && (
              <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                <div className="font-bold text-indigo-900 mb-2">{foundUser.firstName} {foundUser.lastName}</div>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    value={pointsAdjust}
                    onChange={e => setPointsAdjust(Number(e.target.value))}
                    className="w-24 bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none font-bold text-center"
                  />
                  <span className="text-sm font-bold text-gray-500">Pts</span>
                  <button onClick={handleSavePoints} className="ml-auto bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold text-sm">
                    <Save size={16} /> Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Reward Catalog */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Reward Catalog</h3>
              <button className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-lg text-sm font-bold flex items-center gap-1 transition-colors">
                <Plus size={16} /> Add Reward
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {rewards.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No rewards configured.</div>
              ) : (
                rewards.map(reward => (
                  <div key={reward.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl bg-gray-50">
                    <div>
                      <div className="font-bold text-gray-800">{reward.name}</div>
                      <div className="text-xs text-gray-500 font-bold">{reward.pointsCost} pts</div>
                    </div>
                    <button className="text-red-500 font-bold text-xs hover:underline">Remove</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
