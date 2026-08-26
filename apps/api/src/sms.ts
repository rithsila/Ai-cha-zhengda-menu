/**
 * Plasgate SMS & OTP Delivery Service
 *
 * Official Documentation: https://cloud.plasgate.com/support/rest
 * Endpoint: POST https://cloudapi.plasgate.com/rest/send?private_key=YOUR_PRIVATE_KEY
 * Headers:
 *   - X-Secret: YOUR_SECRET_KEY
 *   - Content-Type: application/json
 * Body:
 *   {
 *     "sender": "SMS Info",
 *     "to": "85570433443",
 *     "content": "[Ai-Cha & Zhengda] Your Staff Portal login code is: 123456. Valid for 5 minutes."
 *   }
 */

export interface SendSmsResult {
  success: boolean;
  provider?: string;
  messageId?: string;
  error?: string;
}

export async function sendOtpSms(
  toPhone: string,
  code: string,
  telegramUserId?: string | null
): Promise<SendSmsResult> {
  const messageBody = `[Ai-Cha & Zhengda] Your Staff Portal login code is: ${code}. Valid for 5 minutes. Do not share this code.`;

  // Format destination phone number to standard Cambodian format without "+" (e.g. 85570433443)
  let rawDigits = toPhone.replace(/\D/g, '');
  if (rawDigits.startsWith('0')) {
    rawDigits = `855${rawDigits.slice(1)}`;
  } else if (!rawDigits.startsWith('855') && rawDigits.length <= 10) {
    rawDigits = `855${rawDigits}`;
  }

  // -------------------------------------------------------------------------
  // 1. Plasgate SMS Gateway (Cambodia & Singapore)
  // -------------------------------------------------------------------------
  const privateKey = process.env.PLASGATE_PRIVATE_KEY?.trim() || process.env.PLASGATE_API_KEY?.trim();
  const secretKey = process.env.PLASGATE_SECRET_KEY?.trim() || process.env.PLASGATE_SECRET?.trim();
  const senderName = process.env.PLASGATE_SENDER_NAME?.trim() || 'SMS Info';

  if (privateKey) {
    try {
      const url = `https://cloudapi.plasgate.com/rest/send?private_key=${encodeURIComponent(privateKey)}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (secretKey) {
        headers['X-Secret'] = secretKey;
      }

      const payload = {
        sender: senderName,
        to: rawDigits,
        content: messageBody,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as any;

      if (response.ok && (data.status === 'success' || data.code === 200 || !data.error)) {
        return {
          success: true,
          provider: 'plasgate',
          messageId: data.id || data.message_id || `plasgate-${Date.now()}`,
        };
      }

      console.warn('[SMS-PLASGATE-WARN] Response:', data);
      // If Plasgate returned an error, capture it
      if (data.error || data.message) {
        return {
          success: false,
          error: data.message || data.error || 'Plasgate SMS delivery failed.',
        };
      }
    } catch (err: any) {
      console.error('[SMS-PLASGATE-ERROR]', err.message);
      return {
        success: false,
        error: `Network error sending SMS via Plasgate: ${err.message}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // 2. Telegram Bot Direct Push (Free fallback if staff has linked Telegram)
  // -------------------------------------------------------------------------
  if (telegramUserId) {
    try {
      const { sendTelegramNotification } = await import('./bot');
      await sendTelegramNotification(
        telegramUserId,
        `🔐 <b>Staff Portal Login Verification</b>\n\nYour 6-digit OTP code is: <code>${code}</code>\n\n<i>Valid for 5 minutes. Do not share with anyone.</i>`
      );
      return { success: true, provider: 'telegram_bot', messageId: `tg-${Date.now()}` };
    } catch (tgErr) {
      console.error('[SMS-TELEGRAM-ERROR]', tgErr);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Local Development Console Fallback
  // -------------------------------------------------------------------------
  console.log(`\n========================================`);
  console.log(`[SMS-DEV-OTP] To Phone: ${rawDigits} (${toPhone})`);
  if (telegramUserId) console.log(`[SMS-DEV-OTP] Telegram ID: ${telegramUserId}`);
  console.log(`[SMS-DEV-OTP] 6-Digit Code: ${code}`);
  console.log(`[SMS-DEV-OTP] Message: ${messageBody}`);
  console.log(`========================================\n`);

  return { success: true, provider: 'dev_console', messageId: `dev-${Date.now()}` };
}
