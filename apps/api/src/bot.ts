import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';

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
    const user = await prisma.user.findUnique({ where: { telegramUserId: userId } });

    if (user && user.phoneNumber) {
      return ctx.reply('Welcome back to Ai-Cha & Zhengda! Tap below to order.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Menu', web_app: { url: process.env.WEBAPP_URL || 'https://example.com' } }]
          ]
        }
      });
    } else {
      return ctx.reply('Welcome! To start ordering and earn loyalty points, please share your phone number.', 
        Markup.keyboard([
          Markup.button.contactRequest('📱 Share Phone Number')
        ]).resize().oneTime()
      );
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
