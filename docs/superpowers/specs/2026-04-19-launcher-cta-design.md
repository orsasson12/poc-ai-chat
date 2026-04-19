# Launcher CTA — Configurable Color & Animation

## Context

Today every BizAssist widget renders the same static circular launcher (`apps/web/public/widget.js:293-345`): a single-color bubble with a hover-scale and a one-time slide-in. Only `widgetColor` is configurable per assistant. Tenants who want to draw visitor attention to the chat have no in-product way to do it — they either accept the default or contact us for custom CSS.

This design adds two configurable dimensions to the launcher:

1. **Animation mode** — four preset animations that tenants can switch between from the dashboard.
2. **Accent color** — an optional second color that drives the pulse ring, independent from the launcher body color.

Proactive engagement popups (already shipped) serve a different purpose: they appear contextually and carry copy. The launcher animation is a *standing* CTA — always-on visual presence, not a timed nudge. The two should coexist without fighting visually.

## Scope

**In:**
- Three new per-assistant fields: `launcherAnimation`, `launcherAccentColor`, `launcherAnimationIntervalSec`.
- Four animation modes: `none` (default), `pulse`, `bounce`, `attention_flash`.
- Dashboard UI for editing, with live preview.
- Widget runtime render changes in `apps/web/public/widget.js`.
- `/api/widget/[id]/config` exposes the new fields.
- Full `prefers-reduced-motion` disablement.
- Launcher animation pauses while the proactive bubble is visible, so they don't visually collide.

