import crypto from 'crypto';

/**
 * Customer identity for tests.
 *
 * Customer routes no longer believe a telegram id in a URL or a body: the
 * caller has to prove who they are. These helpers build that proof.
 *
 * `asCustomer()` picks whichever proof works for the current environment:
 *  - a bot token is set  -> a properly signed Mini App initData string,
 *  - no bot token        -> the development `X-Telegram-User-Id` header
 *                           (the test script sets ALLOW_UNVERIFIED_TELEGRAM=1).
 */

/** Build a Mini App initData string signed with `botToken`. */
export function signInitData(
  telegramUserId: string,
  botToken: string,
  opts: { authDate?: number; firstName?: string } = {}
): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(opts.authDate ?? Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: telegramUserId, first_name: opts.firstName ?? 'Test' }));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

/** Headers that identify a request as coming from this customer. */
export function asCustomer(telegramUserId: string): Record<string, string> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) return { 'X-Telegram-Init-Data': signInitData(telegramUserId, botToken) };
  return { 'X-Telegram-User-Id': telegramUserId };
}
