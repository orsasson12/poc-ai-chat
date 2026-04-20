# Chat Theme Presets — Design Spec

**Date:** 2026-04-20
**Status:** Draft — awaiting implementation plan
**Scope:** Chat iframe only (`/chat/[id]`). Launcher bubble and loader unchanged.

---

## Problem

Today the chat iframe renders in a single light theme, styled through shadcn/Tailwind default tokens. The only per-tenant visual customization is `widgetColor`, which drives the header and loader. End-users viewing the chat can't switch to a dark theme, and business owners have no way to pick a surface palette that matches their brand beyond the single accent color.

## Goal

Let business owners pick a default theme mode (light/dark/auto) plus a light and dark preset from a curated list. Let end-users override light↔dark for their session via a toggle in the chat header. Preserve the existing `widgetColor` as the accent — presets only touch surfaces (backgrounds, bubbles, text, borders).

## Non-Goals

- Per-visitor accent color override
- Owner-uploaded custom presets
- DB-editable preset palettes
- Theming the launcher bubble or loader rendered by `widget.js` on the host page
- Syncing chat theme to any dashboard / email template surfaces

---

## Decisions Made During Brainstorming

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Owner picks default mode; visitor can override | Matches SaaS expectations (Intercom / Crisp behavior) |
| 2 | Mode + 4 curated presets (not full palette control) | Prevents owners from shipping unreadable contrast |
| 3 | Preset = surface only; `widgetColor` stays as accent | Zero-disruption migration for existing tenants |
| 4 | 4 presets: Classic, Parchment (light); Midnight, Slate (dark) | Enough variety to feel premium without sprawling |
| 5 | Iframe only — bubble / loader unchanged | Smallest coherent v1 shipping unit |
| 6 | Visitor toggle = sun/moon icon in chat header | Most discoverable; minimal header chrome |
| 7 | Persistence mirrors `cookielessMode` pattern | Consistent with how session IDs are already handled |

---

## Architecture

### Data Model

Three new columns on `assistants` table (`lib/db/schema.ts`):

```ts
themeMode:         varchar, default 'light'     // 'light' | 'dark' | 'auto'
themeLightPreset:  varchar, default 'classic'   // 'classic' | 'parchment'
themeDarkPreset:   varchar, default 'midnight'  // 'midnight' | 'slate'
```

Drizzle migration via `npx drizzle-kit generate` populates defaults on existing rows. Nothing visibly changes for current tenants until they edit the new settings.

Two new string-literal types get added to `packages/types/index.ts` (consistent with existing enums like `WidgetPosition`, `LauncherIcon`):

```ts
export type ThemeMode = 'light' | 'dark' | 'auto';
export type ThemeKey = 'classic' | 'parchment' | 'midnight' | 'slate';
export const LIGHT_THEME_KEYS: readonly ThemeKey[] = ['classic', 'parchment'] as const;
export const DARK_THEME_KEYS:  readonly ThemeKey[] = ['midnight', 'slate'] as const;
```

Preset **palette values** (concrete colors) live in `apps/web/lib/theme/presets.ts` — **not in the DB**:

```ts
import type { ThemeKey } from '@bizassist/types';

export const PRESETS: Record<ThemeKey, {
  label: string;
  isDark: boolean;
  tokens: {
    '--chat-bg': string;
    '--chat-surface': string;        // assistant bubble background
    '--chat-surface-user': string;   // user bubble background (usually widgetColor)
    '--chat-text': string;
    '--chat-text-muted': string;
    '--chat-border': string;
  };
}> = { /* concrete oklch/hex values */ };

export const LIGHT_KEYS: ThemeKey[] = ['classic', 'parchment'];
export const DARK_KEYS:  ThemeKey[] = ['midnight', 'slate'];
```

### Config API

`GET /api/widget/[id]/config` adds three fields to the existing payload:

```ts
{
  // ...existing fields (name, widgetColor, avatarUrl, greeting, cookielessMode, ...)
  themeMode: 'light' | 'dark' | 'auto';
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
}
```

Edge cache TTL stays at 60s.

### Theming Mechanism

The chat page root (`app/chat/[id]/page.tsx`) sets `data-ba-theme` on its outermost div. A scoped CSS file (`app/chat/[id]/theme.css`) maps each theme key to CSS custom properties:

```css
[data-ba-theme="classic"]   { --chat-bg: #ffffff; --chat-surface: #f3f4f6; ... }
[data-ba-theme="parchment"] { --chat-bg: #fdf9f1; --chat-surface: #f5eed9; ... }
[data-ba-theme="midnight"]  { --chat-bg: #0f172a; --chat-surface: #1e293b; ... }
[data-ba-theme="slate"]     { --chat-bg: #1c1917; --chat-surface: #292524; ... }
```

