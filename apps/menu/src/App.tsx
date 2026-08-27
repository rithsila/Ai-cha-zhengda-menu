import { useState, useMemo, useEffect, useCallback } from 'react';
import twa from '@twa-dev/sdk';
const WebApp = (twa as any)?.WebApp || twa || {};
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Translate, MagnifyingGlass, X, List, ClockCounterClockwise, Gift, User } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from './hooks/useFavorites';
import { useTelegramTheme } from './hooks/useTelegramTheme';
import { formatCurrency } from './utils/format';
import { apiFetch, hasIdentity } from './utils/api';
import { refreshOnlinePaymentState } from './utils/onlinePayment';
import { useStoreStatus, refreshStoreStatus } from './utils/storeStatus';
import { loginAsDevCustomer } from './utils/telegramUser';

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
import { RewardsView } from './components/RewardsView';
import { AccountView } from './components/AccountView';
import { Button } from './components/ui/Button';

type TabId = 'menu' | 'orders' | 'rewards' | 'account';

const TAB_META: Record<TabId, { titleKey: string; titleFallback: string; subKey: string; subFallback: string }> = {
  menu: { titleKey: 'menuTitle', titleFallback: 'Menu', subKey: 'menuSubtitle', subFallback: 'Tap to order instantly' },
  orders: { titleKey: 'ordersTitle', titleFallback: 'My Orders', subKey: 'ordersSubtitle', subFallback: 'Track your active and past orders' },
  rewards: { titleKey: 'rewardsTitle', titleFallback: 'Rewards', subKey: 'rewardsSubtitle', subFallback: 'Your stamps and rewards' },
  account: { titleKey: 'accountTitle', titleFallback: 'My Account', subKey: 'accountSubtitle', subFallback: 'Manage your profile' },
};

