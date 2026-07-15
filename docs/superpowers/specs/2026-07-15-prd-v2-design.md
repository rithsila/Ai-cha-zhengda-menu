# PRD v2: User Accounts, Delivery Location & ABA PayWay Integration

This document outlines the design and product requirements for version 2 of the Ai-Cha & Zhengda Telegram Mini App.

## 1. Authentication & User Profiles (Bot-First Gate)

**Goal:** Ensure every user has a verified phone number tied to their Telegram ID to facilitate reliable delivery and loyalty tracking.

- **Data Flow:** 
  - When a new user types `/start` or interacts with the Telegram bot, the bot will respond with a custom keyboard button requesting them to "Share Contact".
  - The user *must* share their contact to proceed.
- **Storage & State:**
  - Upon sharing, the backend captures the phone number and links it to their Telegram User ID.
  - A persistent User Profile is created in the database.
- **Access Control:** 
  - The "Open Menu" (Mini App) button is only revealed *after* the phone number has been successfully captured.

## 2. Navigation & UI: The Dock (3-Tab Layout)

**Goal:** Provide quick access to the new user account features without cluttering the interface.

The bottom dock navigation bar will be updated from 2 tabs to 3 tabs:
1. **Menu:** The default view. Browse categories, select items, and add to cart.
2. **Orders:** View active order status (live tracking) and historical orders.
3. **Account:** A new tab dedicated to the user's profile.
   - Displays the linked phone number.
   - Manages saved delivery addresses.
   - Displays loyalty points/status.

## 3. Delivery & Location Tracking (In-App GPS + Map)

**Goal:** Capture accurate delivery coordinates with minimal friction.

- **UI Flow:** 
  - During Checkout, if the user selects the "Delivery" order type, the app will trigger the browser's HTML5 Geolocation API to fetch their current coordinates.
- **Map Interface:** 
  - A lightweight map component (e.g., Leaflet/OSM) will be displayed inline.
  - The map will center on their detected coordinates. The user can drag a pin to adjust the exact drop-off location.
- **Data Capture:** 
  - The final latitude and longitude, along with an optional text field for "Building/Floor/Instructions", will be saved to the order details.

## 4. Payment Integration (ABA PayWay Hybrid)

**Goal:** Implement real payment processing using the `aba-payway-unofficial` SDK, prioritizing a seamless app-to-app experience.

- **Checkout UI:** 
  - The checkout screen will feature a primary **"Pay with ABA"** button.
- **Primary Flow (Deep-Link):** 
  - Tapping the primary button generates a checkout URL that deep-links directly into the ABA Mobile App. After payment, the user is redirected back to the Telegram Mini App.
- **Fallback Flow (KHQR):** 
  - A secondary option to **"Show KHQR"** will be available.
  - Tapping this uses the SDK to generate and display a dynamic KHQR image. The user can download or screenshot this image to upload into any local banking app.
- **Verification:** 
  - The backend will implement a secure webhook endpoint to receive server-to-server payment confirmations from ABA PayWay.
  - Upon receiving the webhook, the backend will automatically update the order status to "Paid" and alert the staff dashboard.

## 5. Staff Authentication (Dashboard)

**Goal:** Secure the staff tablet dashboard from unauthorized access while maintaining speed for busy point-of-sale environments.

- **Mechanism:** A shared, store-wide 4-digit or 6-digit PIN code.
- **UI Flow:** When opening `apps/staff`, the user is presented with a numpad lock screen. Entering the correct PIN grants access to the active orders dashboard. 
- **Session:** The session persists locally but may require re-entry after a period of inactivity (e.g., end of shift) to maintain security.

## 6. External Web Browser Support

**Goal:** Allow users who click the menu link outside of Telegram (e.g., in Safari or Chrome) to still access their account and place orders seamlessly.

- **Mechanism:** Telegram Login Widget.
- **UI Flow:** If the Mini App detects it is running outside of the Telegram environment (no `initData`), it presents a "Log in with Telegram" button on the landing page.
- **Data:** This uses Telegram's official web authentication flow. Once authorized, it passes the user's Telegram ID back to our app, seamlessly logging them into their existing account, retaining their verified phone number, cart, and order history.
