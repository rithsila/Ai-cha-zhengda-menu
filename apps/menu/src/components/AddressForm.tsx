import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaperPlaneTilt, Pencil } from '@phosphor-icons/react';
import { Button } from './ui/Button';
import { API_BASE } from '../utils/api';
import { getTelegramUserId } from '../utils/telegramUser';
import { requestPhoneFromTelegram, pollForPhone } from '../utils/telegramPhone';
import {
  BUILDINGS, isValidBuilding, isValidRoom, isValidName, isValidPhone,
  floorFromRoom, unitFromRoom, formatUnitCode, formatPhone, RESIDENCE_NAME,
} from '../utils/address';

interface AddressFormProps {
  profile: any;
  onSaved: (user: any) => void;
  onCancel?: () => void;
}

/**
 * The one place the customer types their Arakawa address. Used by the Account
 * tab and by the delivery step of checkout, so both stay identical.
 */
export function AddressForm({ profile, onSaved, onCancel }: AddressFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState<string>(profile?.contactName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || '');
  const [phone, setPhone] = useState<string>(profile?.phoneNumber || '');
  const [building, setBuilding] = useState<string>(profile?.building || '');
  const [room, setRoom] = useState<string>(profile?.roomNumber || '');
  const [manualPhone, setManualPhone] = useState(!!profile?.phoneNumber);
  const [askingPhone, setAskingPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomTouched = room.length > 0;
  const roomOk = isValidRoom(room);
  const canSave = isValidName(name) && isValidPhone(phone) && isValidBuilding(building) && roomOk;

  const handleTelegramPhone = async () => {
    setError(null);
    setAskingPhone(true);
    const result = await requestPhoneFromTelegram();
    if (result === 'sent') {
      const userId = getTelegramUserId();
      const found = userId ? await pollForPhone(userId) : null;
      if (found) {
        setPhone(found);
        setAskingPhone(false);
        return;
      }
    }
    // Denied, unsupported, or the number never arrived — let them type it.
    setManualPhone(true);
    setAskingPhone(false);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      const userId = getTelegramUserId() || 'test-user-id';
      const res = await fetch(`${API_BASE}/api/user/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName: name, phoneNumber: phone, building, roomNumber: room }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || t('addressSaveFailed', 'Could not save. Please try again.'));
        return;
      }
      onSaved(data);
    } catch {
      setError(t('addressSaveFailed', 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Name */}
      <div className="space-y-1.5">
        <label htmlFor="addr-name" className="text-sm font-semibold text-tg-text">
          {t('contactName', 'Name')}
        </label>
        <input
          id="addr-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('contactNamePlaceholder', 'Who should we ask for?')}
          className="w-full bg-tg-secondary-bg border border-tg-hint/15 rounded-2xl px-4 py-3 text-sm text-tg-text focus:outline-none focus:border-brand-primary"
        />
      </div>

      {/* Phone */}
      <div className="space-y-1.5">
        <label htmlFor="addr-phone" className="text-sm font-semibold text-tg-text">
          {t('phoneNumber', 'Phone number')}
        </label>
        {manualPhone ? (
          <input
            id="addr-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+855 12 345 678"
            className="w-full bg-tg-secondary-bg border border-tg-hint/15 rounded-2xl px-4 py-3 text-sm text-tg-text focus:outline-none focus:border-brand-primary"
          />
        ) : (
          <button
            type="button"
            onClick={handleTelegramPhone}
            disabled={askingPhone}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 px-4 py-3 text-sm font-bold text-brand-primary disabled:opacity-60"
          >
            <PaperPlaneTilt size={18} weight="fill" />
            {askingPhone ? t('asking', 'Asking Telegram...') : t('useTelegramPhone', 'Use my Telegram number')}
          </button>
        )}
        {manualPhone ? (
          <p className="text-xs text-tg-hint">{t('phoneManualHint', 'Type the number we can call when we arrive.')}</p>
        ) : (
          <button
            type="button"
            onClick={() => setManualPhone(true)}
            className="flex items-center gap-1 text-xs font-semibold text-tg-hint"
          >
            <Pencil size={14} /> {t('typePhoneInstead', 'Type it myself instead')}
          </button>
        )}
      </div>

      {/* Building */}
      <div className="space-y-1.5">
        <span className="text-sm font-semibold text-tg-text">{t('building', 'Building')}</span>
        <div className="flex flex-wrap gap-2">
          {BUILDINGS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBuilding(b)}
              aria-pressed={building === b}
              className={`w-11 h-11 rounded-xl border text-sm font-bold transition-all ${
                building === b
                  ? 'bg-brand-primary/10 border-brand-primary/40 text-brand-primary'
                  : 'bg-tg-secondary-bg border-tg-hint/15 text-tg-text'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Room */}
      <div className="space-y-1.5">
        <label htmlFor="addr-room" className="text-sm font-semibold text-tg-text">
          {t('roomNumber', 'Room number')}
        </label>
        <input
          id="addr-room"
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={room}
          onChange={(e) => setRoom(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="1110"
          className="w-full bg-tg-secondary-bg border border-tg-hint/15 rounded-2xl px-4 py-3 text-sm tracking-[0.3em] text-tg-text focus:outline-none focus:border-brand-primary"
        />
        {roomTouched && roomOk ? (
          <p className="text-xs font-semibold text-brand-primary">
            {t('floor', 'Floor')} {floorFromRoom(room)} · {t('room', 'Room')} {String(unitFromRoom(room)).padStart(2, '0')}
            {building ? ` · ${building}${room}` : ''}
          </p>
        ) : (
          <p className={`text-xs ${roomTouched ? 'text-[#E53935]' : 'text-tg-hint'}`}>
            {t('roomHint', '4 digits. First 2 are the floor (1 to 22). Example: 1110 = floor 11, room 10.')}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-[#E53935]">{error}</p>}

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" fullWidth onClick={onCancel} type="button">
            {t('cancel', 'Cancel')}
          </Button>
        )}
        <Button fullWidth onClick={handleSave} disabled={!canSave || saving} type="button">
          {saving ? t('saving', 'Saving...') : t('saveAddress', 'Save address')}
        </Button>
      </div>
    </div>
  );
}

interface AddressSummaryProps {
  profile: any;
  onEdit?: () => void;
  compact?: boolean;
}

/** Read-only view of a saved address. Shared by the Account tab and checkout. */
export function AddressSummary({ profile, onEdit, compact }: AddressSummaryProps) {
  const { t } = useTranslation();
  const building = profile?.building || '';
  const room = profile?.roomNumber || '';
  const complete = isValidBuilding(building) && isValidRoom(room);

  if (!complete) return null;

  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className={`font-bold text-tg-text ${compact ? 'text-lg' : 'text-2xl'}`}>
          {formatUnitCode(building, room)}
        </div>
        <div className="text-sm text-tg-hint">
          {t('building', 'Building')} {building} · {t('floor', 'Floor')} {floorFromRoom(room)} · {t('room', 'Room')}{' '}
          {String(unitFromRoom(room)).padStart(2, '0')}
        </div>
        <div className="text-sm text-tg-hint">{RESIDENCE_NAME}</div>
        {(profile?.contactName || profile?.phoneNumber) && (
          <div className="mt-1 text-sm text-tg-text">
            {[profile?.contactName, formatPhone(profile?.phoneNumber)].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-bold text-brand-primary"
        >
          {t('change', 'Change')}
        </button>
      )}
    </div>
  );
}
