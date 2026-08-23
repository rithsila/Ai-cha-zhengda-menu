import { useState, useMemo, useEffect, useCallback } from 'react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Translate, MagnifyingGlass, X, List, ClockCounterClockwise, CreditCard, Gift, User } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from './hooks/useFavorites';
import { useTelegramTheme } from './hooks/useTelegramTheme';
import { formatCurrency } from './utils/format';
import { apiFetch, hasIdentity } from './utils/api';
import { refreshOnlinePaymentState } from './utils/onlinePayment';

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
import { PaymentView } from './components/PaymentView';
import { RewardsView } from './components/RewardsView';
import { AccountView } from './components/AccountView';
import { Button } from './components/ui/Button';

type TabId = 'menu' | 'orders' | 'payment' | 'rewards' | 'account';

const TAB_META: Record<TabId, { titleKey: string; titleFallback: string; subKey: string; subFallback: string }> = {
  menu: { titleKey: 'menuTitle', titleFallback: 'Menu', subKey: 'menuSubtitle', subFallback: 'Tap to order instantly' },
  orders: { titleKey: 'ordersTitle', titleFallback: 'My Orders', subKey: 'ordersSubtitle', subFallback: 'Track your active and past orders' },
  payment: { titleKey: 'paymentTitle', titleFallback: 'Payment', subKey: 'paymentSubtitle', subFallback: 'Pay for orders and see your payment history' },
  rewards: { titleKey: 'rewardsTitle', titleFallback: 'Rewards', subKey: 'rewardsSubtitle', subFallback: 'Your points and what you can get' },
  account: { titleKey: 'accountTitle', titleFallback: 'My Account', subKey: 'accountSubtitle', subFallback: 'Manage your profile' },
};

const TABS: { id: TabId; Icon: typeof List; labelKey: string; labelFallback: string }[] = [
  { id: 'menu', Icon: List, labelKey: 'tabMenu', labelFallback: 'Menu' },
  { id: 'orders', Icon: ClockCounterClockwise, labelKey: 'tabOrders', labelFallback: 'Orders' },
  { id: 'payment', Icon: CreditCard, labelKey: 'tabPayment', labelFallback: 'Payment' },
  { id: 'rewards', Icon: Gift, labelKey: 'tabRewards', labelFallback: 'Rewards' },
  { id: 'account', Icon: User, labelKey: 'tabAccount', labelFallback: 'Account' },
];

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

