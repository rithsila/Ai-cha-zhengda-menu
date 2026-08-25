---
name: Ai Cha Menu
description: Telegram Mini App for Ai Cha & Zhengda Chicken
colors:
  primary-aicha: "#e53935"
  primary-zhengda: "#e53935"
  neutral-bg: "var(--tg-theme-bg-color)"
  neutral-text: "var(--tg-theme-text-color)"
  neutral-secondary: "var(--tg-theme-secondary-bg-color)"
typography:
  display:
    fontFamily: "'Outfit', system-ui, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "'Outfit', system-ui, sans-serif"
    fontWeight: 400
rounded:
  full: "9999px"
  xl: "12px"
  2xl: "16px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  tab-active:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.primary-aicha}"
    rounded: "{rounded.xl}"
    padding: "12px"
---

# Design System: Ai Cha & Zhengda Menu

## 1. Overview

**Creative North Star: "Double Your Choice, Double Your Joy"**

This interface is playful & vibrant, prioritizing a fast & frictionless user flow. Built specifically for Telegram, it leverages native integration to feel tactile & snappy rather than behaving like a slow, desktop-first website. It unites Ai-Cha and Zhengda under a clean, signature Red & White brand identity with sharp contrast.

**Key Characteristics:**
- Unified signature Red & White palette matching physical store and reward card branding.
- Native Telegram light/dark mode syncing for backgrounds and text.
- Tactile, bouncy physics on all interactive elements.

## 2. Colors

"Signature Red & Crisp White": High contrast, bold, clean.

### Primary
- **Ai-Cha & Zhengda Brand Red** (`#e53935`): The dominant brand color for both Ai-Cha and Zhengda, used for active tabs, category pills, primary action buttons, and price badges.
- **Brand Soft Red** (`#fee2e2` / `rgba(229, 57, 53, 0.1)`): Used for soft pill tints, selected states, and badge backgrounds.

### Neutral
- **Telegram Base** (var(--tg-theme-bg-color)): Main app background, adapting dynamically to the user's OS preference.
- **Telegram Secondary** (var(--tg-theme-secondary-bg-color)): Used for category pill backgrounds and menu item cards to provide structural contrast.

**The Telegram Sync Rule.** Hardcoded whites and blacks are strictly forbidden for backgrounds and text. You must use the Telegram CSS variables (`--tg-theme-bg-color`, `--tg-theme-text-color`) to ensure seamless native theming.

## 3. Typography

**Display Font:** Outfit (with system-ui fallback)
**Body Font:** Outfit (with system-ui fallback)

**Character:** Friendly, highly readable on small screens, approachable without being childish.

### Hierarchy
- **Display** (Bold, 30px): Page headers (e.g., "Menu").
- **Headline** (Semi-bold, 14px): Menu item names.
- **Body** (Regular, 12px): Menu item descriptions.
- **Label** (Bold, 12px): Pricing badges and category pills.

## 4. Elevation

Flat-By-Default. Shadows are avoided for standard structural elements (like cards and tabs) to maintain a clean, lightweight UI.

### Shadow Vocabulary
- **Floating Action Shadow** (`shadow-xl`): Applied exclusively to fixed, floating elements (like the bottom cart drawer) to indicate z-index stacking over scrollable content.

**The Flat-By-Default Rule.** Surfaces are flat at rest. Depth is established through tonal contrast (e.g., secondary background vs base background), not box shadows.

## 5. Components

Components feel tactile, bouncy, and highly responsive to touch, mimicking a native iOS app.

### Buttons
- **Shape:** Rounded (12px to full-pill depending on context).
- **Primary:** Bright brand color (Matcha or Red) with white text.
- **Hover / Focus:** Scale down slightly (`scale: 0.96`) on tap to provide immediate physical feedback.

### Cards / Containers
- **Corner Style:** 16px (2xl).
- **Background:** Telegram Secondary Background.
- **Shadow Strategy:** None.

### Navigation / Tabs
- **Style:** Pill-shaped toggle spanning the top of the screen. Active state lifts off the background with a slight tint.

## 6. Do's and Don'ts

### Do:
- **Do** respect Telegram's safe areas (use padding at the bottom of the screen).
- **Do** use large touch targets (minimum 44x44px) for all buttons and interactive elements.
- **Do** provide instant visual feedback on tap (using scale transforms or background shifts).

### Don't:
- **Don't** use cluttered, desktop-first layouts.
- **Don't** rely on "fake" sticky headers that clash with Telegram's native header.
- **Don't** use overly serious or sterile enterprise UI styling (no gray/corporate aesthetic).