const TABS: { id: TabId; Icon: typeof List; labelKey: string; labelFallback: string }[] = [
  { id: 'menu', Icon: List, labelKey: 'tabMenu', labelFallback: 'Menu' },
  { id: 'orders', Icon: ClockCounterClockwise, labelKey: 'tabOrders', labelFallback: 'Orders' },
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
    <div className="relative flex flex-col min-h-[100dvh] w-screen items-center justify-center p-6 text-center overflow-hidden bg-[#0A0D14]">
      {/* Dynamic Brand Ambient Glow Orbs */}
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.35, 0.55, 0.35],
          x: [0, 30, 0],
          y: [0, -40, 0],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-24 -left-20 w-96 h-96 rounded-full bg-gradient-to-br from-[#10b981]/30 via-[#059669]/20 to-transparent blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, -35, 0],
          y: [0, 35, 0],
        }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -bottom-28 -right-20 w-96 h-96 rounded-full bg-gradient-to-tl from-[#e53935]/30 via-[#ef4444]/20 to-transparent blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.3, 0.15],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-radial from-[#38bdf8]/15 via-transparent to-transparent blur-2xl pointer-events-none"
      />

      {/* Subtle Pattern Grid */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none" 
        style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />

      {/* Double-Bezel Hardware Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-sm p-2 rounded-[2.5rem] bg-gradient-to-b from-white/15 to-white/5 border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-2xl"
      >
        <div className="p-7 sm:p-8 rounded-[2rem] bg-[#111827]/85 border border-white/10 shadow-inner flex flex-col items-center">
          
          {/* Dual Brand Header Floating Badges */}
          <div className="flex items-center justify-center gap-3 mb-6 p-2 px-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-1.5">
              <img src="/images/aicha-logo.webp" alt="Ai-Cha" className="h-7 w-auto object-contain drop-shadow-md" />
              <span className="text-xs font-bold text-white tracking-wide">Ai-Cha</span>
            </div>
            <span className="text-white/30 text-xs font-light">✕</span>
            <div className="flex items-center gap-1.5">
              <img src="/images/zhengda_logo_cropped.webp" alt="Zhengda" className="h-7 w-auto object-contain drop-shadow-md" />
              <span className="text-xs font-bold text-white tracking-wide">Zhengda</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
            Fresh Tea & Crispy
          </h1>
          <p className="text-xs sm:text-sm text-slate-300/80 mb-8 max-w-[260px] leading-relaxed">
            Order your favorite boba, smoothies & crispy chicken on Telegram.
          </p>

          {/* Primary CTA - Open in Telegram App */}
          <a
            href={`https://t.me/${botName}?start=menu`}
            onClick={() => {
              // Try direct tg:// deep link protocol first for installed desktop/mobile app
              window.location.href = `tg://resolve?domain=${botName}&start=menu`;
            }}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center justify-center gap-3 w-full py-3.5 px-5 bg-gradient-to-r from-[#2AABEE] to-[#229ED9] hover:from-[#32b2f5] hover:to-[#25a5e3] text-white text-sm font-bold rounded-2xl transition-all duration-300 shadow-[0_8px_24px_rgba(42,171,238,0.35)] hover:shadow-[0_12px_28px_rgba(42,171,238,0.45)] active:scale-[0.98]"
          >
            <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .26z"/>
              </svg>
            </div>
            <span>Open in Telegram App</span>
          </a>

          {/* Secondary Action - Guest */}
          <button
            type="button"
            onClick={onContinueAsGuest}
            className="mt-4 text-xs font-semibold text-slate-400 hover:text-white transition-colors duration-200 py-1.5 px-3 rounded-lg hover:bg-white/5"
          >
            Or browse as guest →
          </button>

          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={async () => {
                await loginAsDevCustomer('dev_test_customer');
                onContinueAsGuest();
              }}
              className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors duration-200 py-1.5 px-3 rounded-lg hover:bg-emerald-500/10 flex items-center gap-1.5"
            >
              <span>🧪</span> Sign in with Test Account (Dev)
            </button>
          )}
        </div>
      </motion.div>

      {/* Subtle Footer Identity */}
      <p className="relative z-10 text-[11px] font-medium text-slate-500 mt-8 tracking-wider uppercase">
        Arakawa Branch • Official Menu
      </p>
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

  const storeStatus = useStoreStatus();

  // Refresh payment and store status periodically
  useEffect(() => {
    refreshOnlinePaymentState();
    refreshStoreStatus();
    const interval = setInterval(refreshStoreStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const [dynamicCatalog, setDynamicCatalog] = useState<MenuItem[]>(CATALOG);
  const [isLoading, setIsLoading] = useState(false);

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
            imageFallback: item.image || CATALOG.find((c) => c.id === item.id)?.imageFallback,
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
    const handleFocus = () => fetchCatalog();
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(fetchCatalog, 60000); // Poll catalog updates every 60s
    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
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
    <div className="min-h-screen bg-tg-bg text-tg-text pb-44">
      {/* Top Banner Section */}
      <div 
        className="relative bg-cover bg-center bg-no-repeat rounded-b-[2rem] pt-8 px-4 pb-4 shadow-sm overflow-hidden"
        style={{ backgroundImage: 'url(/banner.webp)' }}
      >
        <div className="absolute inset-0 bg-black/20 z-0 pointer-events-none"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent z-0 pointer-events-none"></div>
        
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

            {/* Store Closed Banner */}
            {!storeStatus.isOpen && (
              <div className="mt-3 px-3.5 py-2.5 rounded-2xl bg-black/45 backdrop-blur-md border border-white/20 text-white flex items-center justify-between text-xs shadow-lg animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🕒</span>
                  <div>
                    <span className="font-bold block text-red-300 leading-tight">{t('shopClosed', 'Shop Closed')}</span>
                    <span className="text-white/80 text-[11px]">
                      {t('shopOpeningHours', 'Operating hours: {{hours}}', { hours: `${storeStatus.openTime} – ${storeStatus.closeTime}` })}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/30 text-red-200 border border-red-400/30 font-bold uppercase tracking-wider">
                  {t('closed', 'Closed')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-4">
        {activeTab === 'orders' && <OrdersView onReorder={handleReorder} onBrowseMenu={() => setActiveTab('menu')} />}
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

      {/* Bottom Navigation (Apple Liquid Glass Compact Dock) */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[86%] max-w-[330px] bg-gradient-to-b from-white/30 via-white/20 to-white/10 backdrop-blur-2xl border border-white/40 shadow-[0_12px_32px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.45),inset_0_-1px_1px_rgba(0,0,0,0.15)] rounded-full py-1 px-2 flex justify-between items-center z-20">
        {TABS.map(({ id, Icon, labelKey, labelFallback }) => {
          const isActive = activeTab === id;
          return (
            <button 
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex flex-col items-center py-1 px-1 rounded-xl transition-all active:scale-95 ${
                isActive 
                  ? 'text-brand-primary font-bold drop-shadow-[0_2px_6px_rgba(229,57,53,0.35)]' 
                  : 'text-tg-hint hover:text-tg-text font-medium'
              }`}
            >
              <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
              <span className="text-[10px] mt-0.5 whitespace-nowrap">{t(labelKey, labelFallback)}</span>
            </button>
          );
        })}
      </div>

      {/* Floating Cart Button (Apple Liquid Glass Red Pill) */}
      {(!WebApp?.isExpanded && cart.length > 0 && !isCartOpen) && (
        <motion.div 
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-[4.75rem] left-4 right-4 max-w-sm mx-auto z-30"
        >
          <button 
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-b from-[#ef4444]/95 via-[#e53935]/90 to-[#dc2626]/95 backdrop-blur-2xl text-white py-3.5 rounded-2xl font-bold flex justify-between items-center px-5 border border-white/35 shadow-[0_14px_32px_rgba(229,57,53,0.38),inset_0_1.5px_1.5px_rgba(255,255,255,0.6),inset_0_-1px_1px_rgba(0,0,0,0.25)] transition-all duration-300 active:scale-[0.98]"
          >
            <div className="flex items-center gap-2 text-sm">
              <ShoppingCart size={18} weight="fill" />
              <span>{cart.length} {t('items')}</span>
            </div>
            <span className="text-sm font-black">
              {!storeStatus.isOpen ? t('shopClosed', 'Shop Closed') : `${t('checkout')} ${formatCurrency(cartTotal)}`}
            </span>
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
            className={`fixed right-4 z-40 w-11 h-11 flex items-center justify-center hover:scale-110 transition-all duration-300 active:scale-95 cursor-pointer ${cart.length > 0 && !isCartOpen ? 'bottom-[9.5rem]' : 'bottom-20'}`}
          >
            <img src="/images/aicha_scroll_top.webp" alt="Scroll to top" className="w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]" />
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

