# Design System

## Visual Theme & Atmosphere

A high-contrast, bank-grade developer interface combining modern dark-mode fintech elegance with Cambodian cultural motifs.

## Color Palette

- **Brand Primary (ABA Cyan)**: `oklch(0.72 0.16 215)` (#00B2E3) - Accents, primary badges, and key actions.
- **Brand Navy (ABA Deep)**: `oklch(0.28 0.08 235)` (#00365A) - Trust containers, primary button backgrounds.
- **National Blue (Cambodia)**: `oklch(0.32 0.18 260)` (#032EA1) - Flag waves and header glowing aura.
- **National Red (Cambodia & KHQR)**: `oklch(0.55 0.24 25)` (#E12328) - KHQR badge and flag stripe.
- **Background Deep**: `oklch(0.12 0.01 240)` - Main dark canvas.
- **Surface Card**: `oklch(0.18 0.01 240)` - Feature and trust metric cards.
- **Ink Primary**: `oklch(0.98 0.00 0)` - Headings and essential text (≥ 10:1 contrast).
- **Ink Muted**: `oklch(0.70 0.01 240)` - Explanations and descriptions (≥ 4.5:1 contrast).

## Typography

- **Headings**: System Sans (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`), bold weights (700-850), tight letter spacing (`-0.035em`).
- **Body**: Readable sans-serif, max line-length `65-75ch`, line height `1.6`.
- **Code & Terminals**: Monospace (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`), cyan highlight.

## Components & Affordances

- **Hero Banner**: Floating 3D perspective Cambodian flag with Angkor Wat silhouette and silk shimmer overlay.
- **Trust Badges**: Floating rounded badges for ABA PayWay, KHQR Bakong, and Unofficial Community notice.
- **Terminal Box**: Semi-transparent dark slate backdrop with blur effect and 1-click select code snippet.
- **Feature Cards**: Clean 4-column responsive grid with icon, bold title, and crisp micro-copy.

## Motion Guidelines

- Exponential easing (`ease-in-out`), continuous silk light reflections, zero layout-shift animations.
- Accessible fallbacks with `@media (prefers-reduced-motion: reduce)`.
