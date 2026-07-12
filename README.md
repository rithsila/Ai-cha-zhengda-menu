# Ai-Cha & Zhengda Monorepo

This repository contains the full stack for the **Ai-Cha & Zhengda** Telegram Mini App platform, including the customer-facing menu, staff dashboard, and backend API.

## Project Structure

This project uses a monorepo structure with three primary applications located in the `/apps` directory:

- **`apps/menu`**: The Telegram Mini App frontend (React + Vite). This is what customers see when they open the bot in Telegram. It allows browsing the dual-brand menu, customizing items, and checking out.
- **`apps/staff`**: The Staff Tablet Web Dashboard (React + Vite). This is a separate web application used by staff in the shop to monitor incoming orders in real-time and update their status (`Pending` -> `Preparing` -> `Ready`).
- **`apps/api`**: The backend API (Express + Prisma + SQLite). It handles the product catalog, order management, mock KHQR generation, and the Telegram Bot interactions.

## Prerequisites

- Node.js (v18+)
- npm

## Installation & Setup

1. **Install dependencies** for all workspaces from the root directory:
   ```bash
   npm install
   ```

2. **Set up the Database** in the API app:
   ```bash
   cd apps/api
   npx prisma generate
   npx prisma db push
   # Optional: run seed script if you have one
   npx ts-node src/seed.ts 
   ```

3. **Environment Variables**:
   Create a `.env` file inside `apps/api` and add your Telegram Bot Token:
   ```env
   # apps/api/.env
   DATABASE_URL="file:./dev.db"
   TELEGRAM_BOT_TOKEN="your_telegram_bot_token_here"
   WEBAPP_URL="https://your-ngrok-url.app" # The URL where apps/menu is hosted
   ```

## Running the Platform Locally

To run the full stack locally, you need to start all three applications. Open three separate terminal windows or use a process manager.

**1. Start the API:**
```bash
cd apps/api
npm run dev
# Server runs on http://localhost:4000
```

**2. Start the Staff Dashboard:**
```bash
cd apps/staff
npm run dev
# Vite runs on http://localhost:5173
```

**3. Start the Customer Menu (Mini App):**
```bash
cd apps/menu
npm run dev
# Vite runs on http://localhost:5174
```

## Features

- **Dual-Brand UI**: Seamlessly switch between Ai-Cha and Zhengda menus.
- **Cart & Modifiers**: Complex modifier logic (ice level, sugar, toppings).
- **KHQR Mock**: Built-in simulated KHQR generation and payment delay for testing.
- **Live Order Dashboard**: Staff view that polls for new orders every 5 seconds.
- **Telegram Bot**: Integrated Telegram Bot to serve the Mini App directly to users.
