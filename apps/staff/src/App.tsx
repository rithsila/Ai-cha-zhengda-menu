import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle2, Package, RefreshCw, LayoutDashboard, ListPlus, MapPin, Store } from 'lucide-react';
import { MenuManagement } from './components/MenuManagement';

const StaffLogin = ({ onLogin }: { onLogin: () => void }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  
  const expectedPin = import.meta.env.VITE_STAFF_PIN || '1234';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === expectedPin) {
      onLogin();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-80 text-center">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Staff Access</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-3xl tracking-widest p-4 border-2 rounded-lg mb-4 bg-gray-50 focus:border-blue-500 focus:outline-none"
            placeholder="****"
            autoFocus
          />
          {error && <p className="text-red-500 mb-4 text-sm">Incorrect PIN</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
};

type OrderItem = {
  id: string;
  quantity: number;
  price: number;
  modifiers: string;
  menuItem: {
    name: string;
    brand: string;
  };
};

/**
 * Safely parse order item modifiers JSON.
 * Returns an array of [group, optionNames] pairs.
 * Handles invalid JSON, non-object values, non-array group values, and missing .name properties.
 */
function parseModifiers(raw: string): [string, string[]][] {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return [];
    }
    return Object.entries(parsed)
      .filter(([_, value]) => Array.isArray(value))
      .map(([group, opts]) => [
        group,
        (opts as any[]).map((o) => o?.name ?? String(o))
      ]);
  } catch {
    return [];
  }
}

type Order = {
  id: string;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
  pickupCode: string | null;
  orderType: string;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  items: OrderItem[];
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  const fetchBranches = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/branches');
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
        if (data.length > 0) setSelectedBranch(data[0].id);
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchOrders = useCallback(async () => {
    try {
      const url = selectedBranch ? `http://localhost:4000/api/orders?branchId=${selectedBranch}` : 'http://localhost:4000/api/orders';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (!selectedBranch && branches.length > 0) return; // Wait for branch to be selected initially
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, [fetchOrders, selectedBranch, branches]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await fetch(`http://localhost:4000/api/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchOrders();
    } catch (error) {
      console.error('Failed to update status', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (!isAuthenticated) {
    return <StaffLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold">Ai-Cha & Zhengda Staff</h1>
              <p className="text-sm text-gray-500">
                {activeTab === 'orders' ? 'Live Orders Dashboard' : 'Menu Management'}
              </p>
            </div>
            {branches.length > 0 && (
              <select 
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="ml-4 bg-gray-100 border-none text-sm font-bold rounded-xl py-2 px-4 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
              >
                <option value="">All Branches</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
          
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTab === 'orders' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <LayoutDashboard size={18} /> Live Orders
            </button>
            <button 
              onClick={() => setActiveTab('menu')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTab === 'menu' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <ListPlus size={18} /> Menu Management
            </button>
          </div>
          
          <div className="w-10 flex justify-end">
            {activeTab === 'orders' && (
              <button 
                onClick={fetchOrders}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                title="Refresh Orders"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'menu' ? (
          <MenuManagement />
        ) : (
          orders.length === 0 && !loading ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <h2 className="text-xl font-bold text-gray-700">No Orders Yet</h2>
              <p className="text-gray-500">Waiting for new orders to arrive...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {orders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-start bg-gray-50/50">
                    <div>
                      <span className="text-sm text-gray-500 font-medium">#{order.id.slice(0, 8)}</span>
                      <h3 className="font-bold text-xl mt-1">Code: {order.pickupCode || 'N/A'}</h3>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </div>
                  
                  <div className="p-4 flex-1">
                    <div className="flex gap-2 mb-4">
                      {order.orderType === 'delivery' ? (
                        <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded-md uppercase">
                          <MapPin size={14} /> Delivery
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-md uppercase">
                          <Store size={14} /> Pickup
                        </span>
                      )}
                    </div>

                    {order.orderType === 'delivery' && order.deliveryAddress && (
                      <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100 text-sm">
                        <span className="text-gray-500 font-bold block mb-1 text-xs">Delivery Address:</span>
                        {order.deliveryAddress}
                        {order.deliveryLat && order.deliveryLng && (
                          <div className="mt-2">
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryLat},${order.deliveryLng}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline font-bold text-xs inline-flex items-center gap-1"
                            >
                              <MapPin size={12} /> View on Google Maps
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                      <Clock size={14} />
                      {new Date(order.createdAt).toLocaleTimeString()} • {order.paymentMethod.toUpperCase()}
                    </p>
                    
                    <ul className="space-y-3">
                      {order.items.map(item => (
                        <li key={item.id} className="text-sm">
                          <div className="flex justify-between font-medium">
                            <span>{item.quantity}x {item.menuItem.name}</span>
                          </div>
                          {item.modifiers && item.modifiers !== '{}' && (
                            <div className="text-gray-500 text-xs mt-1 pl-4 border-l-2 border-gray-200">
                              {parseModifiers(item.modifiers).map(([group, optionNames]) => (
                                <div key={group}>
                                  {optionNames.join(', ')}
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                    {order.status === 'pending' && (
                      <button 
                        onClick={() => updateStatus(order.id, 'preparing')}
                        className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 transition-colors"
                      >
                        Start Preparing
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button 
                        onClick={() => updateStatus(order.id, 'ready')}
                        className="flex-1 bg-green-600 text-white font-bold py-2.5 rounded-xl flex justify-center items-center gap-2 hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle2 size={18} /> Ready for Pickup
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button 
                        onClick={() => updateStatus(order.id, 'completed')}
                        className="flex-1 bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl hover:bg-gray-300 transition-colors"
                      >
                        Mark Completed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>
    </div>
  );
}

export default App;
