import twa from '@twa-dev/sdk';
import { apiFetch, ME } from './api';

const WebApp = (twa as any)?.WebApp || twa || {};

export type PhoneRequestResult = 'sent' | 'cancelled' | 'unsupported';

/**
 * Ask Telegram for the user's phone number.
 *
 * Telegram shows its own "Share phone number?" popup. When the user agrees it
 * sends the contact to the **bot**, not to this page — `bot.ts` (`on('contact')`)
 * is what writes it to the User row. So a 'sent' result means "ask the API for
 * the number in a moment", which is what `pollForPhone` below does.
 *
 * `requestContact` is missing from the bundled SDK types, so it is called
 * defensively — the same style used for WebApp elsewhere in this app.
 */
export function requestPhoneFromTelegram(): Promise<PhoneRequestResult> {
  const request = (WebApp as any)?.requestContact;
  const supported =
    typeof request === 'function' &&
    (typeof WebApp?.isVersionAtLeast !== 'function' || WebApp.isVersionAtLeast('6.9'));

  if (!supported) return Promise.resolve('unsupported');

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: PhoneRequestResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    // Safety net: if Telegram never calls back, fall through to manual input
    // instead of leaving the button spinning forever.
    const timer = setTimeout(() => finish('cancelled'), 60_000);

    try {
      request.call(WebApp, (ok: boolean) => {
        clearTimeout(timer);
        finish(ok ? 'sent' : 'cancelled');
      });
    } catch {
      clearTimeout(timer);
      finish('unsupported');
    }
  });
}

/**
 * After a 'sent' result the bot needs a moment to store the number, so re-read
 * the profile a few times. Returns the phone number, or null if it never arrived.
 */
export async function pollForPhone(tries = 5, delayMs = 1000): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await apiFetch(ME.profile());
      if (res.ok) {
        const user = await res.json();
        if (user?.phoneNumber) return user.phoneNumber as string;
      }
    } catch {
      // network hiccup — try again on the next loop
    }
  }
  return null;
}