Chat components replace hard-coded `bg-muted` / `text-muted-foreground` / `border` references with `bg-[var(--chat-bg)]` / `text-[var(--chat-text)]` / `border-[var(--chat-border)]`. Affected files:

- `components/chat/chat-window.tsx`
- `components/chat/chat-input.tsx`
- `components/chat/message-bubble.tsx`
- `components/chat/content-card.tsx`

Approximately 30-50 className edits total across these four files.

**Why not reuse the app-wide `.dark` class / `next-themes`:**
- The dashboard already uses that system. Toggling `.dark` on the chat page's `<html>` would fight the dashboard's own theme if an owner ever opened chat and dashboard in adjacent tabs.
- The chat iframe is rendered in isolation — coupling to app-wide theming buys nothing and couples two features that can diverge.
- Scoped CSS vars make presets trivially swappable with one attribute change.

### Resolution Flow

A custom hook `apps/web/lib/hooks/use-chat-theme.ts`:

```ts
export function useChatTheme(config: {
  themeMode: 'light' | 'dark' | 'auto';
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
  assistantId: string;
  cookielessMode: boolean;
}): {
  themeKey: ThemeKey;
  isDark: boolean;
  toggle: () => void;
};
```

Resolution order on every render:

1. **Visitor override** (read synchronously in `useLayoutEffect` to prevent flash)
   - If `cookielessMode === false` → read `localStorage["ba-theme-" + assistantId]`
   - If value is `"light"` → return `themeLightPreset`
   - If value is `"dark"` → return `themeDarkPreset`
2. **Owner's `themeMode`**
   - `"light"` → `themeLightPreset`
   - `"dark"` → `themeDarkPreset`
   - `"auto"` → check `window.matchMedia('(prefers-color-scheme: dark)')`; pick dark or light preset accordingly
3. **Fallback** (should be unreachable): `'classic'`

`toggle()` flips between the owner's light and dark preset, writes the new `"light"` / `"dark"` string to `localStorage` (if not cookieless), and updates in-memory state.

### Persistence

| `cookielessMode` | Visitor override storage | Lifetime |
|---|---|---|
| `false` (default) | `localStorage["ba-theme-" + assistantId]` = `"light"` / `"dark"` | Until cleared |
| `true` | React state only | Current page session |

Matches the existing pattern in `chat-window.tsx:100` for session IDs.

---

## UI Surfaces

### Dashboard — `components/dashboard/customer-detail.tsx`

New "Chat theme" block inside the existing **Appearance** section (same column as Color and Avatar):

```
┌─ Chat theme ──────────────────────────────────────────┐
│  Default mode:  ( ) Light   (•) Dark   ( ) Auto (OS)  │
│                                                       │
│  Light preset:                                        │
│    ┌──────────┐  ┌───────────┐                        │
│    │ Classic  │  │ Parchment │                        │
│    │ [bubble] │  │ [bubble]  │                        │
│    └──────────┘  └───────────┘                        │
│                                                       │
│  Dark preset:                                         │
│    ┌──────────┐  ┌──────────┐                         │
│    │ Midnight │  │ Slate    │                         │
│    │ [bubble] │  │ [bubble] │                         │
│    └──────────┘  └──────────┘                         │
│                                                       │
│  Live preview: [miniature of a message pair]          │
└───────────────────────────────────────────────────────┘
```

- Each tile is ~80×60 px showing the preset's real background, a mock assistant bubble, and a mock user bubble (using `widgetColor`)
- Selected tile gets a 2px ring using `widgetColor`
- Live preview updates in real time as the owner changes any of the three values — no save button needed to see the effect
- Save submits with the existing customer-detail form handler; three new fields get added to the existing PATCH payload

Per CLAUDE.md React rules: named handlers (`handleThemeModeChange`, `handleLightPresetSelect`, `handleDarkPresetSelect`) — no inline arrows. If the customer-detail file exceeds ~200 lines after the addition, split the theme block into `components/dashboard/customer-detail/theme-picker.tsx`.

### Chat iframe — `components/chat/chat-window.tsx`

New icon button inserted in the header's right-side cluster, immediately before the existing close button (`chat-window.tsx:608`):

- Shows **moon** icon when current resolved theme is light → tap = go dark
- Shows **sun** icon when current resolved theme is dark → tap = go light
- `aria-label="Switch to dark mode"` / `"Switch to light mode"`, `aria-pressed={isDark}`
- Styling matches the existing close button: `text-white/90 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`
- Handler: `handleThemeToggle` (named, not inline)

