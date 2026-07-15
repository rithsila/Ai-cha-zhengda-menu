# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