const WebLogin = ({ onContinueAsGuest }: { onContinueAsGuest: () => void }) => {
  const botName = import.meta.env.VITE_BOT_NAME || 'aicha_zhengda_arakawa_bot';

  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-tg-bg p-6 text-center">
      <div className="bg-tg-secondary-bg p-8 rounded-2xl shadow-sm max-w-sm w-full">
        <h1 className="text-2xl font-bold text-tg-text mb-2">Welcome</h1>
        <p className="text-tg-hint mb-8">
          Order easily through our Telegram App or continue as a guest.
        </p>

        <a
          href={`https://t.me/${botName}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .26z"/>
          </svg>
          Open in Telegram App
        </a>

        {/* Logging in is only needed for points, saved address and history.
            A guest can still browse and order for pickup with cash. */}
        <button
          type="button"
          onClick={onContinueAsGuest}
          className="mt-4 text-sm font-semibold text-brand-primary underline underline-offset-4"
        >
          Continue as guest
        </button>
      </div>
    </div>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  useTelegramTheme();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const [activeBrand, setActiveBrand] = useState<Brand>('ai-cha');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('menu');
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeModalItem, setActiveModalItem] = useState<MenuItem | null>(null);
  const [modalInitialSelected, setModalInitialSelected] = useState<Record<string, ModifierOption[]> | undefined>();
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [guestMode, setGuestMode] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Ask the server once, on load, whether it can take a QR payment today, so no
  // screen offers KHQR when ABA has no credentials.
  useEffect(() => {
    refreshOnlinePaymentState();
  }, []);

  const [dynamicCatalog, setDynamicCatalog] = useState<MenuItem[]>(CATALOG);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/catalog');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: MenuItem[] = data.map((item: any) => ({
            id: item.id,
            brand: item.brand,
            category: item.category,
            name: item.name,
            description: item.description,
            basePrice: item.basePrice,
            imageFallback: item.image,
            isSoldOut: Boolean(item.isSoldOut),
            modifiers: item.modifiers?.map((g: any) => ({
              id: g.key || g.id,
              name: g.name,
              type: g.type,
              required: g.required,
              options: g.options?.map((o: any) => ({
                id: o.key || o.id,
                name: o.name,
                priceDelta: o.priceDelta,
              })) || [],
            })),
          }));
          setDynamicCatalog(mapped);
        }
      }
    } catch (error) {
      console.error('Failed to fetch dynamic catalog', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
    const interval = setInterval(fetchCatalog, 5000); // Poll catalog updates every 5s
    return () => clearInterval(interval);
  }, [fetchCatalog]);

  // Derived state for current brand's items
  const brandItems = useMemo(() => {
    return dynamicCatalog.filter((i) => i.brand === activeBrand);
  }, [activeBrand, dynamicCatalog]);

  const categories = useMemo(() => {
    return ['All', ...new Set(brandItems.map((i) => i.category))];
  }, [brandItems]);

  // Filtered items
  const visibleItems = useMemo(() => {
    let items: typeof brandItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = dynamicCatalog.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q)
      );
    } else if (activeCategory === 'All') {
      items = brandItems;
    } else {
      items = brandItems.filter((i) => i.category === activeCategory);
    }

    return [...items].sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      return bFav - aFav;
    });
  }, [dynamicCatalog, brandItems, activeCategory, searchQuery, favorites]);

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
    const menuItem = dynamicCatalog.find((i) => i.id === cartItem.menuItemId) || CATALOG.find((i) => i.id === cartItem.menuItemId);
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

  // Logging in unlocks the personal tabs. A guest who taps "continue" still
  // gets the menu and cash pickup -- the API allows an order with no identity.
  if (!hasIdentity() && !guestMode && import.meta.env.PROD) {
    return <WebLogin onContinueAsGuest={() => setGuestMode(true)} />;
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
        <div className="absolute inset-0 bg-black/40 dark:bg-black/55 z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 dark:from-black/75 to-transparent z-0 pointer-events-none"></div>
        
        {/* Header */}
        <header className="mb-6 flex justify-between items-start relative z-10 text-white">
          <div>
            <h1 className="text-3xl font-bold font-sans drop-shadow-md">{t(TAB_META[activeTab].titleKey, TAB_META[activeTab].titleFallback)}</h1>
            <p className="text-white/90 text-sm drop-shadow-md">{t(TAB_META[activeTab].subKey, TAB_META[activeTab].subFallback)}</p>
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
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-tg-hint">
                    <MagnifyingGlass size={20} />
                  </div>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder={t('searchMenu', 'Search menu...')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-tg-bg/95 backdrop-blur-md text-tg-text pl-12 pr-10 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-shadow shadow-md"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute inset-y-0 right-4 flex items-center text-tg-hint hover:text-tg-text"
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
        {activeTab === 'orders' && <OrdersView onReorder={handleReorder} onBrowseMenu={() => setActiveTab('menu')} />}
        {activeTab === 'payment' && <PaymentView onBrowseMenu={() => setActiveTab('menu')} />}
        {activeTab === 'rewards' && <RewardsView onBrowseMenu={() => setActiveTab('menu')} />}
        {activeTab === 'account' && <AccountView onBrowseMenu={() => setActiveTab('menu')} />}
        {activeTab === 'menu' && (
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
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-auto min-w-[200px] max-w-[calc(100vw-1.5rem)] bg-tg-bg/30 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] rounded-full py-1.5 px-3 flex justify-around gap-1 z-20 supports-[backdrop-filter]:bg-tg-bg/20">
        {TABS.map(({ id, Icon, labelKey, labelFallback }) => (
          <button 
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-col items-center py-1 px-1.5 transition-colors ${activeTab === id ? 'text-brand-primary' : 'text-tg-hint hover:text-tg-text'}`}
          >
            <Icon size={20} weight={activeTab === id ? 'fill' : 'regular'} />
            <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">{t(labelKey, labelFallback)}</span>
          </button>
        ))}
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
            className="w-full bg-tg-primary/80 backdrop-blur-lg backdrop-brightness-150 text-tg-primary-text py-4 rounded-2xl font-bold flex justify-between items-center px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
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
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
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

