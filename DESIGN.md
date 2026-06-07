# Design System: Network Traffic Sentinel (流量哨兵)

This document encodes the Semantic Design System of the Network Traffic Sentinel dashboard. It translates a premium, Apple-inspired minimalist aesthetic into structured visual descriptions, semantic colors, and behavioral specs to guide the UI redesign.

---

## 1. Visual Theme & Atmosphere
A refined, high-clarity dashboard interface combining mathematical precision with clean, editorial layouts. Spacing is generous yet structured (Density 5), layouts use asymmetric grids and clear vertical divides, and transitions are fluid and organic, mirroring the premium spring-loaded physics of macOS/iOS. Banned are all forms of cyber-neon glow, cybernetic grids, and oversaturated dashboard elements. The mood is clinical, sophisticated, and premium — like a professional developer tool or system preference pane designed by Apple.

---

## 2. Color Palette & Roles
The palette is built on high-contrast, clean neutral tones and desaturated status indicators. Absolute neutral values prevent "warm vs. cool" gray fluctuations.

### Dark Mode
- **Midnight Canvas** (`#0D0D0D`) — Primary background canvas (pure off-black).
- **Elevated Space** (`#1C1C1E`) — Card and primary container panel fills.
- **Glass Panel** (`rgba(28, 28, 30, 0.75)`) — Frosted glass container backdrop with `backdrop-filter: blur(25px) saturate(180%)`.
- **Active Selection** (`#2C2C2E`) — Selected navigation item, active row, and button background overrides.
- **Whisper Border** (`rgba(255, 255, 255, 0.08)`) — Standard 1px panel boundaries, grid lines, and button outlines.
- **Strong Border** (`rgba(255, 255, 255, 0.16)`) — Divider lines, active input borders, and focused elements.
- **Polar White** (`#F5F5F7`) — Primary text, title labels, and high-priority copy.
- **Graphite Grey** (`#86868B`) — Secondary text, metadata, and placeholder text.
- **Charcoal Muted** (`#48484A`) — Unfocused controls, inactive borders, and timestamp labels.

### Light Mode (Dynamic Switch)
- **Alabaster Canvas** (`#F5F5F7`) — Light mode background (clean off-white).
- **Pure Surface** (`#FFFFFF`) — White surface panel containers.
- **Light Selection** (`#E5E5EA`) — Active selections in light mode.
- **Light Border** (`rgba(0, 0, 0, 0.06)`) — Thin borders and dividers.
- **Pitch Black** (`#1D1D1F`) — Primary text, titles, and body copy.
- **Slate Grey** (`#86868B`) — Secondary text and descriptions.

### Status Indicators (Common)
- **Apple Blue** (`#0071E3`) — Primary accent, download traffic indicators, active tabs, toggle switches, and primary action CTAs.
- **Emerald Mint** (`#30D158`) — Safe status, upload traffic metrics.
- **Amber Gold** (`#FF9F0A`) — Warning indicators, medium risk tags, and overseas traffic warnings.
- **Rose Crimson** (`#FF453A`) — Critical alerts, security threat alarms, and risk indicators.

---

## 3. Typography Rules
- **Display / H1 / H2:** `Satoshi` (or `SF Pro Display` system fallback) — Track-tight (`letter-spacing: -0.02em`), weight-driven hierarchy ranging from medium (`500`) to bold (`700`).
- **Body / Paragraphs:** `SF Pro Text` / System Sans-Serif — Relaxed leading (`1.45`), restricted line length (`65ch` max characters per line).
- **Mono / Data:** `SF Pro Mono` / `Geist Mono` — For IP addresses, port numbers, timestamp lists, and all data metrics (forces tabular numerals: `font-variant-numeric: tabular-nums`).
- **Banned:** `Inter` is banned for this project context to prevent a generic template look. All serif fonts are strictly BANNED in dashboards or software UI.

---

## 4. Component Stylings
- **Buttons & Action Controls:**
  - Shape: Smooth squircles or complete capsules (`border-radius: 9999px` for pills; `border-radius: 12px` for rectangular buttons).
  - Background: Solid Apple Blue (`#0071E3`) with white text for primary actions; thin border (`1px solid var(--line)`) with transparent background for secondary actions.
  - Active Switch State: Smooth tactile shift (`transform: scale(0.98)` or `translateY(1px)`) on active press.
  - Hover: Opacity reduction (e.g., `opacity: 0.9` or `filter: brightness(1.05)`) with smooth transitions. Custom cursors are strictly banned.
- **Cards & Panels:**
  - Border radius: Generous squircle curvature (`border-radius: 20px`).
  - Outline: Crisp 1px thin borders using `var(--line)` to separate panels. No neon glows or drop shadows with colored tinting.
  - Spacing: Deep internal margins (`padding: 24px`).
- **Tabbed Segmented Controls:**
  - Structure: Apple-style pill-switch wrapper with unified outline and sliding selector block (`border-radius: 9999px` or `10px`).
  - Interaction: Smooth CSS slide-and-fade for active indicators.
- **Inputs & Form Elements:**
  - Label strictly above the input. Error messages below in `Rose Crimson`.
  - Focus Ring: High contrast border outline in `Apple Blue` (`#0071E3`) without fuzzy outer neon glows.
- **Skeletal Loaders:**
  - Neutral shimmer matching the shape of final components. Spinning circular loaders are banned.
- **IP Details Drawer:**
  - Fixed right-side panel (`width: 440px`) sliding in using standard Apple spring physics. Features deep frosted glass background (`backdrop-filter: blur(35px)`) and a clean close button.

---

## 5. Layout Principles
- **Asymmetric Grid Architecture:**
  - Clean spatial grid with plenty of whitespace.
  - Centered Hero sections are banned; layouts utilize asymmetric split layouts or grid configurations.
  - Banned: "3 equal cards horizontally". Instead, use a 2-column asymmetric grid.
- **Spacing:**
  - Section paddings utilize responsive spacing (`clamp(1.5rem, 4vw, 3rem)`).
- **Containment:**
  - Max-width constraint of `1400px` for the entire dashboard shell.
  - Minimum viewport height set to `min-h-[100dvh]` to avoid mobile address-bar height jumps.

---

## 6. Motion & Interaction
- **Spring Physics Easing:**
  - All interactive elements use unified spring physics transitions: `transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1)`.
- **List Reveal:**
  - Staggered waterfall fade-ins (`opacity` and `translateY` animations) when pages/views load.
- **Hover Micro-interactions:**
  - Buttons and interactive cells shift slightly in background scale/opacity, rather than changing border colors to high contrast neon.
- **Hardware Acceleration:**
  - Animations are strictly mapped to `transform` and `opacity` to maintain 60fps+ rendering.

---

## 7. Anti-Patterns (Banned AI Tells)
- **NO Emojis** anywhere in labels, metrics, or content.
- **NO Inter font** or standard serif fonts (`Times New Roman`, `Georgia`).
- **NO Pure Black** (`#000000`) for canvas bases; always use off-black (`#0D0D0D`).
- **NO Neon/Oversaturated Outer Glows** (glowing shadows).
- **NO Bouncing Arrow Chevrons** or filler text like "Scroll to explore".
- **NO generic names** ("Acme", "John Doe").
- **NO fake round numbers** in mock data (e.g. `100.0%` or `50.0%`).
- **NO AI copywriting clichés** ("Elevate", "Seamless", "Unleash").
