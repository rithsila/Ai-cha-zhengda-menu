# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Security
- Staff API routes now need a login token. Reading all orders, changing an order status, and
  toggling an item as sold out return 401 without one. Logging in returns a token that lasts
  12 hours. The manager PIN header still works for manager tools.
- The staff dashboard saves its token, so a page reload no longer sends staff back to the PIN
  screen. The screen locks again when the token expires or the server rejects it.

### Fixed
- Modifier prices were being dropped. The app sends catalog ids like `boba`, but the database
  stored random ids, so a topping could be shown in the cart and not charged (a $1.10 cart was
  charged $0.85). Modifier rows now keep the catalog id in a new `key` column, and an option the
  server cannot find is rejected instead of silently ignored.
- Loyalty points could be spent twice. Two pending orders could each redeem the same balance.
  Points are now taken out of the balance when the order is created, inside one transaction.
  Cancelling an order gives the points back.
- Sold-out items could still be ordered through the API. They are now rejected.
- Sales analytics missed cash orders, because it only counted orders marked "paid". It now counts
  "paid" and "completed".
- Staff and Manager PINs are now checked by the server; admin API routes require the manager PIN.
- Order totals are calculated on the server from the real menu prices; client prices are ignored.
- Account tab loads correctly (was calling a missing endpoint).
- Telegram Login Widget now works: the server verifies the login and signs the user in for browser use.
- Manager reward catalog: add and activate/deactivate rewards actually work.
- Loyalty point rates are configurable by managers (points per $1 discount, points earned per $1).
- Checkout lets customers choose exactly how many points to spend.

## [1.0.0] - 2026-07-15
### Added
- **Phase 4 — Loyalty, Manager Mode & Integrations**
  - Telegram Bot-First Gate (forced phone number collection via contact share)
  - Telegram Login Widget for browser access (web login)
  - Native ABA PayWay deep-link payment flow and webhook polling
  - Manager Mode dashboard inside Staff App (PIN protected)
  - Loyalty Reward Catalog UI (Account Tab) and Checkout points redemption
  - Leaflet-based interactive GPS map for Delivery coordinates
- **Phase 3 — Delivery & Multi-Branch**
  - "Delivery" order type alongside "Pickup"
  - Multi-branch location support
- **Phase 2 — Order Tracking & Expansion**
  - Live order status for customers (Preparing → Ready for Pickup)
  - Order history and one-tap reordering
  - Admin dashboard to toggle items as "Sold Out"
- **Phase 1 — MVP (Pickup & Dual-Menu)**
  - UI with two main tabs for Ai-Cha and Zhengda
  - Ordering flow: Browse menu, build items with modifiers, cart, checkout via KHQR/Cash, receive pickup code
  - Multi-language support: English, Khmer, and Chinese
  - Staff Ops features: Staff Tablet Web Dashboard and order notifications
- **Phase 0 — Setup & Architecture**
  - BotFather bot configuration
  - ABA PayWay / KHQR integration
  - React + Vite frontend initialization
  - Design system setup with Tailwind and Telegram Theme syncing
