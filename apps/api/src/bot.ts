import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { adminTelegramIds } from './auth';

const prisma = new PrismaClient();

export const setupBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set in environment variables. Telegram bot features will be disabled.');
    return null;
  }

  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const menuUrl = process.env.WEBAPP_URL || 'https://menu.aichazhengdaarakawa.com';

    const user = await prisma.user.findUnique({ where: { telegramUserId: userId } });

    if (user && user.phoneNumber) {
      return ctx.reply(
        '👋 Welcome back to Ai-Cha & Zhengda Arakawa!\n\n' +
        '• Tap below to open the menu.\n' +
        '• To report or feedback, type <code>/report your message</code>.',
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 Open Menu', web_app: { url: menuUrl } }]
            ]
          }
        }
      );
    } else {
      return ctx.reply(
        'Welcome! To start ordering and earn loyalty points, please share your phone number.', 
        Markup.keyboard([
          Markup.button.contactRequest('📱 Share Phone Number')
        ]).resize().oneTime()
      );
    }
  });

  bot.command(['report', 'feedback'], async (ctx) => {
    const userId = ctx.from.id.toString();
    const rawText = ctx.message.text || '';
    const text = rawText.replace(/^\/(?:report|feedback)(?:@\w+)?\s*/i, '').trim();

    if (!text) {
      return ctx.reply(
        '📝 <b>Report an Issue or Feedback</b>\n\n' +
        'Please type <code>/report</code> followed by your message.\n\n' +
        '<b>Example:</b>\n' +
        '<code>/report Missing straw in my order</code>\n\n' +
        'Our manager and admin team will receive your report immediately.',
        { parse_mode: 'HTML' }
      );
    }

    try {
      const user = await prisma.user.findUnique({ where: { telegramUserId: userId } });
      const userName = [user?.firstName || ctx.from.first_name, user?.lastName || ctx.from.last_name]
        .filter(Boolean)
        .join(' ') || (ctx.from.username ? `@${ctx.from.username}` : 'Customer');
      const userPhone = user?.phoneNumber;

      await prisma.feedbackReport.create({
        data: {
          telegramUserId: userId,
          userName,
          userPhone: userPhone || null,
          message: text,
          status: 'new',
        },
      });

      // Send immediate alert to managers & admins
      const envAdmins = adminTelegramIds();
      let dbManagers: string[] = [];
      try {
        const managers = await prisma.staffAccount.findMany({
          where: { role: 'manager', isActive: true },
          select: { telegramUserId: true },
        });
        dbManagers = managers.map((m) => m.telegramUserId).filter((id): id is string => Boolean(id));
      } catch (err) {
        console.error('Error fetching manager accounts:', err);
      }

      const allManagerIds = Array.from(new Set([...envAdmins, ...dbManagers]));
      const alertText = `🚨 <b>New Customer Issue / Feedback Report</b>\n\n` +
        `<b>From:</b> ${userName} (ID: <code>${userId}</code>)\n` +
        `<b>Phone:</b> ${userPhone || 'Not provided'}\n\n` +
        `<b>Message:</b>\n${text}`;

      for (const managerId of allManagerIds) {
        if (managerId !== userId) {
          await sendTelegramNotification(managerId, alertText);
        }
      }

      await ctx.reply('✅ Thank you for your feedback! Our management team has received your report.');
    } catch (err) {
      console.error('Error saving feedback:', err);
      await ctx.reply('⚠️ Sorry, could not submit your report right now. Please try again later.');
    }
  });


  bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    const userId = ctx.from.id.toString();

    if (contact.user_id === ctx.from.id) {
      await prisma.user.upsert({
        where: { telegramUserId: userId },
        update: {
          phoneNumber: contact.phone_number,
          firstName: contact.first_name,
          lastName: contact.last_name,
        },
        create: {
          telegramUserId: userId,
          phoneNumber: contact.phone_number,
          firstName: contact.first_name,
          lastName: contact.last_name,
        }
      });

      await ctx.reply('Thank you! Your account is ready.', {
        reply_markup: { remove_keyboard: true }
      });
      await ctx.reply('Tap below to open the menu.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Menu', web_app: { url: process.env.WEBAPP_URL || 'https://example.com' } }]
          ]
        }
      });
    } else {
      await ctx.reply('Please share your own contact number using the button provided.');
    }
  });

  bot.launch().catch((err) => {
    console.error('Failed to launch Telegram bot:', err);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
};

export async function sendTelegramNotification(telegramUserId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || !telegramUserId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramUserId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Error sending Telegram notification:', err);
  }
}
