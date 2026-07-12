import { useState, useEffect } from 'react';
import { Package, ToggleLeft, ToggleRight, Search } from 'lucide-react';

type MenuItem = {
  id: string;
  brand: string;
  category: string;
  name: string;
  isSoldOut: boolean;
};

export function MenuManagement() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCatalog = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/catalog');
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch catalog:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  const toggleSoldOut = async (id: string, currentStatus: boolean) => {
    try {
      // Optimistic update
      setItems(items.map(item => item.id === id ? { ...item, isSoldOut: !currentStatus } : item));
      
      const res = await fetch(`http://localhost:4000/api/catalog/${id}/sold-out`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSoldOut: !currentStatus })
      });
      
      if (!res.ok) {
        // Revert on failure
        setItems(items.map(item => item.id === id ? { ...item, isSoldOut: currentStatus } : item));
      }
    } catch (error) {
      console.error('Failed to toggle sold out status', error);
      setItems(items.map(item => item.id === id ? { ...item, isSoldOut: currentStatus } : item));
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-6 relative max-w-md">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
          <Search size={18} />
        </div>
        <input 
          type="text" 
          placeholder="Search menu items..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl"></div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
                <th className="p-4 font-medium">Item Name</th>
                <th className="p-4 font-medium">Brand</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4 font-medium">{item.name}</td>
                  <td className="p-4 text-sm text-gray-500 uppercase">{item.brand}</td>
                  <td className="p-4 text-sm text-gray-500">{item.category}</td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => toggleSoldOut(item.id, item.isSoldOut)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-sm transition-colors ${
                        item.isSoldOut 
                          ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {item.isSoldOut ? (
                        <><ToggleRight size={18} /> Sold Out</>
                      ) : (
                        <><ToggleLeft size={18} /> Available</>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <Package size={32} className="mx-auto mb-2 opacity-50" />
              No items found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
