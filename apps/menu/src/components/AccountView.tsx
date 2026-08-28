import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, House, Storefront, CreditCard, Money } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';
import { AddressForm, AddressSummary } from './AddressForm';
import { isValidBuilding, isValidRoom, formatPhone, SHOP_UNIT, RESIDENCE_NAME } from '../utils/address';
import { useOnlinePaymentState } from '../utils/onlinePayment';
import { useStoreStatus, type SocialBadgeItem } from '../utils/storeStatus';
import {
  getDefaultPaymentMethod,
  setDefaultPaymentMethod,
  type PaymentMethod,
} from '../utils/paymentPrefs';
import {
  getTelegramDisplayUser,
  setDevUserId,
  getDevUserId,
  getWebLoginToken,
  clearWebLoginToken,
} from '../utils/telegramUser';

function renderMenuSocialIcon(id: string) {
  switch (id) {
    case 'telegram':
      return (
        <svg className="w-3.5 h-3.5 text-[#229ED9]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.05-.49-.83-.27-1.49-.42-1.43-.89.03-.25.38-.51 1.05-.78 4.12-1.79 6.87-2.97 8.26-3.55 3.93-1.63 4.74-1.92 5.27-1.93.12 0 .37.03.54.17.14.12.18.28.2.45-.02.07-.02.21-.05.37z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg className="w-3.5 h-3.5 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg className="w-3.5 h-3.5 text-[#E4405F]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg className="w-3.5 h-3.5 text-tg-text" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.4a6.33 6.33 0 0 0-.85-.06A6.34 6.34 0 0 0 3 15.68a6.34 6.34 0 0 0 10.82 4.47c1.7-1.7 1.86-4.3 1.86-6.42a8.27 8.27 0 0 0 5.08 1.74v-3.47a4.85 4.85 0 0 1-1.17-.31z" />
        </svg>
      );
    case 'maps':
      return (
        <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case 'phone':
      return (
        <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    default:
      return (
        <svg className="w-3.5 h-3.5 text-brand-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
  }
}

interface AccountViewProps {
  onBrowseMenu?: () => void;
}

export function AccountView({ onBrowseMenu }: AccountViewProps) {
  const { t } = useTranslation();
  const storeStatus = useStoreStatus();
  const khqrOffered = useOnlinePaymentState() === 'available';
  const [defaultMethod, setMethod] = useState<PaymentMethod>(() => getDefaultPaymentMethod());
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const tgUser = getTelegramDisplayUser();
  // A profile, address and phone number belong to one person. Without a
  // verified identity every guest would share the same row.
  const signedIn = hasIdentity();

  useEffect(() => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const userRes = await apiFetch(ME.profile());

        if (userRes.ok) setProfile(await userRes.json());
      } catch (err) {
        console.error('Failed to fetch account data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [signedIn]);

  useEffect(() => {
    if (!khqrOffered && defaultMethod === 'khqr') {
      setMethod('cash');
      setDefaultPaymentMethod('cash');
    }
  }, [khqrOffered, defaultMethod]);

  const handleChangeMethod = (method: PaymentMethod) => {
    setMethod(method);
    setDefaultPaymentMethod(method);
  };

  if (!signedIn) {
    return (
      <SignInPrompt
        what={t('signInForAccount', 'Open the shop from our Telegram bot to save your address, phone number and stamps.')}
        onBrowseMenu={onBrowseMenu}
      />
    );
  }

  if (loading) {
    return <div className="p-8 text-center text-tg-hint animate-pulse">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-center text-[#E53935]">Could not load profile.</div>;
  }

  const hasAddress = isValidBuilding(profile.building) && isValidRoom(profile.roomNumber);

  let activeSocials: SocialBadgeItem[] = [];
  if (storeStatus.shopSocialsEnabled !== false && storeStatus.shopSocialLinks) {
    try {
      const parsed =
        typeof storeStatus.shopSocialLinks === 'string'
          ? JSON.parse(storeStatus.shopSocialLinks)
          : storeStatus.shopSocialLinks;
      if (Array.isArray(parsed)) {
        activeSocials = parsed.filter((s: SocialBadgeItem) => s.enabled && s.url);
      }
    } catch {}
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      {/* Profile Card */}
      {(() => {
        const photoUrl = profile.photoUrl || tgUser?.photoUrl;
        const displayName =
          profile.contactName ||
          [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
          [tgUser?.firstName, tgUser?.lastName].filter(Boolean).join(' ') ||
          'Telegram User';
        const initial = (profile.contactName || profile.firstName || tgUser?.firstName || '')
          .trim()
          .charAt(0)
          .toUpperCase();

        return (
          <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex items-center gap-4">
            {photoUrl && !imgError ? (
              <img
                src={photoUrl}
                alt={displayName}
                onError={() => setImgError(true)}
                className="w-14 h-14 rounded-full object-cover border border-tg-hint/15 shadow-sm shrink-0"
              />
            ) : (
              <div className="w-14 h-14 bg-brand-primary/10 rounded-full flex items-center justify-center text-brand-primary font-bold text-xl shrink-0">
                {initial || <User size={28} weight="fill" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-tg-text truncate">{displayName}</h2>
              <p className="text-sm text-tg-hint font-medium truncate">
                {formatPhone(profile.phoneNumber) || t('noPhoneYet', 'No phone linked yet')}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Delivery address */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-tg-text flex items-center gap-1.5">
            <House size={16} weight="fill" className="text-brand-primary" />
            {t('deliveryAddress', 'Delivery address')}
          </h3>
          {hasAddress && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary"
            >
              {t('edit', 'Edit')}
            </button>
          )}
        </div>

        <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10">
          {editing ? (
            <AddressForm
              profile={profile}
              onSaved={(user) => { setProfile(user); setEditing(false); }}
              onCancel={hasAddress ? () => setEditing(false) : undefined}
            />
          ) : hasAddress ? (
            <AddressSummary profile={profile} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <p className="text-sm text-tg-hint">
                {t('noAddressYet', 'No delivery address yet. Add it so we can bring your order to your room.')}
              </p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white"
              >
                {t('addAddress', 'Add address')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Default payment method */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-tg-text flex items-center gap-1.5">
          <CreditCard size={16} weight="fill" className="text-brand-primary" />
          {t('defaultPaymentMethod', 'Default payment method')}
        </h3>
        <p className="text-xs text-tg-hint">
          {t('defaultPaymentHint', 'We pick this for you at checkout. You can still change it there.')}
        </p>

        <div className={`grid gap-3 pt-1 ${khqrOffered ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {([
            ...(khqrOffered
              ? [{ key: 'khqr' as const, label: t('khqr', 'KHQR'), Icon: CreditCard }]
              : []),
            { key: 'cash' as const, label: t('cash', 'Cash'), Icon: Money },
          ]).map(({ key, label, Icon }) => {
            const active = defaultMethod === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleChangeMethod(key)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-2 py-3.5 px-4 rounded-2xl border font-bold text-sm transition-all active:scale-95 ${
                  active
                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                    : 'bg-tg-secondary-bg border-tg-hint/10 text-tg-text'
                }`}
              >
                <Icon size={22} weight="fill" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Shop info & Social Badges */}
      <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex flex-col gap-3.5">
        <div className="flex items-start gap-3">
          <Storefront size={22} weight="fill" className="text-brand-primary mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-tg-text">
              {storeStatus.shopName || t('ourShop', 'Our shop')}
            </div>
            <div className="text-sm text-tg-hint">
              {storeStatus.shopAddress || t('shopAddress', `${SHOP_UNIT}, Ground Floor, ${RESIDENCE_NAME}`)}
            </div>
            <div className="mt-1 text-xs font-semibold text-brand-primary">
              {storeStatus.shopDeliveryNote || t('freeDeliveryInside', `Delivery inside ${RESIDENCE_NAME} is free`)}
            </div>
          </div>
        </div>

        {activeSocials.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-tg-hint/10">
            {activeSocials.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-tg-bg hover:bg-brand-primary/10 text-tg-text hover:text-brand-primary border border-tg-hint/15 transition-all shadow-xs active:scale-95"
              >
                {renderMenuSocialIcon(s.id)}
                <span>{s.label}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {import.meta.env.DEV && (getDevUserId() || getWebLoginToken()) && (
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setDevUserId(null);
              clearWebLoginToken();
              window.location.reload();
            }}
            className="text-xs text-tg-hint hover:text-brand-primary underline transition-colors"
          >
            🧪 Reset Dev User (Back to Guest)
          </button>
        </div>
      )}
    </div>
  );
}
