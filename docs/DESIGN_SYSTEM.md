# Kikoweb Design System

Locked-in visual language for Kikoweb (fashion search bot "Kiko" — link-in → similar-vibe-but-cheaper product search via iMessage/Telegram).

Every new component or screen must match this. Reference imagery: Dribbble's GeexArts (Music OS, AI OS, Fly Air) — bold Helvetica solid color cards. NOT glassmorphism/gradient/3D direction.

> **Canonical examples** — mirror these instead of improvising:
> - `components/panel/GetYourCat.tsx` — Install modal (chat sim, channel toggle, scene transitions, spring entry, floating close)
> - `components/panel/BottomPanel.tsx` — Masonry grid, glassmorphism sticky header, bare-icon search, pill tabs
> - `components/panel/BrandPopup.tsx` — Stacked headline (Brand / Cluster), plain-text body, keyword pill chips, spinner-only loading
> - `components/panel/LocaleToggle.tsx` — Dashed circle button (only outline button style)

---

## Tokens

### Color

- **Page bg:** `#F0F0F2`
- **Card surface:** `#FFFFFF`
- **Muted category cards:**
  - Beige `#E8E2D0` (neutral)
  - Light blue `#C9D8E2` (Telegram)
  - Light green `#A8E0B0` (Apple Messages tone)
- **Tinted overlay** (chips, hover, channel-level inputs): `rgba(13,13,13,0.04~0.06)`
- **Text:** primary `#0D0D0D`, muted `rgba(13,13,13,0.55)`, faded `rgba(13,13,13,0.3~0.4)`
- **Savings/success:** `#1B8A3A` deep, `#2EBD52` light
- **Chat bubbles** (Install modal sim):
  - iMessage: user `#007AFF` / bot `#E9E9EB`
  - Telegram: user `#3B95E2` / bot `#FFFFFF`

### Typography

```
font-family: "Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard,
             "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif
```

- Weights: **700** headlines, **600** chips/buttons, **500** body
- Tracking: `-0.01em` to `-0.03em` (bigger = tighter)
- Headlines: `line-height: 0.95~0.98` (tight, dramatic)
- Body: `line-height: 1.3~1.7`

### Sizes

- Hero headline: 2.6–2.8rem
- Section headline: 1.7rem
- Card title: 1.4rem
- Panel title: 1.1rem
- Body emphasis: 0.95–1rem
- Chips / secondary: 0.78–0.84rem
- Meta / eyebrow: 0.68–0.74rem

---

## Patterns

### Stacked headline (MANDATORY)

Two lines, same big bold size, secondary in `rgba(13,13,13,0.3)`. Used everywhere a header has a label + tagline. Examples: "Popular / Album", "Kikoweb / Ask@kikoai", "Acne Studios / Quiet Luxury", "Text yourself the link / No app · 10s".

```jsx
<div style={{ fontSize: "1.7rem", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 0.98 }}>
  <div>{primary}</div>
  <div style={{ color: "rgba(13,13,13,0.3)" }}>{secondary}</div>
</div>
```

**Never** use a small uppercase eyebrow label above a big headline — use this stacked form.

### Pill chip (tabs, keywords, buttons)

- `borderRadius: 999px`, `padding: 8px 14px`
- Active: `background: #0D0D0D`, `color: #FFFFFF`, `fontWeight: 700`
- Inactive: `background: rgba(13,13,13,0.05)`, `color: #0D0D0D`, `fontWeight: 600`
- Hover (inactive): `background: rgba(13,13,13,0.1)`

### Solid color channel/category card

Used inside Install modal's iMessage/Telegram switcher and any "pick one of N" lists:
- Solid muted bg (use color tokens above)
- Bold title left, big bold number/symbol right (`01`, `02`, `$price`, `↓`)
- Hover slide: `transform: translateX(2~4px)`

### Content card (brand listing etc.)

- `borderRadius: 18~20px`, padding `20px 22px 24px`
- White bg `#FFFFFF` (the default), or muted token if categorical
- Resting shadow: `0 1px 2px rgba(0,0,0,0.03)`
- Hover: `transform: translateY(-2~3px)` + `boxShadow: 0 12px 28px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)`

### Modal

- `borderRadius: 28px`, padding 20px
- Overlay: `rgba(20,20,25,0.35~0.5)` + `backdropFilter: blur(6~8px)`
- Floating close button: **32×32 circle**, `top: 20px, right: 20px`, `border: 1px solid rgba(13,13,13,0.1)`, transparent bg, hover bg `rgba(13,13,13,0.06)`
- Entry animation: `translateY(20px) scale(0.96) → 0,1` via `cubic-bezier(0.2, 0.9, 0.25, 1)` over 0.32s

### Sticky header (BottomPanel pattern)

Page-level sticky bar for search + filter tabs. Pure glassmorphism, no outline.

- `position: sticky; top: 0; zIndex: 5`
- `background: rgba(240,240,242,0.12)` — almost transparent
- `backdropFilter: blur(36px) saturate(180%)` — strong frosted distortion
- **No border, no shadow** — must disappear into the page when not over content
- Reserve right padding (e.g. `padding-right: 60px`) for the fixed-positioned `LocaleToggle` so the search row aligns with it visually

### Inputs

- **Page-level (search):** bare icon + transparent input, no container. Used in BottomPanel header.
- **Channel-level (phone, country code):** tinted card `rgba(13,13,13,0.04)` + `borderRadius: 14px`. Used inside Install modal channel cards.
- **NEVER** a solid white box for an input on the page bg.

### Masonry brand grid

```css
column-count: 5;
column-gap: 10px;
```

Cards: `break-inside: avoid`, `marginBottom: 10px`. Thumbnail `aspect-ratio` cycles per card index across `["1 / 1", "4 / 5", "5 / 7", "3 / 4", "5 / 6", "1 / 1.05"]` for organic varying heights.