**Out:**
- Tenant-uploaded custom animations (arbitrary CSS/keyframes).
- Per-URL / per-visitor animation rules (that's engagement-rules territory).
- Animating the proactive bubble itself.
- Animating the launcher icon (only the bubble container / ring).
- A/B testing between launcher variants.
- Analytics on launcher click-through-rate (a future observability follow-up).

## Data Model

### Schema changes (`apps/web/lib/db/schema.ts`)

New pgEnum:
```ts
export const launcherAnimationEnum = pgEnum("launcher_animation", [
  "none",
  "pulse",
  "bounce",
  "attention_flash",
]);
```

Three new columns on the `assistants` table (same block as `widgetColor`):
```ts
launcherAnimation: launcherAnimationEnum("launcher_animation")
  .default("none").notNull(),
launcherAccentColor: varchar("launcher_accent_color", { length: 7 }),
launcherAnimationIntervalSec: integer("launcher_animation_interval_sec")
  .default(8).notNull(),
```

- `launcherAccentColor` is nullable. When null, the widget derives the ring color from `widgetColor` at 40% opacity.
- `launcherAnimationIntervalSec` applies to `pulse` and `bounce` only. Range validated at API boundary: 4 ≤ value ≤ 30. Ignored by the runtime for `none` and `attention_flash`.

### Migration

Generate a Drizzle migration (`npx drizzle-kit generate`) that creates the pgEnum and adds three columns with their defaults. Existing rows get `launcher_animation = 'none'`, `launcher_accent_color = NULL`, `launcher_animation_interval_sec = 8` automatically. No backfill script.

### Types (`packages/types/index.ts`)

Add a union type and shared card of valid animations so both widget runtime, config API, and dashboard agree:
```ts
export type LauncherAnimation = "none" | "pulse" | "bounce" | "attention_flash";
```

Export a `LAUNCHER_ANIMATIONS` constant array so the dashboard picker and Zod validators share one source of truth.

### Zod validation (dashboard save path)

The existing customer-update validator inside `apps/web/app/api/customers/[id]/route.ts` (see line 19 where `widgetColor` is declared) — plus the matching create validator in `apps/web/app/api/customers/route.ts` — gets three fields appended:
```ts
launcherAnimation: z.enum(["none", "pulse", "bounce", "attention_flash"]).default("none"),
launcherAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
launcherAnimationIntervalSec: z.number().int().min(4).max(30).default(8),
```

## Config API (`apps/web/app/api/widget/[id]/config/route.ts`)

Add the three fields to the response body. Edge-cached 60s — unchanged. Shape:
```ts
{
  name, color, greeting, position, isActive,
  launcherAnimation: "pulse",
  launcherAccentColor: "#ff6b6b" | null,
  launcherAnimationIntervalSec: 8,
}
```

The widget.js code falls back to `"none"` / `null` / `8` if the server returns older payload — safe during rolling deploys.

## Dashboard UI (`apps/web/components/dashboard/customer-detail.tsx`)

New "Launcher CTA" panel inserted after the existing widget-color block (around line 560). Structure:

1. **Mode picker** — 4 radio cards, each with a mini animated preview of its mode (50×50 circle using the same keyframes the real launcher uses). User clicks a card; selection becomes the active mode. `role="radiogroup"` with keyboard navigation.
2. **Accent color input** — color `input[type="color"]` + hex text input + "Clear" button. When Clear pressed, stores `null` and shows `Auto ({widgetColor} @ 40%)` as placeholder. Disabled (visually dimmed) when mode is `none`.
3. **Interval slider** — 4–30s range, step 1. Disabled when mode is `none` or `attention_flash` (those modes don't replay on an interval).
4. **Preview bubble** — the existing preview at `customer-detail.tsx:470` gets a parallel "animated" preview next to it that reflects the current settings in real time. Uses the same keyframe CSS the runtime uses (imported into the dashboard via a small shared CSS module).

All four controls live inside `<fieldset>` with a legend for accessibility.

### State hooks
Three new `useState`s (`launcherAnimation`, `launcherAccentColor`, `launcherAnimationIntervalSec`) wired into the existing save-handler payloads at lines 355 / 385 / 426.

## Widget Runtime (`apps/web/public/widget.js`)

### CSS additions (inside the existing style-injection block ~line 293)

```css
/* Pulse mode */
.ba-bubble--pulse { position: relative; }
.ba-bubble--pulse::after {
  content: "";
  position: absolute; inset: -4px;
  border-radius: 50%;
  background: var(--ba-accent, rgba(0,0,0,0));
  animation: ba-pulse var(--ba-interval, 8s) ease-out infinite;
  pointer-events: none;
  z-index: -1;
}
@keyframes ba-pulse {
  0%   { transform: scale(1);   opacity: .5; }
  70%  { transform: scale(1.6); opacity: 0;  }
  100% { transform: scale(1.6); opacity: 0;  }
}

/* Bounce mode */
.ba-bubble--bounce {
  animation: ba-bounce-loop var(--ba-interval, 8s) ease-in-out infinite;
}
@keyframes ba-bounce-loop {
  0%, 85%, 100% { transform: translateY(0); }
  90%  { transform: translateY(-6px); }
  95%  { transform: translateY(0); }
}

/* Attention-flash — one-shot on page load (3 iterations, ~5s total) */
.ba-bubble--flash { position: relative; }
.ba-bubble--flash::after {
  content: "";
  position: absolute; inset: -4px;
  border-radius: 50%;
  background: var(--ba-accent, rgba(0,0,0,0));
  animation: ba-pulse 1.5s ease-out 3;
  pointer-events: none;
  z-index: -1;
}
.ba-bubble--flash {
  animation: ba-bounce-loop 1.5s ease-in-out 3;
}

/* Pause when proactive popup is open */
.ba-bubble[data-proactive-open="true"].ba-bubble--pulse::after,
.ba-bubble[data-proactive-open="true"].ba-bubble--bounce,
.ba-bubble[data-proactive-open="true"].ba-bubble--flash,
.ba-bubble[data-proactive-open="true"].ba-bubble--flash::after {
  animation-play-state: paused;
}

/* Reduced motion — cancels all launcher animation */
@media (prefers-reduced-motion: reduce) {
  .ba-bubble--pulse::after,
  .ba-bubble--bounce,
  .ba-bubble--flash,
  .ba-bubble--flash::after { animation: none !important; }
}
```

### Render changes

- `createBubble` signature shifts from `createBubble(color)` to `createBubble(config)` — reads `launcherAnimation`, `launcherAccentColor`, `launcherAnimationIntervalSec`.
- Class selection:
  ```js
  const animClass = {
    none: "",
    pulse: "ba-bubble--pulse",
    bounce: "ba-bubble--bounce",
    attention_flash: "ba-bubble--flash",
  }[config.launcherAnimation || "none"];
  bubble.className = "ba-bubble " + animClass;
  ```
- CSS variables on the bubble element:
  ```js
  const accent = config.launcherAccentColor
    || hexToRgba(config.widgetColor, 0.4);
  bubble.style.setProperty("--ba-accent", accent);
  bubble.style.setProperty("--ba-interval",
    (config.launcherAnimationIntervalSec || 8) + "s");
  ```
- `hexToRgba` helper: 8 lines, handles `#rrggbb` → `rgba(r,g,b,a)`. Falls back to `rgba(0,0,0,0.4)` on malformed input.
- When opening/closing the proactive popup, existing popup-show / popup-hide code toggles `bubble.dataset.proactiveOpen = "true" | "false"` so the CSS pause rule applies.

### Call-site update
Line 791 `createBubble(config.widgetColor)` becomes `createBubble(config)`.

### Bundle-size budget
Estimated +750 bytes uncompressed (CSS + render branch + hexToRgba helper). Under the 2KB soft budget. No new deps.

## Testing Strategy

Manual smoke (documented, not automated here):
1. Dashboard: change mode → preview reflects instantly; hit Save → reopen page → mode persists.
2. Widget page: load chat with each mode, confirm ring visual + interval matches.
3. Reduced motion: enable OS setting → all four modes render as static bubble.
4. Proactive bubble: trigger an engage rule while `pulse` is active → bubble animation visually pauses while popup is open; resumes on popup close.
5. Legacy config: temporarily strip the new fields from the `/api/widget/[id]/config` response → widget renders `none` mode (no crash).
6. Accessibility: keyboard-navigate the radio-card picker; tab to color input, clear button, and slider in order.

## Mission Split

Per `.claude/rules/05-mission-split.md`, this is 4+ distinct steps — decompose into sequential missions:

1. **Mission 1** — Schema + types + migration. DB enum + three columns, `packages/types` updates, Drizzle migration committed. Verification: build passes, `drizzle-kit generate` produces the expected SQL.
2. **Mission 2** — Config API + Zod. `/api/widget/[id]/config` exposes the three fields; dashboard save-path validators accept and persist them. Verification: manual POST to the customer-update route with and without accent color, query the DB, confirm persistence.
3. **Mission 3** — Dashboard UI in `customer-detail.tsx`. Mode picker with live preview, accent color input, interval slider, save wiring. Verification: click each control, check network tab for payload, verify persistence round-trip.
4. **Mission 4** — Widget runtime. CSS keyframes + class rules, `createBubble(config)` refactor, `hexToRgba`, proactive-open pause wiring. Verification: load `/chat/[id]` and the widget test harness, eye-test each mode, toggle reduced-motion.

Each mission ends with a commit, push, and a hard stop for `/compact` per `.claude/rules/05-mission-split.md`.

## Risks & Gotchas

1. **Migration on production DB** — new pgEnum types require `CREATE TYPE ... AS ENUM (...)` which Supabase handles through Drizzle cleanly, but the generated migration must run before the code deploy, or existing widgets error on the new column read. Deploy order documented in Mission 1.
2. **Widget caching at the CDN** — `widget.js` is served with edge cache. After deploy, sites embedding the old `widget.js` won't see the new classes for up to the cache TTL. Acceptable — they render the same launcher they had before.
3. **`<color input />` in HSB color pickers** — some browsers render without an alpha slider, which is fine (accent is opaque), but we must strip any non-`#rrggbb` input before persisting. Zod regex handles it.
4. **CSS `:has()` browser support** — we avoided the `:has()` approach; we use `data-proactive-open` + attribute selector, which is supported everywhere ES2015 runs.
5. **Attention-flash timing on slow page loads** — the 5s animation starts on bubble mount. If the page is visually still loading, the user may miss it. Not worth fixing in v1; if tenants complain we can delay via `requestIdleCallback`.
6. **Bundle size** — the 2KB soft budget for widget.js changes is in the original plan; this feature eats a significant chunk. No room for another animation-heavy feature without minifying or splitting the runtime.

## Completion

Each mission commits and pushes independently. Final mission announcement: launcher CTA shipped, 4 animation modes + accent color live, configurable per assistant from the dashboard.
