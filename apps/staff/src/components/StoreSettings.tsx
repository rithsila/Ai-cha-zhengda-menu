import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Bell,
  Clock,
  Truck,
  ShoppingBag,
  Coins,
  QrCode,
  Sliders,
  RotateCcw,
  Image as ImageIcon,
  Upload,
  Link,
  Trash2,
  Store,
  MapPin,
  Phone,
  Play,
  Share2,
  Globe,
} from 'lucide-react';
import { apiFetch, API_BASE, authHeaders, resolveImageUrl } from '../lib/api';
import { Badge, Button, Card, Segmented, Skeleton, Switch, useToast } from './ui';
import { testAlertSound } from '../lib/alert';

export interface MenuTabItem {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
}

export interface SocialBadgeItem {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
}

export interface StoreConfigState {
  storeStatus: 'auto' | 'open' | 'closed';
  openTime: string;
  closeTime: string;
  enablePickup: boolean;
  enableDelivery: boolean;
  enableCash: boolean;
  enableKhqr: boolean;
  deliveryFee: number;
  isOpen: boolean;
  currentTime: string;
  reason: string;
  menuBannerUrl: string;
  menuTabsConfig: MenuTabItem[];
  shopName: string;
  shopAddress: string;
  shopDeliveryNote: string;
  shopSocialsEnabled: boolean;
  shopSocialLinks: SocialBadgeItem[];
  orderWarnPendingMins: number;
  orderLatePendingMins: number;
  orderWarnPreparingMins: number;
  orderLatePreparingMins: number;
  orderWarnReadyMins: number;
  orderLateReadyMins: number;
  orderReminderSeconds: number;
  orderAlertSoundEnabled: boolean;
}

const DEFAULT_TABS: MenuTabItem[] = [
  { id: 'ai-cha', label: 'Ai-Cha', icon: '/images/aicha-logo.webp', enabled: true },
  { id: 'zhengda', label: 'Zhengda', icon: '/images/zhengda_logo_cropped.webp', enabled: true },
  { id: 'tab3', label: 'Specials', icon: '', enabled: false },
];

const DEFAULT_SOCIALS: SocialBadgeItem[] = [
  { id: 'telegram', label: 'Telegram', url: 'https://t.me/iLoveAiChaZhengDaArakawa', enabled: true },
  { id: 'facebook', label: 'Facebook', url: '', enabled: false },
  { id: 'instagram', label: 'Instagram', url: '', enabled: false },
  { id: 'tiktok', label: 'TikTok', url: '', enabled: false },
  { id: 'maps', label: 'Google Maps', url: '', enabled: false },
  { id: 'phone', label: 'Phone', url: '', enabled: false },
];

const DEFAULT_CONFIG: StoreConfigState = {
  storeStatus: 'auto',
  openTime: '08:00',
  closeTime: '21:00',
  enablePickup: true,
  enableDelivery: true,
  enableCash: true,
  enableKhqr: true,
  deliveryFee: 0,
  isOpen: true,
  currentTime: '',
  reason: 'schedule_open',
  menuBannerUrl: '/banner.webp',
  menuTabsConfig: DEFAULT_TABS,
  shopName: 'Our shop',
  shopAddress: 'J03, Ground Floor, Arakawa',
  shopDeliveryNote: 'Delivery inside Arakawa is free',
  shopSocialsEnabled: true,
  shopSocialLinks: DEFAULT_SOCIALS,
  orderWarnPendingMins: 5,
  orderLatePendingMins: 10,
  orderWarnPreparingMins: 8,
  orderLatePreparingMins: 15,
  orderWarnReadyMins: 10,
  orderLateReadyMins: 20,
  orderReminderSeconds: 60,
  orderAlertSoundEnabled: true,
};

function renderSocialIcon(id: string) {
  switch (id) {
    case 'telegram':
      return (
        <svg className="size-4 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.49-.83-.27-1.49-.42-1.43-.89.03-.25.38-.51 1.05-.78 4.12-1.79 6.87-2.97 8.26-3.55 3.93-1.63 4.74-1.92 5.27-1.93.12 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.21-.05.37z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg className="size-4 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg className="size-4 text-[#E4405F]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className="size-4 text-ink" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.4a6.33 6.33 0 0 0-.85-.06A6.34 6.34 0 0 0 3 15.68a6.34 6.34 0 0 0 10.82 4.47c1.7-1.7 1.86-4.3 1.86-6.42a8.27 8.27 0 0 0 5.08 1.74v-3.47a4.85 4.85 0 0 1-1.17-.31z" />
        </svg>
      );
    case 'maps':
      return <MapPin className="size-4 text-emerald-500" />;
    case 'phone':
      return <Phone className="size-4 text-amber-500" />;
    default:
      return <Globe className="size-4 text-accent" />;
  }
}

