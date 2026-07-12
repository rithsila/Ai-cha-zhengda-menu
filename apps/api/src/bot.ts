import { Telegraf } from 'telegraf';

export const setupBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set in environment variables. Telegram bot features will be disabled.');
    return null;
  }

  const bot = new Telegraf(token);

  bot.start((ctx) => {
    ctx.reply('Welcome to Ai-Cha & Zhengda! Tap the button below to open the menu.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open Menu', web_app: { url: process.env.WEBAPP_URL || 'https://example.com' } }]
        ]
      }
    });
  });

  bot.launch().catch((err) => {
    console.error('Failed to launch Telegram bot:', err);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
};
