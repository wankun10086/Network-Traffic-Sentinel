# Project Backlog: Network Traffic Sentinel Redesign

This document tracks the requirements, implementation tasks, QA verification, and fixes for the Network Traffic Sentinel dashboard redesign.

---

## 1. Feature Specifications & Roadmap

### F1: Translucent Gradient Controls (半透明渐变控制)
- **Description:** Implement interactive controls in the settings panel to customize the translucent UI theme, including switching the dynamic background radial gradients, altering panel backdrop blur levels, and adjusting card glassmorphism.
- **Tasks:**
  - [x] Add UI inputs (e.g., toggles, sliders) in the "Control & Settings" tab for canvas gradient toggle and blur settings.
  - [x] Update `AppSettings` types and backend API hooks to serialize and persist these visual configurations.
  - [x] Wire controls to dynamically apply CSS custom properties or classes to the root document.
- **Assignee:** UX Fixer

### F2: Pacific-Centered World Map Topology Background (世界地图拓扑背景)
- **Description:** Enhance the IP trace drawer with a stylized, Pacific-centered SVG world map background, showcasing smooth curved Bezier routes and flowing animated gradients.
- **Tasks:**
  - [x] Render the Pacific-centered layout in the route drawer topology pane.
  - [x] Implement SVG `linearGradient` pulsing flows on the route path (green/blue/yellow transition).
  - [x] Ensure performance complies with the 60fps rule (using CSS `transform` and `opacity` transition keys).
- **Assignee:** UX Fixer

### F3: IP Type Badges in Table (连接表中的 IP 类型标签)
- **Description:** Display color-coded, styled semantic badges in the main Connections table showing the verified IP purpose (e.g., Residential, Business, Hosting, CDN, Anycast, Mobile, Unknown).
- **Tasks:**
  - [x] Match IP type payload in the Connections table row data.
  - [x] Render a specialized semantic badge for each type with descriptive Lucide icons and calibrated text colors.
  - [x] Maintain design consistency with Apple Preference Panes (rounded squircles, 1px border lines, desaturated fills).
- **Assignee:** UX Fixer

### F4: Smooth Tab Transitions (标签切换缓动动画)
- **Description:** Integrate transition animations during tab switching using Apple-inspired spring physics curves and subtle offsets.
- **Tasks:**
  - [x] Add CSS keyframe or transition styles to the tab panes (e.g., 6px translateY displacement, opacity crossfade).
  - [x] Use `cubic-bezier(0.16, 1, 0.3, 1)` easing.
  - [x] Ensure hardware acceleration (`will-change: transform, opacity`) is utilized for stutter-free rendering.
- **Assignee:** UX Fixer

---

## 2. QA Findings & Bug Fix Tracking

| Issue ID | Priority | Feature | Description / Bug Details | Status | Assignee | Date Logged | Date Fixed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| S-02 | High | F1 (Controls) | **Manual Theme Control:** Follow system theme checkbox only toggles between system and light. No manual selector for dark mode. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |
| B-02 | High | F3 (Badges) | **GeoClass `private` Badge:** Local/private IP addresses render as plain text; style is missing for `.geo-badge.private` in styles.css. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |
| T-04 | Medium | F4 (Transitions) | **Theme Transition Smoothness:** Visual transition snapping. Panels, cards, items, tab panes, and route hop rows lack transitions for background-color, border-color, and box-shadow. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |
| M-02 | Medium | F2 (Map) | **Australia SVG Path Alignment:** Australia is shifted east (drawn at X: 170-200, should map to X: 148-188). Perth floats in the ocean. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |
| M-03 | Medium | F2 (Map) | **South America SVG Path Alignment:** South America is shifted west (drawn at X: 285-325, should map to X: 314-360). Sao Paulo floats in the Atlantic. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |
| M-04 | Medium | F2 (Map) | **Africa SVG Path Alignment:** Southern Africa is shifted east (mapped tip is X: 95, should map to X: 53.4). Cape Town floats in the ocean. | [x] Resolved | UX Fixer | 2026-06-07 | 2026-06-07 |

---

## 3. Milestone Definition & Completion Criteria
- **Milestone 1:** Feature Implementation - All backlog tasks for F1, F2, F3, F4 are implemented by UX Fixer.
- **Milestone 2:** QA Testing & Verification - QA Tester reviews all features, logs findings, and verifies the fixes.
- **Milestone 3:** Final Release - Backlog completed, signed off by PM, and reported to Project Leader.
