import { useState, useMemo, useEffect, useCallback } from 'react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Translate, MagnifyingGlass, X, List, ClockCounterClockwise } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from './hooks/useFavorites';
import { formatCurrency } from './utils/format';

import type { Brand, MenuItem, CartItem, ModifierOption } from './types';
import { CATALOG } from './data/catalog';

import { BrandTabs } from './components/ui/BrandTabs';
import { CategoryScroller } from './components/ui/CategoryScroller';
import { MenuGridSkeleton, EmptyMenuState } from './components/ui/Skeleton';
import { MenuItemCard } from './components/MenuItemCard';
import { ModifierModal } from './components/ModifierModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrdersView } from './components/OrdersView';
import { Button } from './components/ui/Button';

const isSameModifiers = (a: Record<string, ModifierOption[]>, b: Record<string, ModifierOption[]>) => {
  const keysA = Object.keys(a).filter(k => a[k].length > 0);
  const keysB = Object.keys(b).filter(k => b[k].length > 0);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    const optsA = a[key].map(o => o.id).sort().join(',');
    const optsB = (b[key] || []).map(o => o.id).sort().join(',');
    if (optsA !== optsB) return false;
  }
  return true;
};

const WebLogin = () => {
  const botName = import.meta.env.VITE_BOT_NAME || 'YourBotUsername';

  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome</h1>
        <p className="text-gray-500 mb-8">Please log in with Telegram to access the menu from your browser.</p>
        
        <div 
          id="telegram-login-widget" 
          className="flex justify-center min-h-[40px]"
          ref={(el) => {
            if (el && !el.hasChildNodes()) {
              const script = document.createElement('script');
              script.src = "https://telegram.org/js/telegram-widget.js?22";
              script.setAttribute('data-telegram-login', botName);
              script.setAttribute('data-size', 'large');
              script.setAttribute('data-auth-url', `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/auth/telegram/callback`);
              script.setAttribute('data-request-access', 'write');
              el.appendChild(script);
            }
          }}
        ></div>
        
        <p className="text-xs text-gray-400 mt-6">
          Or open this link directly inside the Telegram app.
        </p>
      </div>
    </div>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const [activeBrand, setActiveBrand] = useState<Brand>('ai-cha');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'menu' | 'orders'>('menu');
  const [catalogOverrides, setCatalogOverrides] = useState<Record<string, { isSoldOut: boolean }>>({});
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeModalItem, setActiveModalItem] = useState<MenuItem | null>(null);
  const [modalInitialSelected, setModalInitialSelected] = useState<Record<string, ModifierOption[]> | undefined>();
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Simulate initial data loading and fetch catalog overrides
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const res = await fetch('http://localhost:4000/api/catalog');
        if (res.ok) {
          const data = await res.json();
          const overrides: Record<string, { isSoldOut: boolean }> = {};
          data.forEach((item: any) => {
            overrides[item.id] = { isSoldOut: item.isSoldOut };
          });
          setCatalogOverrides(overrides);
        }
      } catch (error) {
        console.error('Failed to fetch catalog overrides', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCatalog();
    const interval = setInterval(fetchCatalog, 10000); // Check for sold-out status every 10s
    return () => clearInterval(interval);
  }, []);

  // Derived state for current brand's items
  const brandItems = useMemo(() => {
    return CATALOG.filter(i => i.brand === activeBrand).map(item => ({
      ...item,
      isSoldOut: catalogOverrides[item.id]?.isSoldOut || false
    }));
  }, [activeBrand, catalogOverrides]);
  const categories = useMemo(() => {
    const cats = ['All', ...new Set(brandItems.map(i => i.category))];
    const hasBrandFavorites = brandItems.some(i => favorites.includes(i.id));
    if (hasBrandFavorites) {
      cats.unshift('Favorites');
    }
    return cats;
  }, [brandItems, favorites]);
  
  // Filtered items
  const visibleItems = useMemo(() => {
    const allMapped = CATALOG.map(item => ({
      ...item,
      isSoldOut: catalogOverrides[item.id]?.isSoldOut || false
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return allMapped.filter(i => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q));
    }
    if (activeCategory === 'Favorites') {
      return brandItems.filter(i => favorites.includes(i.id));
    }
    if (activeCategory === 'All') return brandItems;
    return brandItems.filter(i => i.category === activeCategory);
  }, [brandItems, activeCategory, searchQuery, favorites]);

  const cartTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // Handle Telegram Main Button
  const openCart = useCallback(() => setIsCartOpen(true), []);

  useEffect(() => {
    if (!WebApp?.MainButton) return;

    WebApp.MainButton.offClick?.(openCart);

    if (cart.length > 0 && !isCartOpen && !isCheckoutOpen && !isSuccessOpen) {
      WebApp.MainButton.text = `${t('cartTitle')} (${cart.length}) - ${formatCurrency(cartTotal)}`;
      WebApp.MainButton.show();
      WebApp.MainButton.onClick(openCart);
    } else {
      WebApp.MainButton.hide();
    }

    return () => {
      WebApp.MainButton?.offClick?.(openCart);
    };
  }, [cart.length, isCartOpen, isCheckoutOpen, isSuccessOpen, cartTotal, t, openCart]);


  // Actions
  const handleBrandChange = (brand: Brand) => {
    setActiveBrand(brand);
    setActiveCategory('All');
  };

  const handleAddItem = (item: MenuItem) => {
    if (WebApp?.HapticFeedback) WebApp.HapticFeedback.impactOccurred?.('light');
    if (item.modifiers && item.modifiers.length > 0) {
      setActiveModalItem(item);
      setModalInitialSelected(undefined);
      setEditingCartItemId(null);
    } else {
      addToCart(item, {});
    }
  };

  const addToCart = (item: MenuItem, selectedOptions: Record<string, ModifierOption[]>, editingId?: string | null) => {
    let unitPrice = item.basePrice;
    Object.values(selectedOptions).forEach(opts => opts.forEach(o => unitPrice += o.priceDelta));

    if (editingId) {
      setCart(cart.map(c => 
        c.id === editingId 
          ? { ...c, selectedModifiers: selectedOptions, unitPrice, totalPrice: unitPrice * c.quantity }
          : c
      ));
    } else {
      const existing = cart.find(c => c.menuItemId === item.id && isSameModifiers(c.selectedModifiers, selectedOptions));
      if (existing) {
        setCart(cart.map(c => 
          c.id === existing.id 
            ? { ...c, quantity: c.quantity + 1, totalPrice: c.unitPrice * (c.quantity + 1) }
            : c
        ));
      } else {
        const cartItem: CartItem = {
          id: crypto.randomUUID(),
          menuItemId: item.id,
          name: item.name,
          basePrice: item.basePrice,
          quantity: 1,
          selectedModifiers: selectedOptions,
          unitPrice,
          totalPrice: unitPrice
        };
        setCart([...cart, cartItem]);
      }
    }

    setActiveModalItem(null);
    setModalInitialSelected(undefined);
    setEditingCartItemId(null);
  };

  const handleReorder = (items: CartItem[]) => {
    setCart([...cart, ...items]);
    setActiveTab('menu');
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const handleUpdateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(id);
    } else {
      setCart(cart.map(c => 
        c.id === id 
          ? { ...c, quantity: newQuantity, totalPrice: c.unitPrice * newQuantity }
          : c
      ));
    }
  };

  const handleEditItem = (cartItem: CartItem) => {
    const menuItem = CATALOG.find(i => i.id === cartItem.menuItemId);
    if (menuItem) {
      setActiveModalItem(menuItem);
      setModalInitialSelected(cartItem.selectedModifiers);
      setEditingCartItemId(cartItem.id);
    }
  };

  const handleCheckoutSuccess = (newPickupCode: string) => {
    if (WebApp?.HapticFeedback) WebApp.HapticFeedback.notificationOccurred?.('success');
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    setPickupCode(newPickupCode);
    setIsSuccessOpen(true);
    setCart([]);
  };

  const cycleLanguage = () => {
    const langs = ['en', 'km', 'zh'];
    const next = langs[(langs.indexOf(i18n.language) + 1) % langs.length];
    i18n.changeLanguage(next);
  };

  const isTelegramWebApp = typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
  
  if (!isTelegramWebApp && import.meta.env.PROD) {
    return <WebLogin />;
  }

  if (isSuccessOpen) {
    return (
      <div className="min-h-screen bg-tg-bg flex flex-col items-center justify-center p-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-24 h-24 bg-brand-primary rounded-full flex items-center justify-center mb-6 text-white text-4xl">
          ✓
        </motion.div>
        <h1 className="text-3xl font-bold mb-2">{t('successTitle')}</h1>
        <p className="text-tg-hint mb-8">{t('successDesc')}</p>
        <div className="bg-tg-secondary-bg p-6 rounded-2xl w-full mb-8">
          <p className="text-sm font-bold text-tg-hint mb-1">{t('pickupCode')}</p>
          <p className="text-4xl font-black font-mono">{pickupCode}</p>
        </div>
        <Button fullWidth onClick={() => setIsSuccessOpen(false)}>{t('backToMenu')}</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tg-bg text-tg-text pb-28">
      {/* Top Banner Section */}
      <div 
        className="relative bg-cover bg-center bg-no-repeat rounded-b-[2rem] pt-8 px-4 pb-6 shadow-sm overflow-hidden"
        style={{ backgroundImage: 'url(/banner.png)' }}
      >
        <div className="absolute inset-0 bg-black/40 z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-0 pointer-events-none"></div>
        
        {/* Header */}
        <header className="mb-6 flex justify-between items-start relative z-10 text-white">
          <div>
            <h1 className="text-3xl font-bold font-sans drop-shadow-md">{activeTab === 'menu' ? t('menuTitle') : 'My Orders'}</h1>
            <p className="text-white/90 text-sm drop-shadow-md">{activeTab === 'menu' ? t('menuSubtitle') : 'Track your active and past orders'}</p>
          </div>
          <div className="flex gap-2">
            {activeTab === 'menu' && (
              <button 
                onClick={() => {
                  setIsSearchVisible(!isSearchVisible);
                  if (isSearchVisible) setSearchQuery('');
                }} 
                className={`p-3 rounded-xl flex items-center justify-center transition-colors backdrop-blur-md border border-white/20 shadow-sm ${isSearchVisible ? 'bg-brand-primary text-white' : 'bg-black/30 text-white hover:bg-black/40'}`}
              >
                <MagnifyingGlass size={20} weight={isSearchVisible ? "bold" : "regular"} />
              </button>
            )}
            <button onClick={cycleLanguage} className="bg-black/30 hover:bg-black/40 border border-white/20 backdrop-blur-md p-3 rounded-xl text-white flex items-center gap-2 font-bold text-sm transition-colors shadow-sm">
              <Translate size={20} /> {i18n.language.toUpperCase()}
            </button>
          </div>
        </header>

        {activeTab === 'menu' && (
          <div className="relative z-10">
            {/* Search Bar */}
            <AnimatePresence>
              {isSearchVisible && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-2 relative"
                >
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
                    <MagnifyingGlass size={20} />
                  </div>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder={t('searchMenu', 'Search menu...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/95 backdrop-blur-md text-gray-900 pl-12 pr-10 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-shadow shadow-md"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-900"
                    >
                      <X size={20} weight="bold" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {!searchQuery && (
              <div className="mt-2">
                {/* Brand Tabs */}
                <BrandTabs activeBrand={activeBrand} onChange={handleBrandChange} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-6">
        {activeTab === 'orders' ? (
          <OrdersView onReorder={handleReorder} />
        ) : (
          <>
            {!searchQuery && (
              <>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeBrand}
              initial={{ opacity: 0, x: activeBrand === 'ai-cha' ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: activeBrand === 'ai-cha' ? 10 : -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* Categories */}
              <CategoryScroller 
                brand={activeBrand}
                categories={categories}
                activeCategory={activeCategory}
                onChange={setActiveCategory}
              />

              {/* Menu Grid */}
              {isLoading ? (
                <MenuGridSkeleton count={6} />
              ) : visibleItems.length === 0 ? (
                <EmptyMenuState 
                  type="category" 
                  onAction={activeCategory !== 'All' ? () => setActiveCategory('All') : undefined} 
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {visibleItems.map(item => (
                    <MenuItemCard 
                      key={item.id} 
                      item={item} 
                      onAdd={handleAddItem} 
                      isFavorite={isFavorite(item.id)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}

      {/* Search Results */}
      {searchQuery && (
        <div className="mt-2">
          <h2 className="text-lg font-bold mb-4">{t('searchResults', 'Search Results')}</h2>
          {visibleItems.length === 0 ? (
            <EmptyMenuState type="search" onAction={() => setSearchQuery('')} />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {visibleItems.map(item => (
                <MenuItemCard 
                  key={item.id} 
                  item={item} 
                  onAdd={handleAddItem} 
                  isFavorite={isFavorite(item.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </div>
      )}
      </>
      )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-auto min-w-[200px] bg-white/30 backdrop-blur-2xl border border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.1)] rounded-full py-1.5 px-6 flex justify-center gap-8 z-20 supports-[backdrop-filter]:bg-white/20">
        <button 
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center py-1 px-2 transition-colors ${activeTab === 'menu' ? 'text-brand-primary' : 'text-tg-hint hover:text-tg-text'}`}
        >
          <List size={22} weight={activeTab === 'menu' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-bold mt-0.5">Menu</span>
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center py-1 px-2 transition-colors ${activeTab === 'orders' ? 'text-brand-primary' : 'text-tg-hint hover:text-tg-text'}`}
        >
          <ClockCounterClockwise size={22} weight={activeTab === 'orders' ? 'fill' : 'regular'} />
          <span className="text-[10px] font-bold mt-0.5">Orders</span>
        </button>
      </div>

      {/* Floating Cart Button (Fallback if Telegram MainButton is not available) */}
      {(!WebApp?.isExpanded && cart.length > 0 && !isCartOpen) && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-20 left-4 right-4 z-30"
        >
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-tg-primary/80 backdrop-blur-lg backdrop-brightness-150 text-tg-primary-text py-4 rounded-2xl font-bold flex justify-between items-center px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.15)]"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart size={20} weight="fill" />
              <span>{cart.length} {t('items')}</span>
            </div>
            <span>{t('checkout')} {formatCurrency(cartTotal)}</span>
          </button>
        </motion.div>
      )}

      {/* Scroll to Top Button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-16 right-4 z-40 w-12 h-12 flex items-center justify-center hover:scale-110 transition-transform active:scale-95 cursor-pointer"
          >
            <img src="/images/aicha_scroll_top.png" alt="Scroll to top" className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Modals */}
      {activeModalItem && (
        <ModifierModal 
          item={activeModalItem} 
          initialSelected={modalInitialSelected}
          editingCartItemId={editingCartItemId}
          onClose={() => {
            setActiveModalItem(null);
            setModalInitialSelected(undefined);
            setEditingCartItemId(null);
          }}
          onConfirm={addToCart}
        />
      )}

      <CartDrawer
        isOpen={isCartOpen}
        cart={cart}
        onClose={() => setIsCartOpen(false)}
        onRemove={removeFromCart}
        onUpdateQuantity={handleUpdateQuantity}
        onEdit={handleEditItem}
        onCheckout={() => setIsCheckoutOpen(true)}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        total={cartTotal}
        cart={cart}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
}