Long unbroken brand names (e.g. "fffpostalservice") need:
```css
wordBreak: keep-all;    /* keep Korean words together */
overflowWrap: anywhere; /* force-break long English words */
hyphens: auto;
```

### Loading state

Spinner only (no text). 26×26, `border: 2.5px solid rgba(13,13,13,0.12)` with `borderTopColor: rgba(13,13,13,0.6)`, `animation: spin 0.8s linear infinite`. `aria-label` carries the localized "Loading" string for screen readers.

### LocaleToggle

Dashed-border circle button, `position: fixed; top: 12px; right: 20px; zIndex: 20`. 40×40. Borders `1.5px dashed rgba(13,13,13,0.3)`. Shows current locale (`EN` or `KR`), toggles on click. The only outline-style button in the system.

### Chat simulation (Install modal canonical example)

Three-scene loop on a fixed-height (152px) container, all scenes `position: absolute; inset: 0`. Total cycle 16s.

- **Scene A (0–38%)** — Real chat. User message bubble + Kiko bubbles accumulate top-to-bottom with staggered fade-in (msg-1, msg-2, msg-3 at 6%, 16%, 30%). Bubbles persist; Scene A as a whole fades at 34–38%.
- **Scene B (36–73%)** — Product list scrolling. CSS `animation: scroll 3s linear infinite` on a duplicated track. `mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent)` for soft top/bottom edges.
- **Scene C (78–100%)** — Purchase complete finale. Drops in from above (`translateY(-30px) → +4px brief touch → 0`, single bounce no oscillation). Green gradient circle with white SVG check stroke. Scene C has `zIndex: 2` and is **last in DOM** to stack above Scene B.

Channel toggle (`key={channel}` on the wrapper) resets the animation on switch.

---

## Motion

- Default ease: `cubic-bezier(0.2, 0.9, 0.25, 1)`
- Spring overshoot (sparingly): `cubic-bezier(0.34, 1.56, 0.64, 1)`
- Hover transitions: 0.15–0.2s ease
- **NO multi-bounce oscillation** — prefer single overshoot or single drop-and-rest with one slight contact
- Long video-style sequences use 14–16s loops with cross-fade scene transitions and discrete `opacity + translateY` per scene
- Scene B → Scene C transitions need a ~0.5s gap; do not tighten them back to a cross-fade

---

## Rejected patterns

- iOS-style segmented controls (gray pill bg + white active tab)
- Heavy glassmorphism / `backdrop-filter` blur on UI cards (overlay-only is OK; cards stay solid muted)
- Multi-stop rainbow gradient flowing text
- Raw emoji as primary focal visual (e.g. big `✅`) — use styled SVG instead
- Saturated primary colors at full chroma in cards (`#34C759`, `#FF0000`) — use muted variants
- Divider/separator lines between sections (use spacing only)
- Solid white boxes for inputs on the page bg
- Small uppercase eyebrow labels above headlines — use stacked headline pattern instead
- Description text wrapped in a white card (use plain text with `opacity: 0.78`)
- Adding `overflow-x: hidden` to `html` or `body` (breaks `position: sticky`)
- Multi-bounce check/circle animations (settle oscillations) — single bounce only

---

## Internationalization

- `useUIStore.locale: "en" | "ko"` global state
- `lib/i18n.ts` — `DICT` (static strings), `KEYWORD_EN` (Korean DB keyword → English, 33 entries seeded)
- Hooks: `useT()`, `useTKeyword()`, `useLocale()`
- `clusterLabel(raw, locale)` — English label or Korean (underscores → spaces)
- LocaleToggle = dashed circle button, fixed top-right
- **Install modal is intentionally NOT translated** — stays English in KR mode
- **Hero headlines stay English regardless of locale** (brand wordmark, big bold lines)

---

## Brand voice

Cute, lowercase, cat-flavored — 🐾 emoji, "one sec, on the hunt", "got 8". Never robotic AI-speak ("Hold on — let me find it 🔎" was rejected for being too formal). Aspirational hero copy is OK ("Visualizing your taste"); bot voice stays casual.

USP wording always emphasizes **same vibe, cheaper** — not exact-match product detection. Original price → cheaper alt price → savings amount is the structural pattern (e.g. "Polène Numéro Un · $580 · saved $710").

---

## Where it lives

- `app/page.tsx` — page composition (graph + BottomPanel + LocaleToggle)
- `app/globals.css` — base typography only, no `overflow-x` constraints
- `components/panel/AskKikoAI.tsx` — header trigger for Install modal
- `components/panel/GetYourCat.tsx` — Install modal (canonical example)
- `components/panel/BottomPanel.tsx` — masonry grid + glassmorphism sticky header
- `components/panel/BrandPopup.tsx` — content modal pattern
- `components/panel/LocaleToggle.tsx` — outline button
- `components/graph/GraphCanvas.tsx` — D3 visualization, left alone (separate concern)
- `lib/store.ts` — global UI state including `locale`, `getCatOpen`, `focusedBrandId`
- `lib/i18n.ts` — translation dict + keyword map + hooks
- `lib/cluster-labels.ts` — Korean DB cluster names → English labels (locale-aware)

---

## Today's deferred work / known limitations

- **Brand descriptions** not yet translated — only Korean exists; EN mode falls back to Korean text. User flagged this as work-in-progress.
- **Kiko cat image** in Install modal uses background-removed Runway screenshot — replace with licensed/commissioned image before public launch.
- **SMS backend** (Twilio integration for the iMessage phone-input → text link) not yet wired. Currently the Send button sets `sent = true` locally with no actual SMS.
- **Telegram bot** `@kiko_fashion_ai_bot` is a placeholder handle.
