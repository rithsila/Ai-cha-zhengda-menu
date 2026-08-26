import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, House, Storefront, Sun, Moon, CreditCard, Money } from '@phosphor-icons/react';
import { apiFetch, hasIdentity, ME } from '../utils/api';
import { SignInPrompt } from './SignInPrompt';
import { AddressForm, AddressSummary } from './AddressForm';
import { isValidBuilding, isValidRoom, formatPhone, SHOP_UNIT, RESIDENCE_NAME } from '../utils/address';
import { useTheme } from '../hooks/useTelegramTheme';
import { useOnlinePaymentState } from '../utils/onlinePayment';
import {
  getDefaultPaymentMethod,
  setDefaultPaymentMethod,
  type PaymentMethod,
} from '../utils/paymentPrefs';
import { getTelegramDisplayUser } from '../utils/telegramUser';

interface AccountViewProps {
  onBrowseMenu?: () => void;
}

export function AccountView({ onBrowseMenu }: AccountViewProps) {
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useTheme();
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

        <div className="grid grid-cols-2 gap-3 pt-1">
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

      {/* Appearance / Theme Settings */}
      <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            {isDark ? <Moon size={22} weight="fill" /> : <Sun size={22} weight="fill" />}
          </div>
          <div>
            <div className="text-sm font-semibold text-tg-text">{t('appearance', 'Appearance')}</div>
            <div className="text-xs text-tg-hint font-medium">
              {isDark ? t('darkMode', 'Dark Mode') : t('lightMode', 'Light Mode')}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
            isDark ? 'bg-brand-primary' : 'bg-tg-hint/25'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
              isDark ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Shop info */}
      <div className="bg-tg-secondary-bg rounded-2xl p-5 shadow-sm border border-tg-hint/10 flex items-start gap-3">
        <Storefront size={20} weight="fill" className="text-brand-primary mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-tg-text">{t('ourShop', 'Our shop')}</div>
          <div className="text-sm text-tg-hint">
            {t('shopAddress', `${SHOP_UNIT}, Ground Floor, ${RESIDENCE_NAME}`)}
          </div>
          <div className="mt-1 text-xs font-semibold text-brand-primary">
            {t('freeDeliveryInside', `Delivery inside ${RESIDENCE_NAME} is free`)}
          </div>
        </div>
      </div>
    </div>
  );
}
