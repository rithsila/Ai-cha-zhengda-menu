# Authentication & User Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Bot-First Gate" for capturing user phone numbers, a secure Staff PIN lock screen, and a Telegram Login Widget for external web browser access.

**Architecture:** 
The backend database will be expanded to store user phone numbers and usernames. The Telegram Bot will be updated to use a `keyboard` to request contacts before revealing the Mini App link. The staff dashboard will get a simple React PIN screen. The menu app will detect non-Telegram environments and render the official Telegram Login Widget to authenticate external users.

**Tech Stack:** Node.js, Express, Prisma, SQLite, Telegraf, React, Vite.

## Global Constraints
- Must use existing Node (v18+) and npm monorepo setup.
- Staff PIN can be a hardcoded environment variable initially.
- The Telegram Login Widget must fallback cleanly if the Telegram API script fails to load.

---

### Task 1: Update Database Schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma:10-14`

**Interfaces:**
- Produces: `User` model with `phoneNumber` and `username` fields.

- [ ] **Step 1: Modify Prisma Schema**

```prisma
model User {
  telegramUserId String  @id
  phoneNumber    String?
  username       String?
  firstName      String?
  lastName       String?
  loyaltyPoints  Int     @default(0)
  orders         Order[]
}
```

- [ ] **Step 2: Generate and Push DB changes**

Run: `cd apps/api && npx prisma generate && npx prisma db push`
Expected: Prisma successfully syncs the SQLite database.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add contact fields to User model"
```

### Task 2: Bot-First Gate (Contact Collection)

**Files:**
- Modify: `apps/api/src/bot.ts`

**Interfaces:**
- Consumes: Updated Prisma `User` model.
- Produces: A Telegram bot flow that requires contact sharing before showing the WebApp button.

- [ ] **Step 1: Import Prisma and update bot start logic**

```typescript
import { Telegraf, Markup } from 'telegraf';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const setupBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set in environment variables.');
    return null;
  }

  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = await prisma.user.findUnique({ where: { telegramUserId: userId } });

    if (user && user.phoneNumber) {
      // User is already registered
      return ctx.reply('Welcome back to Ai-Cha & Zhengda! Tap below to order.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Open Menu', web_app: { url: process.env.WEBAPP_URL || 'https://example.com' } }]
          ]
        }
      });
    } else {
      // Request contact
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

    // Verify the contact belongs to the user
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

      // Remove keyboard and show WebApp button
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

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/bot.ts
git commit -m "feat(api): implement bot-first gate for phone number collection"
```

### Task 3: Staff Dashboard PIN Lock

**Files:**
- Modify: `apps/staff/src/App.tsx`
- Modify: `apps/staff/.env` (implicitly consumed as VITE_STAFF_PIN)

**Interfaces:**
- Produces: A secured staff dashboard requiring a PIN.

- [ ] **Step 1: Create StaffLogin component inside App.tsx**

```tsx
// Inside apps/staff/src/App.tsx, add above the App component:
import { useState } from 'react';

const StaffLogin = ({ onLogin }: { onLogin: () => void }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  
  const expectedPin = import.meta.env.VITE_STAFF_PIN || '1234';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === expectedPin) {
      onLogin();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow-md w-80 text-center">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Staff Access</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-3xl tracking-widest p-4 border-2 rounded-lg mb-4 bg-gray-50 focus:border-blue-500 focus:outline-none"
            placeholder="****"
            autoFocus
          />
          {error && <p className="text-red-500 mb-4 text-sm">Incorrect PIN</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wrap existing App component**

```tsx
// Modify the default export App to use the login component:
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <StaffLogin onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    // ... Existing App JSX content goes here ...
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/staff/src/App.tsx
git commit -m "feat(staff): add PIN lock screen to staff dashboard"
```

### Task 4: External Web Browser Support (Telegram Widget)

**Files:**
- Modify: `apps/menu/src/App.tsx`
- Modify: `apps/menu/index.html`

**Interfaces:**
- Consumes: Telegram's `window.Telegram.WebApp` API.
- Produces: Fallback login widget when `initData` is empty.

- [ ] **Step 1: Add Telegram Widget Script placeholder in index.html**

```html
<!-- In apps/menu/index.html, before closing </body> -->
<script async src="https://telegram.org/js/telegram-widget.js?22"></script>
```

- [ ] **Step 2: Implement WebLogin component in App.tsx**

```tsx
// Inside apps/menu/src/App.tsx, add above the App component:

const WebLogin = () => {
  const botName = import.meta.env.VITE_BOT_NAME || 'YourBotUsername'; // Need to set this in env

  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-gray-50 p-6 text-center">
      <div className="bg-white p-8 rounded-2xl shadow-sm max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome</h1>
        <p className="text-gray-500 mb-8">Please log in with Telegram to access the menu from your browser.</p>
        
        {/* Telegram Widget Container */}
        <div 
          id="telegram-login-widget" 
          className="flex justify-center min-h-[40px]"
          ref={(el) => {
            if (el && !el.hasChildNodes()) {
              const script = document.createElement('script');
              script.src = "https://telegram.org/js/telegram-widget.js?22";
              script.setAttribute('data-telegram-login', botName);
              script.setAttribute('data-size', 'large');
              script.setAttribute('data-auth-url', `${import.meta.env.VITE_API_URL}/api/auth/telegram/callback`);
              script.setAttribute('data-request-access', 'write');
              el.appendChild(script);
            }
          }}
        ></div>
        
        <p className="text-xs text-gray-400 mt-6 mt-4">
          Or open this link directly inside the Telegram app.
        </p>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: Wrap Main App logic to check for initData**

```tsx
// Inside App() function in App.tsx:

function App() {
  // Assuming there is some initialization logic:
  const isTelegramWebApp = window.Telegram?.WebApp?.initData !== '';

  if (!isTelegramWebApp) {
    return <WebLogin />;
  }

  return (
    // ... Existing App JSX content ...
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/menu/index.html apps/menu/src/App.tsx
git commit -m "feat(menu): add telegram web login widget fallback"
```