### What is not touched

- Launcher bubble rendered by `widget.js` — stays on `widgetColor` / white
- Loader inside iframe container (`widget.js:461`) — stays on white
- Dashboard's own theming (`next-themes` + app-wide `.dark`)
- Email templates, lead forms, dashboard surfaces outside the chat iframe

---

## Edge Cases

| Case | Behavior |
|---|---|
| Owner picks "Auto" but visitor's browser gives no `prefers-color-scheme` signal | Fall through to `themeLightPreset` |
| Owner changes preset while visitor has an open session | Config is fetched once per iframe load; visitor sees the new preset on their next page load (after the 60s edge cache invalidates). Not pushed live to open sessions. |
| `prefers-reduced-motion: reduce` | No fade/transition on theme swap; instant attribute change |
| First paint race (avoid light→dark flash) | `useChatTheme` reads `localStorage` + OS pref in `useLayoutEffect`; `data-ba-theme` is set before first render of chat children |
| Structured cards (`content-card.tsx`) | Use the same `--chat-*` vars, so they automatically restyle |
| Welcome banner, suggestion chips, escalation badges, AI-disclosure inline text | Audited in the implementation pass: anything with hard-coded `bg-muted` / `bg-gray-*` / `text-gray-*` / `border-*` in the four chat files gets swapped to `--chat-*` vars |
| `widgetColor` contrast with dark surface text | Header text stays white (already the case via `text-white`); user bubble uses `widgetColor` as background with white text (unchanged) |
| Missing theme columns in old DB rows | Migration sets defaults; config API defensively falls back to `'light'` / `'classic'` / `'midnight'` if nullish |

---

## Accessibility

- Every preset palette verified for **WCAG 2.1 AA** contrast:
  - `--chat-text` on `--chat-bg` ≥ 4.5:1
  - `--chat-text-muted` on `--chat-bg` ≥ 4.5:1 (treat as body text, not decorative)
  - `--chat-border` on `--chat-bg` ≥ 3:1 (UI component contrast)
- Toggle button: `aria-label`, `aria-pressed`, visible focus ring (white/70 on branded header)
- Dashboard preset tiles: keyboard accessible (tab + space/enter), selected state announced via `aria-checked` on a radiogroup role
- `prefers-reduced-motion` honored: no theme-transition animation

---

## Testing

- **Unit:** `use-chat-theme.ts` — all 9 combinations of `{themeMode} × {localStorage value | OS pref}` return expected `themeKey`. Tests also cover `cookielessMode=true` writing nothing to `localStorage`.
- **Integration:** `/api/widget/[id]/config` returns the three new fields. Backwards compat: endpoint still works for rows with nullish theme columns (returns defaults).
- **Visual / Playwright:** For each of the 4 presets, screenshot the chat with a sample conversation. Compare against stored baselines. Separate test for the header toggle flip.
- **A11y (axe-core):** Each preset passes `axe` contrast rules on a rendered chat page.

---

## Rollout

1. Ship migration + schema + config API (no UI, no visible change)
2. Ship preset palettes + theme CSS + chat component refactor — chat still defaults to `classic` / light for every existing tenant, so no visible change
3. Ship dashboard picker (owner can now change) + header toggle (visitor can now override)

Steps 1-2 are invisible to users. Step 3 is the visible release.

---

## File Inventory

| Path | Change |
|---|---|
| `apps/web/lib/db/schema.ts` | Add 3 columns to `assistants` |
| `supabase/migrations/` | New generated migration file |
| `apps/web/lib/db/queries.ts` | `getAssistantById` already returns the row; no change unless a new helper is needed |
| `apps/web/app/api/widget/[id]/config/route.ts` | Return 3 new fields |
| `apps/web/lib/theme/presets.ts` | **New** — preset definitions |
| `apps/web/lib/hooks/use-chat-theme.ts` | **New** — resolution hook |
| `apps/web/app/chat/[id]/page.tsx` | Pass new fields to `<ChatWindow>` |
| `apps/web/app/chat/[id]/theme.css` | **New** — `[data-ba-theme="..."]` blocks |
| `apps/web/components/chat/chat-window.tsx` | Add toggle button; swap tokens; set `data-ba-theme` |
| `apps/web/components/chat/chat-input.tsx` | Swap tokens |
| `apps/web/components/chat/message-bubble.tsx` | Swap tokens |
| `apps/web/components/chat/content-card.tsx` | Swap tokens |
| `apps/web/components/dashboard/customer-detail.tsx` | Add theme picker block |
| `packages/types/` | Add `ThemeKey` + theme config types |
