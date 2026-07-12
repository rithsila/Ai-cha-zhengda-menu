# Ai-Cha & Zhengda Telegram Mini App PRD

## 1. Menu Data Model

The application will support a dual-brand menu structure, split into two main sections (tabs) in the UI: **Ai-Cha (Drinks & Ice Cream)** and **Zhengda (Chicken Steak)**. 

### Brand 1: Ai-Cha (Drinks & Ice Cream)
**Categories:**
- Ai-Scream Cone Series (e.g., Sea Salt, Matcha, Chocolate, Vanilla)
- Ai-Frappe Series (e.g., Blueberry, Passion, Strawberry, Grape)
- Coffee Series (e.g., Americano, Latte, Cappuccino)
- Fresh Ice Cream (Sundae/Shake)
- Milk Tea & Original Tea Series
- Real Fruit Tea Series

**Modifiers & Options:**
- **Temperature & Size (Cup Type):** Hot (400ml), Cold M (500ml), Cold L (700ml), Bucket (1000ml).
- **Toppings (Multi-select, +$0.25 each):** Boba Pearl, Coconut Jelly, Oats, Oolong Tea Jelly, Brown Sugar Jelly, Red Bean. *(Note: Certain drinks may have rules where toppings are included vs. charged extra).*
- **Ice Level:** No Ice, Less Ice, Normal Ice, More Ice.
- **Sugar Level:** 0%, 25%, 50%, 75%, 100%.

### Brand 2: Zhengda Chicken Steak
**Categories:**
- Signature Chicken (Crispy Chicken Breast, Boneless Thigh)
- Snacks & Skewers (Popcorn, Skewers, Wings, Drumsticks, Strips, Nuggets)
- Combos (e.g., 4 of a Kind)
- Rice Bowls (e.g., Popcorn Ricebowl, Signature Crispy Ricebowl)
- Sides & Beverages (Fries, Rice, Coke, Water)

**Modifiers & Options:**
- **Flavor Powder (Single-select):** Signature, Mala, Plum, Cumin.
- **Signature Sauce (Single-select):** Sweet & Chili, Mala, Blackpepper.

---

## 2. Architecture & Tech Stack

**Four Core Pieces:**
1. **Frontend Mini App:** The web UI running inside Telegram (React + Vite + Tailwind + `@twa-dev/sdk`).
2. **Backend API + DB:** Handles product catalog, cart validation, and order processing (FastAPI/Python or NestJS/Node + PostgreSQL + Redis).
3. **Telegram Bot:** Entry point and customer notification layer.
4. **Staff Web Dashboard:** A web app running on a tablet in the shop for staff to manage incoming orders, update status (Preparing → Ready), and potentially manage stock (sold-out toggles).

**Security Non-negotiables:**
- Validate Telegram's `initData` signature on the backend to authenticate the user.
- Confirm payment via server-side webhook (e.g., ABA PayWay webhook)—never trust client-side payment success.

---

## 3. Phased Implementation Plan

**Phase 0 — Setup & Architecture:** *(Completed)*
- [x] Configure BotFather bot.
- [x] Set up ABA PayWay / KHQR integration.
- [x] Initialize React + Vite frontend and set up the design system (Tailwind, Telegram Theme syncing).

**Phase 1 — MVP (Pickup & Dual-Menu):** *(Completed)*
- [x] **UI:** Two main tabs for Ai-Cha and Zhengda.
- [x] **Flow:** Browse menu → Build item with modifiers (sizes/toppings/flavors) → Cart → Checkout via KHQR/Cash → Receive pickup code.
- [x] **Languages:** English, Khmer, and Chinese.
- [x] **Staff Ops:** New orders appear on the Staff Tablet Web Dashboard and trigger notifications.

*(See `README.md`, `TESTING.md`, and `INFRA.md` for full documentation on Phase 0 and 1)*

**Phase 2 — Order Tracking & Expansion:** *(Completed)*
- [x] Live order status for the customer (Preparing → Ready for Pickup).
- [x] Order history and one-tap reordering.
- [x] Admin dashboard to toggle items as "Sold Out".

**Phase 3 — Delivery & Loyalty:** *(Completed)*
- [x] Add "Delivery" as an `order_type` alongside "Pickup".
- [x] Loyalty points and promotional discounts.
- [x] Multi-branch support.

---

## 4. Unresolved Questions / Future Rules
- **Topping Rules:** Finalize which specific drinks include toppings by default vs. charging per topping (to be adjusted in the database later).
- **Images:** Initial images will be pulled from the official Ai-Cha and Zhengda websites. A backend admin portal may be needed eventually to swap these out.
