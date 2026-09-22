---
name: uiux-pro-max
description: >-
  Elite UI/UX and frontend engineering playbook. Use this skill whenever building,
  restyling, reviewing, or debugging any user-facing interface — pages, screens,
  components, layouts, forms, modals, navigation, animations, responsive behavior,
  dark mode, empty/loading/error states, or accessibility — across any app in this
  monorepo (customer-web, customer-app, admin-dashboard, driver-app,
  restaurant-portal). Triggers on any request to "make it look better/modern/
  professional", "improve the design/UI/UX", "fix the layout", "polish", "redesign",
  build a landing page or dashboard, or any work touching React components, Tailwind
  classes, or CSS. Produces interfaces that are beautiful, accessible, responsive,
  and consistent — not generic.
---

# UI/UX Pro Max

Your job is to produce frontend work that looks like it was designed by a senior
product designer and built by a senior frontend engineer — never generic, never
"AI default". Follow this playbook on every UI task.

## 0. Before writing any code — read the project

This is a **monorepo**. First identify which app you're in and read ITS setup —
do not mix conventions between apps.

- `customer-web`: **Vite + React 19 + Tailwind CSS v3 + react-router-dom**, `axios`,
  `react-hot-toast`, `socket.io-client`.
- Other apps (`admin-dashboard`, `driver-app`, `customer-app`, `restaurant-portal`):
  check their own `package.json` for React/RN, Tailwind version, and router.

Then:
1. **Reuse existing components** in that app before creating new ones.
2. **Read the design tokens**: Tailwind v3 config (`tailwind.config.*`) — reuse its
   `theme.extend` colors, spacing, radius, and fonts. Never hardcode a hex when a
   token exists.
3. **Match conventions**: file structure, naming, and any `cn()`/`clsx` helper used
   for conditional classes.

## 1. Visual design principles (what makes it not look generic)

- **Spacing & rhythm**: consistent 4/8px scale. Generous whitespace reads as premium.
  Group related items by proximity.
- **Typography**: clear hierarchy (one page title, distinct headings, ~16px body).
  Max 2 font weights per view. Never center long paragraphs.
- **Color**: ONE primary/brand color + neutrals, used with intent (primary = main
  action, muted = secondary, red = destructive). Avoid pure black on pure white.
  Ensure WCAG AA contrast (4.5:1 text).
- **Depth**: subtle borders + soft shadows over heavy ones; one consistent elevation
  system.
- **Corners**: one radius scale from the theme, applied everywhere.
- **Density**: customer-facing = airy and inviting; dashboards/tables = compact and
  scannable.

## 2. Layout & responsiveness (mobile-first, always)

- Design **mobile-first**, then `sm: md: lg:`. Every screen works at 375px with no
  horizontal scroll.
- Use **Grid / Flexbox** with `gap-*`, not margins between siblings.
- Constrain reading width (`max-w-*` centered) instead of full-bleed text.
- Tap targets ≥ 44px on touch. Stack multi-column layouts on mobile.

## 3. Every interactive element needs all its states

Buttons, links, inputs, cards, rows — never ship only the default:
- **hover**, **focus-visible** (visible ring, required for a11y), **active**,
  **disabled**, **loading** (spinner + disabled + preserved width).
- Add `transition-colors`/`transition-all duration-200`. No jarring instant jumps.

## 4. The states people forget (handle all four for any data view)

1. **Loading** — skeletons (preferred) or spinners; no blank flash or layout shift.
2. **Empty** — friendly icon + one-line explanation + a primary action.
3. **Error** — clear human message + retry (pair with `react-hot-toast` for transient
   feedback). Never dump raw errors.
4. **Success/populated** — the normal state.

For realtime data (`socket.io`), show connection/reconnecting state and update the UI
optimistically where it makes sense.

## 5. Motion

- Motion clarifies, never decorates. Keep it fast (150–300ms), `ease-out`.
- Animate entrances (fade + small translate), list changes, and transitions.
- Respect `prefers-reduced-motion`.

## 6. Accessibility (non-negotiable)

- Semantic HTML first (`button`, `nav`, `main`, `label`, ordered `h1..h6`).
- Every input has a `<label>` or `aria-label`. Icon-only buttons have `aria-label`.
- Meaningful `alt` on images (`alt=""` for decorative).
- Full keyboard support: Tab/Enter/Esc, focus trapped in modals, visible focus ring.
- Color is never the only signal (add icon/text for status & errors).

## 7. Forms

- Label above field, helper text below, inline errors tied via `aria-describedby`.
- Validate on blur/submit, not every keystroke. Disable submit while pending.
- Correct input types / `inputmode` / autocomplete for good mobile keyboards.
- Preserve entered data on error.

## 8. Images & performance

- Responsive, lazy-loaded images with explicit dimensions to avoid layout shift (CLS).
- Lazy-load below-the-fold heavy components; code-split routes (Vite/react-router).
- Keep the initial bundle lean.

## 9. RTL / Arabic support (important for this product)

- Wasaly serves Arabic users — honor `dir="rtl"`. Use logical properties
  (`ms-*/me-*`, `ps-*/pe-*`, `start/end`) instead of hard `left/right` so layouts
  mirror correctly. Test both LTR and RTL.

## 10. Self-review checklist (run before saying "done")

- [ ] Right app identified; reused its components & design tokens (no stray hex)
- [ ] Works at 375px with no horizontal scroll; correct at tablet & desktop
- [ ] hover / focus-visible / active / disabled / loading states present
- [ ] loading, empty, error, and populated states all handled
- [ ] keyboard-navigable, visible focus rings, labels + alt text, AA contrast
- [ ] RTL mirrors correctly
- [ ] motion subtle, fast, respects reduced-motion
- [ ] spacing/typography/radius consistent with the rest of the app
- [ ] no console warnings; types correct

Deliver interfaces you'd be proud to ship to production.
