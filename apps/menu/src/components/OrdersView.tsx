import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Package, RefreshCw, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import type { CartItem, MenuItem } from '../types';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menuItem: MenuItem;
  modifiers: string;
}

interface Order {
  id: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  pickupCode: string | null;
  items: OrderItem[];
}

interface OrdersViewProps {
  onReorder: (items: CartItem[]) => void;
  onBrowseMenu?: () => void;
}

export function OrdersView({ onReorder, onBrowseMenu }: OrdersViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Order history belongs to one person. Without a verified identity there is
  // nobody to look up, so we ask instead of guessing.
  const signedIn = hasIdentity();

  const fetchOrders = async () => {
    try {
      const res = await apiFetch(ME.orders());
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [signedIn]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300';
      case 'preparing': return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
      case 'ready': return 'bg-green-500/15 text-green-700 dark:text-green-300';
      default: return 'bg-tg-hint/15 text-tg-hint';
    }
  };

  const handleReorder = (order: Order) => {
    const cartItems: CartItem[] = order.items.map(item => ({
      id: crypto.randomUUID(),
      menuItemId: item.menuItem.id,
      name: item.menuItem.name,
      basePrice: item.menuItem.basePrice,
      quantity: item.quantity,
      selectedModifiers: item.modifiers ? JSON.parse(item.modifiers) : {},
      unitPrice: item.price / item.quantity,
      totalPrice: item.price
    }));
    onReorder(cartItems);
  };

  if (!signedIn) {
    return <SignInPrompt onBrowseMenu={onBrowseMenu} />;
  }

  if (loading && orders.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-tg-hint">
        <RefreshCw size={24} className="animate-spin" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <Package size={48} className="text-tg-hint/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">No Orders Yet</h2>
        <p className="text-tg-hint text-sm">Your order history will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map(order => (
        <motion.div 
          key={order.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-tg-secondary-bg rounded-2xl p-4 shadow-sm"
        >
          <div className="flex justify-between items-start mb-3 border-b border-tg-hint/10 pb-3">
            <div>
              <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
              <p className="text-xs text-tg-hint mt-2">
                {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold">{formatCurrency(order.totalAmount)}</p>
              {order.pickupCode && (
                <p className="text-xs font-mono font-bold mt-1 bg-tg-bg px-2 py-1 rounded">
                  Code: {order.pickupCode}
                </p>
              )}
            </div>
          </div>
          
          <ul className="space-y-2 mb-4">
            {order.items.map(item => (
              <li key={item.id} className="text-sm flex justify-between">
                <span>{item.quantity}x {item.menuItem.name}</span>
              </li>
            ))}
          </ul>
          
          <button 
            onClick={() => handleReorder(order)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary/10 text-brand-primary font-bold active:scale-95 transition-transform"
          >
            <ShoppingCart size={18} /> Reorder
          </button>
        </motion.div>
      ))}
    </div>
  );
}