export function StoreSettings() {
  const { toast } = useToast();
  const [config, setConfig] = useState<StoreConfigState>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingTabIdx, setUploadingTabIdx] = useState<number | null>(null);
  const [showManualUrls, setShowManualUrls] = useState(false);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const tabLogoInput0Ref = useRef<HTMLInputElement>(null);
  const tabLogoInput1Ref = useRef<HTMLInputElement>(null);
  const tabLogoInput2Ref = useRef<HTMLInputElement>(null);
  const tabLogoInputRefs = [tabLogoInput0Ref, tabLogoInput1Ref, tabLogoInput2Ref];

  const fetchConfig = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statusRes, configRes] = await Promise.all([
        apiFetch<any>('/api/store/status'),
        apiFetch<Array<{ key: string; value: string }>>('/api/config'),
      ]);

      const configMap = new Map<string, string>();
      for (const row of configRes) {
        configMap.set(row.key, row.value);
      }

      let parsedTabs = DEFAULT_TABS;
      const rawTabs = statusRes.menuTabsConfig || configMap.get('menuTabsConfig');
      if (rawTabs) {
        try {
          const parsed = typeof rawTabs === 'string' ? JSON.parse(rawTabs) : rawTabs;
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedTabs = parsed;
          }
        } catch {}
      }

      let parsedSocials = DEFAULT_SOCIALS;
      const rawSocials = statusRes.shopSocialLinks || configMap.get('shopSocialLinks');
      if (rawSocials) {
        try {
          const parsed = typeof rawSocials === 'string' ? JSON.parse(rawSocials) : rawSocials;
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedSocials = parsed;
          }
        } catch {}
      }

      setConfig({
        storeStatus: (statusRes.storeStatus || 'auto') as 'auto' | 'open' | 'closed',
        openTime: statusRes.openTime || configMap.get('openTime') || '08:00',
        closeTime: statusRes.closeTime || configMap.get('closeTime') || '21:00',
        enablePickup: statusRes.enablePickup ?? (configMap.get('enablePickup') !== '0'),
        enableDelivery: statusRes.enableDelivery ?? (configMap.get('enableDelivery') !== '0'),
        enableCash: statusRes.enableCash ?? (configMap.get('enableCash') !== '0'),
        enableKhqr: statusRes.enableKhqr ?? (configMap.get('enableKhqr') !== '0'),
        deliveryFee: Number(configMap.get('deliveryFee') ?? 0),
        isOpen: !!statusRes.isOpen,
        currentTime: statusRes.currentTime || '',
        reason: statusRes.reason || '',
        menuBannerUrl: statusRes.menuBannerUrl || configMap.get('menuBannerUrl') || '/banner.webp',
        menuTabsConfig: parsedTabs,
        shopName: statusRes.shopName ?? configMap.get('shopName') ?? 'Our shop',
        shopAddress: statusRes.shopAddress ?? configMap.get('shopAddress') ?? 'J03, Ground Floor, Arakawa',
        shopDeliveryNote: statusRes.shopDeliveryNote ?? configMap.get('shopDeliveryNote') ?? 'Delivery inside Arakawa is free',
        shopSocialsEnabled: statusRes.shopSocialsEnabled ?? (configMap.get('shopSocialsEnabled') !== '0'),
        shopSocialLinks: parsedSocials,
        orderWarnPendingMins: Number(configMap.get('orderWarnPendingMins') ?? 5),
        orderLatePendingMins: Number(configMap.get('orderLatePendingMins') ?? 10),
        orderWarnPreparingMins: Number(configMap.get('orderWarnPreparingMins') ?? 8),
        orderLatePreparingMins: Number(configMap.get('orderLatePreparingMins') ?? 15),
        orderWarnReadyMins: Number(configMap.get('orderWarnReadyMins') ?? 10),
        orderLateReadyMins: Number(configMap.get('orderLateReadyMins') ?? 20),
        orderReminderSeconds: Number(configMap.get('orderReminderSeconds') ?? 60),
        orderAlertSoundEnabled: (configMap.get('orderAlertSoundEnabled') ?? '1') !== '0',
      });
    } catch {
      toast({
        title: "Couldn't load store settings",
        description: 'Please check your connection and try again.',
        variant: 'error',
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateSetting = async (key: string, value: string | number | boolean, label: string) => {
    setUpdatingKey(key);
    try {
      let strVal = String(value);
      if (typeof value === 'boolean') {
        strVal = value ? '1' : '0';
      }
      await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: strVal }),
      });

      toast({
        title: `${label} updated`,
        variant: 'success',
      });

      // Refresh store status silently without flashing skeletons
      await fetchConfig(true);
    } catch (err: any) {
      toast({
        title: `Failed to update ${label}`,
        description: err?.message || 'Please check value and try again.',
        variant: 'error',
      });
    } finally {
      setUpdatingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-28 w-full rounded-none" />
        <Skeleton className="h-44 w-full rounded-none" />
        <Skeleton className="h-44 w-full rounded-none" />
      </div>
    );
  }

  const modeOptions: Array<{ id: 'auto' | 'open' | 'closed'; label: string; icon?: React.ReactNode }> = [
    { id: 'auto', label: 'Automatic (Schedule)' },
    { id: 'open', label: 'Force Open' },
    { id: 'closed', label: 'Force Closed' },
  ];

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Banner image must be under 5MB', variant: 'error' });
      return;
    }
    setUploadingBanner(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      if (data.url) {
        setConfig((prev) => ({ ...prev, menuBannerUrl: data.url }));
        await updateSetting('menuBannerUrl', data.url, 'Top Banner Photo');
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'error' });
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const handleTabUpdate = async (index: number, partial: Partial<MenuTabItem>) => {
    const nextTabs = config.menuTabsConfig.map((t, i) => (i === index ? { ...t, ...partial } : t));
    setConfig((prev) => ({ ...prev, menuTabsConfig: nextTabs }));
    await updateSetting('menuTabsConfig', JSON.stringify(nextTabs), `Menu Tab ${index + 1}`);
  };

  const handleTabLogoUpload = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Logo image must be under 2MB', variant: 'error' });
      return;
    }
    setUploadingTabIdx(idx);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      const data = await res.json();
      if (data.url) {
        await handleTabUpdate(idx, { icon: data.url });
        toast({ title: `Tab ${idx + 1} Logo uploaded`, variant: 'success' });
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'error' });
    } finally {
      setUploadingTabIdx(null);
      const ref = tabLogoInputRefs[idx];
      if (ref?.current) ref.current.value = '';
    }
  };

  const handleSocialUpdate = async (index: number, partial: Partial<SocialBadgeItem>) => {
    const nextSocials = config.shopSocialLinks.map((s, i) => (i === index ? { ...s, ...partial } : s));
    setConfig((prev) => ({ ...prev, shopSocialLinks: nextSocials }));
    await updateSetting('shopSocialLinks', JSON.stringify(nextSocials), `${nextSocials[index].label} Link`);
  };

  const handleTabCountPreset = async (count: 1 | 2 | 3) => {
    const nextTabs = config.menuTabsConfig.map((t, i) => ({
      ...t,
      enabled: i < count,
    }));
    setConfig((prev) => ({ ...prev, menuTabsConfig: nextTabs }));
    await updateSetting('menuTabsConfig', JSON.stringify(nextTabs), `${count} Menu Tabs`);
  };

  const activeTabsCount = config.menuTabsConfig.filter((t) => t.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Operating Hours & Auto-Schedule */}
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
              <Clock className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">Operating Mode &amp; Hours</h3>
                <Badge variant={config.isOpen ? 'success' : 'danger'}>
                  <span className="inline-block size-2 rounded-none bg-current mr-1.5 animate-pulse" />
                  {config.isOpen ? 'OPEN FOR ORDERS' : 'CURRENTLY CLOSED'}
                </Badge>
              </div>
              <p className="text-xs text-ink-soft mt-0.5">
                {config.storeStatus === 'auto' && (
                  <>
                    Operating hours:{' '}
                    <strong className="text-ink">
                      {config.openTime} – {config.closeTime}
                    </strong>{' '}
                    (Cambodia UTC+7) • Current time:{' '}
                    <span className="font-mono font-bold text-ink">{config.currentTime || '--:--'}</span>
                  </>
                )}
                {config.storeStatus === 'open' && (
                  <span className="text-success font-medium">
                    Manual override: Store is kept open continuously.
                  </span>
                )}
                {config.storeStatus === 'closed' && (
                  <span className="text-danger font-medium">
                    Manual override: Store is closed to new orders right now.
                  </span>
                )}
              </p>
            </div>
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={() => fetchConfig()}
            className="shrink-0 gap-2 text-xs"
          >
            <RotateCcw className="size-3.5" />
            Refresh
          </Button>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            Store Operating Mode
          </label>
          <Segmented
            ariaLabel="Store Operating Mode"
            value={config.storeStatus}
            onChange={(val) => updateSetting('storeStatus', val as any, 'Store Mode')}
            options={modeOptions}
          />
        </div>

        {/* Schedule Inputs */}
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Clock className="size-4 text-ink-faint" />
              Opening Time (HH:mm)
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={config.openTime}
                onChange={(e) => setConfig((prev) => ({ ...prev, openTime: e.target.value }))}
                onBlur={(e) => updateSetting('openTime', e.target.value, 'Opening Time')}
                className="h-11 flex-1 rounded-none border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-ink-faint">Format: 24-hour e.g. 08:00</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Clock className="size-4 text-ink-faint" />
              Closing Time (HH:mm)
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={config.closeTime}
                onChange={(e) => setConfig((prev) => ({ ...prev, closeTime: e.target.value }))}
                onBlur={(e) => updateSetting('closeTime', e.target.value, 'Closing Time')}
                className="h-11 flex-1 rounded-none border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <span className="text-[11px] text-ink-faint">Format: 24-hour e.g. 21:00</span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-xs text-ink-faint mr-1 font-medium">Quick Hours:</span>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '08:00', 'Opening Time');
              await updateSetting('closeTime', '21:00', 'Closing Time');
            }}
            className="rounded-none border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            08:00 – 21:00 (Standard)
          </button>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '07:30', 'Opening Time');
              await updateSetting('closeTime', '22:00', 'Closing Time');
            }}
            className="rounded-none border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            07:30 – 22:00 (Extended)
          </button>
          <button
            type="button"
            onClick={async () => {
              await updateSetting('openTime', '09:00', 'Opening Time');
              await updateSetting('closeTime', '23:00', 'Closing Time');
            }}
            className="rounded-none border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-sunken hover:text-ink"
          >
            09:00 – 23:00 (Late Night)
          </button>
        </div>
      </Card>

      {/* 2. Customer Menu Banner & Brand Tabs */}
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
            <ImageIcon className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Menu Banner &amp; Brand Tabs</h3>
            <p className="text-xs text-ink-soft">
              Customize customer menu top background photo and adjust menu tabs (1 to 3 tabs).
            </p>
          </div>
        </div>

        {/* Banner Section */}
        <div className="flex flex-col gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            Top Header Background Photo
          </label>

          {/* Banner Preview */}
          <div className="relative h-36 w-full rounded-none overflow-hidden border border-border bg-black/40 shadow-inner flex items-end p-4">
            <img
              src={resolveImageUrl(config.menuBannerUrl)}
              alt="Menu Background Preview"
              className="absolute inset-0 h-full w-full object-cover opacity-85"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/banner.webp';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
            <div className="relative z-10 text-white flex items-center justify-between w-full">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 block">Customer Menu Preview</span>
                <span className="text-base font-extrabold drop-shadow">Top Background Photo</span>
              </div>
              <Badge variant="neutral" className="bg-black/60 backdrop-blur-md text-white border-white/20 text-[10px]">
                Active Banner
              </Badge>
            </div>
          </div>

          {/* Upload Button & Size Guide */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-none bg-surface-raised border border-border">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                <span>📐</span> Recommended Banner Size:
              </span>
              <span className="text-xs text-ink-soft">
                <strong>1200×600px</strong> or <strong>1920×1080px</strong> (Landscape 16:9 / 21:9), Max 5MB (JPG, PNG, WebP)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />

              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={uploadingBanner}
                onClick={() => bannerInputRef.current?.click()}
                className="gap-2 text-xs shrink-0"
              >
                <Upload className="size-4" />
                {uploadingBanner ? 'Uploading...' : 'Upload Banner Photo'}
              </Button>
            </div>
          </div>

          {/* Quick Banner Presets & Advanced Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-faint font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={() => updateSetting('menuBannerUrl', '/banner.webp', 'Menu Banner Photo')}
                className={`rounded-none border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  config.menuBannerUrl === '/banner.webp'
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-border bg-surface text-ink-soft hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                Default (Ai-Cha &amp; Zhengda)
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    'menuBannerUrl',
                    '/images/zhengda_downloads/web-banner-zhengda_1_.webp',
                    'Menu Banner Photo'
                  )
                }
                className={`rounded-none border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  config.menuBannerUrl === '/images/zhengda_downloads/web-banner-zhengda_1_.webp'
                    ? 'border-accent bg-accent/10 text-accent font-bold'
                    : 'border-border bg-surface text-ink-soft hover:bg-surface-sunken hover:text-ink'
                }`}
              >
                Zhengda Banner
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowManualUrls(!showManualUrls)}
              className="text-[11px] font-medium text-ink-faint hover:text-ink transition-colors flex items-center gap-1"
            >
              <Link className="size-3" />
              {showManualUrls ? 'Hide URL inputs' : 'Advanced: Edit URL directly'}
            </button>
          </div>

          {showManualUrls && (
            <div className="flex gap-2 pt-1 animate-fade-in">
              <input
                type="text"
                placeholder="e.g. /banner.webp or https://..."
                value={config.menuBannerUrl}
                onChange={(e) => setConfig((prev) => ({ ...prev, menuBannerUrl: e.target.value }))}
                onBlur={(e) => updateSetting('menuBannerUrl', e.target.value, 'Menu Banner Photo')}
                className="h-10 flex-1 rounded-none border border-border bg-surface px-3 text-xs font-mono text-ink focus:border-accent focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Tabs Adjustment (1 to 3 Tabs) */}
        <div className="flex flex-col gap-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-ink-faint block">
                Menu Tabs Count &amp; Settings (1 to 3 Tabs)
              </label>
              <p className="text-xs text-ink-soft">
                Currently <strong className="text-ink">{activeTabsCount} tab{activeTabsCount > 1 ? 's' : ''}</strong> enabled for customers.
              </p>
            </div>

            {/* Quick Count Preset Buttons */}
            <div className="flex items-center gap-1.5 bg-surface-sunken p-1 rounded-none border border-border">
              <button
                type="button"
                onClick={() => handleTabCountPreset(1)}
                className={`px-3 py-1 text-xs font-bold rounded-none transition-all ${
                  activeTabsCount === 1
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                1 Tab
              </button>
              <button
                type="button"
                onClick={() => handleTabCountPreset(2)}
                className={`px-3 py-1 text-xs font-bold rounded-none transition-all ${
                  activeTabsCount === 2
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                2 Tabs
              </button>
              <button
                type="button"
                onClick={() => handleTabCountPreset(3)}
                className={`px-3 py-1 text-xs font-bold rounded-none transition-all ${
                  activeTabsCount === 3
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                3 Tabs
              </button>
            </div>
          </div>

          {/* Tab Editors (3 Slots) */}
          <div className="grid gap-3 sm:grid-cols-3 pt-1">
            {config.menuTabsConfig.map((tab, idx) => (
              <div
                key={tab.id || idx}
                className={`flex flex-col gap-3 p-3.5 rounded-none border transition-all ${
                  tab.enabled
                    ? 'border-accent/40 bg-surface-raised shadow-sm'
                    : 'border-border bg-surface-sunken/40 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-none bg-surface border border-border font-bold text-xs text-ink">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-xs text-ink">Tab {idx + 1}</span>
                  </div>
                  <Switch
                    checked={tab.enabled}
                    onChange={(checked) => handleTabUpdate(idx, { enabled: checked })}
                    srLabel={`Enable tab ${idx + 1}`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-ink-soft">Tab Label (Name)</label>
                  <input
                    type="text"
                    value={tab.label}
                    onChange={(e) => {
                      const next = config.menuTabsConfig.map((t, i) =>
                        i === idx ? { ...t, label: e.target.value } : t
                      );
                      setConfig((prev) => ({ ...prev, menuTabsConfig: next }));
                    }}
                    onBlur={(e) => handleTabUpdate(idx, { label: e.target.value })}
                    placeholder={`e.g. Tab ${idx + 1}`}
                    className="h-9 w-full rounded-none border border-border bg-surface px-2.5 text-xs font-bold text-ink focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-ink-soft">Brand ID (filter items)</label>
                  <input
                    type="text"
                    value={tab.id}
                    onChange={(e) => {
                      const next = config.menuTabsConfig.map((t, i) =>
                        i === idx ? { ...t, id: e.target.value } : t
                      );
                      setConfig((prev) => ({ ...prev, menuTabsConfig: next }));
                    }}
                    onBlur={(e) => handleTabUpdate(idx, { id: e.target.value })}
                    placeholder="e.g. ai-cha, zhengda"
                    className="h-9 w-full rounded-none border border-border bg-surface px-2.5 text-xs font-mono text-ink focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Tab Icon Upload and Size Guide */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-ink-soft">Icon / Logo Image</label>
                    <span className="text-[10px] text-ink-faint">Square 1:1 (128×128)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="size-10 rounded-none bg-surface border border-border flex items-center justify-center shrink-0 overflow-hidden shadow-inner p-1">
                      {tab.icon ? (
                        <img
                          src={resolveImageUrl(tab.icon)}
                          alt={tab.label}
                          className="size-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/aicha-logo.webp';
                          }}
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-ink-faint">No Icon</span>
                      )}
                    </div>

                    <input
                      ref={tabLogoInputRefs[idx]}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleTabLogoUpload(idx, e)}
                    />

                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      disabled={uploadingTabIdx === idx}
                      onClick={() => tabLogoInputRefs[idx]?.current?.click()}
                      className="gap-1.5 text-xs py-1.5 px-2.5 flex-1 min-w-0"
                    >
                      <Upload className="size-3.5" />
                      <span className="truncate">{uploadingTabIdx === idx ? 'Uploading...' : 'Upload Logo'}</span>
                    </Button>

                    {tab.icon && (
                      <button
                        type="button"
                        onClick={() => handleTabUpdate(idx, { icon: '' })}
                        title="Remove icon"
                        className="size-8 rounded-none border border-border flex items-center justify-center text-ink-faint hover:text-danger hover:border-danger transition-colors shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Preset Logos */}
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[10px] text-ink-faint mr-0.5">Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleTabUpdate(idx, { icon: '/images/aicha-logo.webp' })}
                      className={`rounded-none px-1.5 py-0.5 text-[10px] font-medium transition-colors border ${
                        tab.icon === '/images/aicha-logo.webp'
                          ? 'border-accent bg-accent/10 text-accent font-bold'
                          : 'border-border bg-surface text-ink-soft hover:bg-surface-sunken'
                      }`}
                    >
                      Ai-Cha
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabUpdate(idx, { icon: '/images/zhengda_logo_cropped.webp' })}
                      className={`rounded-none px-1.5 py-0.5 text-[10px] font-medium transition-colors border ${
                        tab.icon === '/images/zhengda_logo_cropped.webp'
                          ? 'border-accent bg-accent/10 text-accent font-bold'
                          : 'border-border bg-surface text-ink-soft hover:bg-surface-sunken'
                      }`}
                    >
                      Zhengda
                    </button>
                  </div>

                  {showManualUrls && (
                    <input
                      type="text"
                      value={tab.icon || ''}
                      onChange={(e) => {
                        const next = config.menuTabsConfig.map((t, i) =>
                          i === idx ? { ...t, icon: e.target.value } : t
                        );
                        setConfig((prev) => ({ ...prev, menuTabsConfig: next }));
                      }}
                      onBlur={(e) => handleTabUpdate(idx, { icon: e.target.value })}
                      placeholder="Custom image URL"
                      className="h-8 w-full rounded-none border border-border bg-surface px-2 text-[11px] font-mono text-ink mt-1"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Our Shop Information & Social Media Badges */}
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
            <Store className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Our Shop Information &amp; Social Badges</h3>
            <p className="text-xs text-ink-soft">
              Customize the shop address card and social media badge links displayed on customer accounts.
            </p>
          </div>
        </div>

        {/* Shop Card Information */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <span>🏪</span> Shop Title
            </label>
            <input
              type="text"
              value={config.shopName}
              onChange={(e) => setConfig((prev) => ({ ...prev, shopName: e.target.value }))}
              onBlur={(e) => updateSetting('shopName', e.target.value, 'Shop Title')}
              placeholder="e.g. Our shop"
              className="h-11 rounded-none border border-border bg-surface px-3 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">Header title on shop card</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <MapPin className="size-3.5 text-accent" /> Shop Address
            </label>
            <input
              type="text"
              value={config.shopAddress}
              onChange={(e) => setConfig((prev) => ({ ...prev, shopAddress: e.target.value }))}
              onBlur={(e) => updateSetting('shopAddress', e.target.value, 'Shop Address')}
              placeholder="e.g. J03, Ground Floor, Arakawa"
              className="h-11 rounded-none border border-border bg-surface px-3 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">Physical location &amp; unit</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-ink flex items-center gap-1.5">
              <Truck className="size-3.5 text-accent" /> Delivery Note (Subtitle)
            </label>
            <input
              type="text"
              value={config.shopDeliveryNote}
              onChange={(e) => setConfig((prev) => ({ ...prev, shopDeliveryNote: e.target.value }))}
              onBlur={(e) => updateSetting('shopDeliveryNote', e.target.value, 'Delivery Note')}
              placeholder="e.g. Delivery inside Arakawa is free"
              className="h-11 rounded-none border border-border bg-surface px-3 text-xs font-semibold text-ink focus:border-accent focus:outline-none"
            />
            <span className="text-[11px] text-ink-faint">Highlighted in red/primary color</span>
          </div>
        </div>

        {/* Social Media Badges Section */}
        <div className="flex flex-col gap-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Share2 className="size-4 text-accent" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-ink block">
                  Social Media Badges
                </span>
                <span className="text-xs text-ink-soft">
                  Enable or disable individual badges and set their destination URLs
                </span>
              </div>
            </div>
            <Switch
              checked={config.shopSocialsEnabled}
              onChange={(checked) => updateSetting('shopSocialsEnabled', checked, 'Social Badges Section')}
              srLabel="Enable social media badges"
            />
          </div>

          {config.shopSocialsEnabled && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {config.shopSocialLinks.map((social, idx) => (
                <div
                  key={social.id}
                  className={`p-3.5 rounded-none border transition-all flex flex-col gap-2.5 ${
                    social.enabled
                      ? 'border-accent/40 bg-surface-raised shadow-sm'
                      : 'border-border bg-surface-sunken/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-xs text-ink">
                      {renderSocialIcon(social.id)}
                      <span>{social.label}</span>
                    </div>
                    <Switch
                      checked={social.enabled}
                      onChange={(checked) => handleSocialUpdate(idx, { enabled: checked })}
                      srLabel={`Enable ${social.label}`}
                    />
                  </div>

                  <input
                    type="text"
                    value={social.url}
                    onChange={(e) => {
                      const next = config.shopSocialLinks.map((s, i) =>
                        i === idx ? { ...s, url: e.target.value } : s
                      );
                      setConfig((prev) => ({ ...prev, shopSocialLinks: next }));
                    }}
                    onBlur={(e) => handleSocialUpdate(idx, { url: e.target.value })}
                    placeholder={
                      social.id === 'telegram'
                        ? 'https://t.me/iLoveAiChaZhengDaArakawa'
                        : social.id === 'phone'
                        ? 'e.g. 098765432 or +855...'
                        : social.id === 'maps'
                        ? 'https://maps.google.com/...'
                        : `https://${social.id}.com/...`
                    }
                    className="h-9 w-full rounded-none border border-border bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Live Preview of Shop Card */}
          <div className="mt-2 rounded-none border border-border bg-surface-sunken p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint block mb-2">
              Customer "Our Shop" Card Preview
            </span>
            <div className="rounded-none bg-surface p-4 border border-border shadow-sm flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent shrink-0">
                  <Store className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-ink">{config.shopName || 'Our shop'}</div>
                  <div className="text-xs text-ink-soft">{config.shopAddress || 'J03, Ground Floor, Arakawa'}</div>
                  {config.shopDeliveryNote ? (
                    <div className="text-xs font-semibold text-accent mt-0.5">
                      {config.shopDeliveryNote}
                    </div>
                  ) : null}
                </div>
              </div>

              {config.shopSocialsEnabled && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/50">
                  {config.shopSocialLinks
                    .filter((s) => s.enabled && s.url)
                    .map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-semibold bg-surface-raised border border-border text-ink"
                      >
                        {renderSocialIcon(s.id)}
                        {s.label}
                      </span>
                    ))}
                  {config.shopSocialLinks.filter((s) => s.enabled && s.url).length === 0 && (
                    <span className="text-[11px] text-ink-faint italic">No badges enabled yet.</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Order Types Toggles */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
            <Sliders className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Order Types</h3>
            <p className="text-xs text-ink-soft">
              Turn Pickup or Delivery orders on/off. When turned off, the option is disabled in the customer menu.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pickup Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-none bg-accent/10 text-accent">
                <ShoppingBag className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Pickup Orders</div>
                <div className="text-xs text-ink-soft">Customer picks up at counter</div>
              </div>
            </div>
            <Switch
              checked={config.enablePickup}
              onChange={(next) => updateSetting('enablePickup', next, 'Pickup Orders')}
              disabled={updatingKey === 'enablePickup'}
              srLabel="Enable or disable pickup orders"
            />
          </div>

          {/* Delivery Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-none bg-accent/10 text-accent">
                <Truck className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Delivery Orders</div>
                <div className="text-xs text-ink-soft">Delivery inside Arakawa buildings</div>
              </div>
            </div>
            <Switch
              checked={config.enableDelivery}
              onChange={(next) => updateSetting('enableDelivery', next, 'Delivery Orders')}
              disabled={updatingKey === 'enableDelivery'}
              srLabel="Enable or disable delivery orders"
            />
          </div>
        </div>
      </Card>

      {/* 4. Payment Methods Toggles */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
            <Coins className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Payment Methods</h3>
            <p className="text-xs text-ink-soft">
              Control accepted payment methods at checkout.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Cash Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-none bg-emerald-500/10 text-emerald-600">
                <Coins className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">Cash Payment</div>
                <div className="text-xs text-ink-soft">Pay at counter or upon delivery</div>
              </div>
            </div>
            <Switch
              checked={config.enableCash}
              onChange={(next) => updateSetting('enableCash', next, 'Cash Payment')}
              disabled={updatingKey === 'enableCash'}
              srLabel="Enable or disable cash payment"
            />
          </div>

          {/* KHQR Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-none bg-rose-500/10 text-rose-600">
                <QrCode className="size-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-ink">KHQR Payment</div>
                <div className="text-xs text-ink-soft">Bakong / ABA PayWay QR scan</div>
              </div>
            </div>
            <Switch
              checked={config.enableKhqr}
              onChange={(next) => updateSetting('enableKhqr', next, 'KHQR Payment')}
              disabled={updatingKey === 'enableKhqr'}
              srLabel="Enable or disable KHQR payment"
            />
          </div>
        </div>
      </Card>

      {/* 5. Kitchen Alert Sounds & Timers */}
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
              <Bell className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Kitchen Alert Sounds &amp; Timers</h3>
              <p className="text-xs text-ink-soft">
                Adjust wait-time warning &amp; overdue minutes, repeat reminder interval, and test alert sounds.
              </p>
            </div>
          </div>
        </div>

        {/* Audio Sound Testers */}
        <div className="flex flex-col gap-2 rounded-none border border-border bg-surface-sunken/40 p-4">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-faint">
            Audio Chime Test (Check Tablet Speaker)
          </label>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => testAlertSound('newOrder')}
              className="gap-2 text-xs font-bold"
            >
              <Play className="size-3.5 text-accent" />
              <span>Test New Order Chime</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => testAlertSound('reminder')}
              className="gap-2 text-xs font-bold"
            >
              <Play className="size-3.5 text-status-pending" />
              <span>Test Reminder Chime</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => testAlertSound('overdue')}
              className="gap-2 text-xs font-bold"
            >
              <Play className="size-3.5 text-danger" />
              <span>Test Overdue Alarm</span>
            </Button>
          </div>
        </div>

        {/* Lane Thresholds Configuration */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Pending / Paid Lane */}
          <div className="flex flex-col gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink uppercase tracking-wider">Pending Orders</span>
              <span className="rounded-none bg-status-pending-soft px-1.5 py-0.5 text-[10px] font-bold text-status-pending">
                Waiting Start
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Warning (Amber):</span>
                <span className="font-bold text-ink">{config.orderWarnPendingMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={config.orderWarnPendingMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderWarnPendingMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderWarnPendingMins', Number(e.target.value), 'Pending Warn Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Overdue (Red):</span>
                <span className="font-bold text-danger">{config.orderLatePendingMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={config.orderLatePendingMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderLatePendingMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderLatePendingMins', Number(e.target.value), 'Pending Overdue Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
          </div>

          {/* Preparing Lane */}
          <div className="flex flex-col gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink uppercase tracking-wider">Preparing Orders</span>
              <span className="rounded-none bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                Kitchen Cooking
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Warning (Amber):</span>
                <span className="font-bold text-ink">{config.orderWarnPreparingMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={config.orderWarnPreparingMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderWarnPreparingMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderWarnPreparingMins', Number(e.target.value), 'Preparing Warn Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Overdue (Red):</span>
                <span className="font-bold text-danger">{config.orderLatePreparingMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={config.orderLatePreparingMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderLatePreparingMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderLatePreparingMins', Number(e.target.value), 'Preparing Overdue Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
          </div>

          {/* Ready Lane */}
          <div className="flex flex-col gap-3 rounded-none border border-border bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink uppercase tracking-wider">Ready for Pickup</span>
              <span className="rounded-none bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                Counter Pickup
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Warning (Amber):</span>
                <span className="font-bold text-ink">{config.orderWarnReadyMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={config.orderWarnReadyMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderWarnReadyMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderWarnReadyMins', Number(e.target.value), 'Ready Warn Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-soft flex items-center justify-between">
                <span>Overdue (Red):</span>
                <span className="font-bold text-danger">{config.orderLateReadyMins}m</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={config.orderLateReadyMins}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, orderLateReadyMins: Number(e.target.value) }))
                }
                onBlur={(e) =>
                  updateSetting('orderLateReadyMins', Number(e.target.value), 'Ready Overdue Minutes')
                }
                className="h-9 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
              />
            </div>
          </div>
        </div>

        {/* Untouched Reminder Interval */}
        <div className="flex flex-col gap-2 rounded-none border border-border bg-surface-raised p-4 sm:max-w-md">
          <label className="text-xs font-bold text-ink flex items-center justify-between">
            <span>Untouched Order Reminder Interval:</span>
            <span className="font-mono text-accent">{config.orderReminderSeconds}s</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="15"
              max="600"
              step="15"
              value={config.orderReminderSeconds}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, orderReminderSeconds: Number(e.target.value) }))
              }
              onBlur={(e) =>
                updateSetting('orderReminderSeconds', Number(e.target.value), 'Reminder Interval')
              }
              className="h-9 w-28 rounded-none border border-border bg-surface px-3 font-mono text-xs font-bold text-ink"
            />
            <span className="text-xs text-ink-soft">seconds before repeating chime for untouched orders</span>
          </div>
        </div>
      </Card>

      {/* 6. Delivery Fee */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <div className="flex size-9 items-center justify-center rounded-none bg-accent/10 text-accent">
            <Truck className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-ink">Delivery Fee</h3>
            <p className="text-xs text-ink-soft">
              Delivery fee charged per order inside Arakawa buildings.
            </p>
          </div>
        </div>

        <div className="max-w-xs flex flex-col gap-2">
          <label className="text-xs font-bold text-ink">Delivery Fee ($)</label>
          <input
            type="number"
            step="0.25"
            min="0"
            value={config.deliveryFee}
            onChange={(e) => setConfig((prev) => ({ ...prev, deliveryFee: Number(e.target.value) }))}
            onBlur={(e) => updateSetting('deliveryFee', Number(e.target.value), 'Delivery Fee')}
            className="h-11 rounded-none border border-border bg-surface px-3 font-mono text-sm font-semibold text-ink focus:border-accent focus:outline-none"
          />
          <span className="text-[11px] text-ink-faint">0 = Free delivery for customers</span>
        </div>
      </Card>
    </div>
  );
}
