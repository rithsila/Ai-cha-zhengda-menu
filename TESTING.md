# Step-by-Step Testing Guide

Follow this guide to verify that all components of the Ai-Cha & Zhengda platform are working together correctly.

## Pre-requisites for Testing

1. Ensure all three services are running:
   - `apps/api` on port `4000`
   - `apps/staff` on port `5173`
   - `apps/menu` on port `5174` (or whatever secondary port Vite assigned)
2. Open a browser window to the **Menu App** (`http://localhost:5174`).
3. Open another browser window to the **Staff Dashboard** (`http://localhost:5173`). Keep them side-by-side if possible.

---

## Test Scenario 1: Ordering and Checkout

1. **Browse the Menu:** 
   - In the Menu App, verify you can see the Ai-Cha items.
   - Click the "Zhengda" tab and verify the items switch over.
2. **Add Modifiers:**
   - Click on an item that has options (e.g., a drink).
   - Select ice levels, sugar levels, and toppings.
   - Click "Add to Cart" and verify the price updates correctly based on toppings.
3. **Checkout via KHQR:**
   - Open the Cart and click Checkout.
   - Select **KHQR** as the payment method.
   - Click Confirm.
   - *Expected Behavior:* The UI should say "Processing...", simulate a 1.5-second wait (mocking the time it takes a user to scan and pay), and then show a Success screen with a generated Pickup Code (e.g., `A-123`).

## Test Scenario 2: Staff Dashboard Real-Time Updates

1. **Verify Order Appearance:**
   - Look at the Staff Dashboard window. Within 5 seconds of placing your order in Scenario 1, the new order should appear on the screen automatically (without you manually refreshing).
   - Verify the order details match what you selected (quantities, specific modifiers, KHQR payment method, and the Pickup Code).
2. **Update Order Status:**
   - Click the blue **"Start Preparing"** button on the new order.
   - *Expected Behavior:* The status badge changes to blue `PREPARING` and the button changes to a green "Ready for Pickup".
3. **Complete the Order:**
   - Click the green **"Ready for Pickup"** button.
   - *Expected Behavior:* The status badge changes to green `READY` and the button changes to "Mark Completed".
   - Click "Mark Completed" to finalize the order lifecycle.

## Test Scenario 3: Telegram Bot Integration

1. **Configure ngrok (or similar tunnel):**
   - Run `ngrok http 5174` to expose your local Menu App to the internet.
   - Copy the `https://...ngrok.app` URL.
2. **Update Environment:**
   - In `apps/api/.env`, set `WEBAPP_URL` to your ngrok URL.
   - Set `TELEGRAM_BOT_TOKEN` to a valid bot token from BotFather.
   - Restart the API server (`apps/api`).
3. **Interact with the Bot:**
   - Open Telegram and search for your bot.
   - Send the `/start` command.
   - *Expected Behavior:* The bot should reply with a welcome message and an inline button saying "Open Menu".
   - Click "Open Menu" and verify that it opens your local Menu App inside the Telegram Web App container.
