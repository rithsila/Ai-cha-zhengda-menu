import { useTranslation } from 'react-i18next';
import { PaperPlaneTilt } from '@phosphor-icons/react';

interface SignInPromptProps {
  /** What this tab needs an account for, e.g. "your orders". */
  what?: string;
  /** Sends a guest back to the menu, so the screen is never a dead end. */
  onBrowseMenu?: () => void;
}

/**
 * Shown instead of a personal tab when nobody is signed in.
 *
 * The app used to invent a shared id here, which quietly filed every guest's
 * order, address and points under one account. Saying "open from Telegram" is
 * the honest answer, and ordering for pickup with cash still works without it.
 */
export function SignInPrompt({ what, onBrowseMenu }: SignInPromptProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-3 text-center px-6 py-12 w-full max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
        <PaperPlaneTilt size={26} weight="fill" />
      </div>
      <h2 className="text-lg font-bold text-tg-text">
        {t('signInRequiredTitle', 'Open from Telegram')}
      </h2>
      <p className="text-sm text-tg-hint">
        {what ||
          t(
            'signInRequiredBody',
            'Open the shop from our Telegram bot to see your orders, points and saved address.'
          )}
      </p>
      <p className="text-xs text-tg-hint">
        {t('guestBrowseNote', 'You can still browse the menu and order for pickup with cash.')}
      </p>
      {onBrowseMenu && (
        <button
          type="button"
          onClick={onBrowseMenu}
          className="mt-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-bold text-white active:scale-95 transition-transform"
        >
          {t('browseMenu', 'Browse Menu')}
        </button>
      )}
    </div>
  );
}
