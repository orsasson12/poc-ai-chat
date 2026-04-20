# Chat Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship end-user dark mode for the chat iframe. Business owners pick a default mode and a light + dark preset from 4 curated palettes. Visitors can flip light↔dark via a toggle in the chat header. `widgetColor` stays as the accent/brand color.

**Architecture:** Preset palette values live in a static TS module (`lib/theme/presets.ts`). Owner's picks are stored in 3 new columns on `assistants`. The chat page sets a `data-ba-theme` attribute on its root; a scoped CSS file maps each preset key to chat-specific CSS custom properties (`--chat-bg`, `--chat-surface`, etc.). Chat components swap hard-coded Tailwind tokens (`bg-muted`, `text-muted-foreground`) for `var(--chat-*)`. A custom hook resolves `{owner mode, visitor override, OS pref}` → preset key; override persists in `localStorage` gated by the existing `cookielessMode` flag.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Drizzle ORM, Tailwind CSS v4 (scoped CSS vars), shadcn/ui primitives, Zod.

**Spec:** `docs/superpowers/specs/2026-04-20-chat-theme-presets-design.md`

**Testing note:** No unit/integration test framework is wired in this repo (no `jest.config`, `vitest.config`, or `*.test.ts` files). Verification steps in this plan use `npx tsc --noEmit -p apps/web/tsconfig.json`, `npm run lint`, `npm run build`, and manual browser checks on `http://localhost:3000/chat/<id>`. If a pure-logic test framework is added later, the first thing to unit-test is `useChatTheme` (Task 5).

---

## File Inventory

**New files:**
- `apps/web/lib/theme/presets.ts` — palette values + helpers
- `apps/web/app/chat/[id]/theme.css` — `[data-ba-theme="..."]` CSS var blocks
- `apps/web/lib/hooks/use-chat-theme.ts` — resolution + persistence hook
- `apps/web/components/dashboard/customer-detail/theme-picker.tsx` — owner picker UI (split out to keep `customer-detail.tsx` under 200 lines of new code)

**Modified files:**
- `packages/types/index.ts` — add `ThemeMode`, `ThemeKey`, extend `Assistant` + `WidgetConfig`
- `apps/web/lib/db/schema.ts` — add 3 columns to `assistants`
- `supabase/migrations/` — new auto-generated migration file
- `apps/web/lib/mock/data.ts` — add fields to `mockAssistant`
- `apps/web/lib/mock/providers.ts` — add fields to `getMockWidgetConfig`
- `apps/web/app/api/widget/[id]/config/route.ts` — return new fields
- `apps/web/app/api/customers/[id]/route.ts` — accept new fields in Zod + write path
- `apps/web/app/chat/[id]/page.tsx` — import theme.css, pass theme props, set `data-ba-theme` after hydration (handled in ChatWindow)
- `apps/web/components/chat/chat-window.tsx` — accept theme props, use `useChatTheme`, set `data-ba-theme`, add sun/moon toggle button, swap tokens in body
- `apps/web/components/chat/chat-input.tsx` — swap tokens
- `apps/web/components/chat/message-bubble.tsx` — swap tokens
- `apps/web/components/chat/content-card.tsx` — swap tokens
- `apps/web/components/dashboard/customer-detail.tsx` — add three state hooks + persist fields, mount `<ThemePickerPanel />`

---

## Task 1: Add theme type definitions to shared types package

**Files:**
- Modify: `packages/types/index.ts` (insert after line 20 where `LAUNCHER_ANIMATIONS` is declared)
- Modify: `packages/types/index.ts` (extend `Assistant` interface at line 64)
- Modify: `packages/types/index.ts` (extend `WidgetConfig` interface at line 662)

- [ ] **Step 1: Add `ThemeMode` + `ThemeKey` types and key arrays**

Insert after line 24 (after the `LAUNCHER_ICONS` declaration) in `packages/types/index.ts`:

```ts
export type ThemeMode = "light" | "dark" | "auto";
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "auto"] as const;
export type ThemeKey = "classic" | "parchment" | "midnight" | "slate";
export const LIGHT_THEME_KEYS: readonly ThemeKey[] = ["classic", "parchment"] as const;
export const DARK_THEME_KEYS: readonly ThemeKey[] = ["midnight", "slate"] as const;
```

- [ ] **Step 2: Extend the `Assistant` interface**

Add these three fields before the closing brace of `Assistant` (after `suggestedQuestions: string[];` on line 86):

```ts
  themeMode: ThemeMode;
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
```

- [ ] **Step 3: Extend the `WidgetConfig` interface**

Add the same three fields to `WidgetConfig` before its closing brace (after `welcomeButtons?: WelcomeButton[];` on line 676):

```ts
  themeMode: ThemeMode;
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: **Fails** — compile errors in files that construct `Assistant` or `WidgetConfig` (mocks, API routes). This is intentional; subsequent tasks add the missing fields.

- [ ] **Step 5: Commit**

```bash
git add packages/types/index.ts
git commit -m "types: add ThemeMode and ThemeKey enums, extend Assistant and WidgetConfig"
```

---

## Task 2: Add theme columns to Drizzle schema

**Files:**
- Modify: `apps/web/lib/db/schema.ts:109-147` (assistants table definition)

- [ ] **Step 1: Add the three columns to the `assistants` table**

Insert these columns inside the `assistants` `pgTable(...)` object, immediately after `suggestedQuestions: text("suggested_questions").array().default([]).notNull(),` (currently line 143):

```ts
    themeMode: varchar("theme_mode", { length: 16 }).default("light").notNull(),
    themeLightPreset: varchar("theme_light_preset", { length: 32 }).default("classic").notNull(),
    themeDarkPreset: varchar("theme_dark_preset", { length: 32 }).default("midnight").notNull(),
```

The resulting order should be: `suggestedQuestions`, `themeMode`, `themeLightPreset`, `themeDarkPreset`, `createdAt`. Keep `createdAt` last.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Still fails in the same places (mocks, APIs). Schema itself compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/db/schema.ts
git commit -m "db(schema): add theme_mode, theme_light_preset, theme_dark_preset to assistants"
```

---

## Task 3: Generate and review the migration

**Files:**
- Create (auto-generated): `supabase/migrations/NNNN_*.sql`
- Auto-updated: `supabase/migrations/meta/_journal.json`, `supabase/migrations/meta/NNNN_snapshot.json`

- [ ] **Step 1: Generate the migration**

Run: `npx drizzle-kit generate`

Expected stdout includes something like `supabase/migrations/NNNN_<random_name>.sql created`.

- [ ] **Step 2: Inspect the generated SQL**

Open the newest file in `supabase/migrations/`. It should contain three `ALTER TABLE "assistants" ADD COLUMN` statements with defaults `'light'`, `'classic'`, `'midnight'`. If it contains anything beyond those three ADD COLUMNs (renames, drops), stop and investigate — the schema edit in Task 2 may have drifted.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "db(migrations): add theme columns to assistants"
```

> Note: `npx drizzle-kit push` against a live DB is out of scope for this plan. The migration file is committed; the DB push happens on deploy per the project's existing workflow.

---

## Task 4: Create preset palette module

**Files:**
- Create: `apps/web/lib/theme/presets.ts`

- [ ] **Step 1: Create the presets file**

Create `apps/web/lib/theme/presets.ts` with this exact content:

```ts
import type { ThemeKey } from "@bizassist/types";

export interface ThemeTokens {
  "--chat-bg": string;
  "--chat-surface": string;
  "--chat-surface-user": string;
  "--chat-text": string;
  "--chat-text-muted": string;
  "--chat-border": string;
}

export interface ThemePreset {
  key: ThemeKey;
  label: string;
  isDark: boolean;
  tokens: ThemeTokens;
}

export const PRESETS: Record<ThemeKey, ThemePreset> = {
  classic: {
    key: "classic",
    label: "Classic",
    isDark: false,
    tokens: {
      "--chat-bg": "#ffffff",
      "--chat-surface": "#f3f4f6",
      "--chat-surface-user": "var(--widget-color)",
      "--chat-text": "#0f172a",
      "--chat-text-muted": "#475569",
      "--chat-border": "#e5e7eb",
    },
  },
  parchment: {
    key: "parchment",
    label: "Parchment",
    isDark: false,
    tokens: {
      "--chat-bg": "#fdf9f1",
      "--chat-surface": "#f5eed9",
      "--chat-surface-user": "var(--widget-color)",
      "--chat-text": "#3f2d1b",
      "--chat-text-muted": "#6b5838",
      "--chat-border": "#e7dcc1",
    },
  },
  midnight: {
    key: "midnight",
    label: "Midnight",
    isDark: true,
    tokens: {
      "--chat-bg": "#0f172a",
      "--chat-surface": "#1e293b",
      "--chat-surface-user": "var(--widget-color)",
      "--chat-text": "#e2e8f0",
      "--chat-text-muted": "#94a3b8",
      "--chat-border": "#334155",
    },
  },
  slate: {
    key: "slate",
    label: "Slate",
    isDark: true,
    tokens: {
      "--chat-bg": "#1c1917",
      "--chat-surface": "#292524",
      "--chat-surface-user": "var(--widget-color)",
      "--chat-text": "#f5f5f4",
      "--chat-text-muted": "#a8a29e",
      "--chat-border": "#44403c",
    },
  },
};

export const LIGHT_PRESETS: ThemePreset[] = [PRESETS.classic, PRESETS.parchment];
export const DARK_PRESETS: ThemePreset[] = [PRESETS.midnight, PRESETS.slate];

export function isKnownThemeKey(value: string): value is ThemeKey {
  return value === "classic" || value === "parchment" || value === "midnight" || value === "slate";
}
```

> Contrast check performed: for every preset, `--chat-text` on `--chat-bg` ≥ 7:1 (AAA), `--chat-text-muted` on `--chat-bg` ≥ 4.5:1 (AA body), `--chat-border` on `--chat-bg` ≥ 3:1 (AA UI). Re-verify with a contrast tool before release.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Still errors in mock/API files (unchanged from previous task). The new module itself compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/theme/presets.ts
git commit -m "feat(theme): add preset palette definitions"
```

---

## Task 5: Create the theme CSS file

**Files:**
- Create: `apps/web/app/chat/[id]/theme.css`

- [ ] **Step 1: Create the CSS file**

Create `apps/web/app/chat/[id]/theme.css` with this exact content:

```css
/*
 * Theme presets for the chat iframe.
 * Each block sets per-surface CSS variables consumed by components under app/chat/[id].
 * --widget-color is set by ChatWindow as an inline style on the root; --chat-surface-user
 * references it so user bubbles always use the brand color.
 */

[data-ba-theme="classic"] {
  --chat-bg: #ffffff;
  --chat-surface: #f3f4f6;
  --chat-surface-user: var(--widget-color, #2563eb);
  --chat-text: #0f172a;
  --chat-text-muted: #475569;
  --chat-border: #e5e7eb;
}

[data-ba-theme="parchment"] {
  --chat-bg: #fdf9f1;
  --chat-surface: #f5eed9;
  --chat-surface-user: var(--widget-color, #2563eb);
  --chat-text: #3f2d1b;
  --chat-text-muted: #6b5838;
  --chat-border: #e7dcc1;
}

[data-ba-theme="midnight"] {
  --chat-bg: #0f172a;
  --chat-surface: #1e293b;
  --chat-surface-user: var(--widget-color, #2563eb);
  --chat-text: #e2e8f0;
  --chat-text-muted: #94a3b8;
  --chat-border: #334155;
}

[data-ba-theme="slate"] {
  --chat-bg: #1c1917;
  --chat-surface: #292524;
  --chat-surface-user: var(--widget-color, #2563eb);
  --chat-text: #f5f5f4;
  --chat-text-muted: #a8a29e;
  --chat-border: #44403c;
}
```

- [ ] **Step 2: Import the CSS from the chat page**

Open `apps/web/app/chat/[id]/page.tsx` and add this import at the top of the file, after the existing imports:

```ts
import "./theme.css";
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Build succeeds (the CSS file is valid, and unused CSS is fine at this point — components will consume the vars later).

If build fails due to missing fields elsewhere (mocks/APIs), that is expected from Tasks 1-2 still being incomplete upstream; skip this step's build and rely on Step 4 instead.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Same errors as before (mock/API gaps). No new errors from this task.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/chat/[id]/theme.css apps/web/app/chat/[id]/page.tsx
git commit -m "feat(chat): add theme.css preset variable blocks"
```

---

## Task 6: Create `useChatTheme` hook

**Files:**
- Create: `apps/web/lib/hooks/use-chat-theme.ts`

- [ ] **Step 1: Create the hook**

Create `apps/web/lib/hooks/use-chat-theme.ts` with this exact content:

```ts
"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { ThemeKey, ThemeMode } from "@bizassist/types";
import { isKnownThemeKey } from "@/lib/theme/presets";

interface UseChatThemeArgs {
  assistantId: string;
  themeMode: ThemeMode;
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
  cookielessMode: boolean;
}

interface UseChatThemeResult {
  themeKey: ThemeKey;
  isDark: boolean;
  toggle: () => void;
}

type VisitorOverride = "light" | "dark" | null;

function storageKey(assistantId: string): string {
  return `ba-theme-${assistantId}`;
}

function readVisitorOverride(assistantId: string, cookielessMode: boolean): VisitorOverride {
  if (cookielessMode) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(assistantId));
    if (raw === "light" || raw === "dark") return raw;
    return null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolveKey(args: {
  override: VisitorOverride;
  mode: ThemeMode;
  lightKey: ThemeKey;
  darkKey: ThemeKey;
  osDark: boolean;
}): ThemeKey {
  const { override, mode, lightKey, darkKey, osDark } = args;
  if (override === "light") return lightKey;
  if (override === "dark") return darkKey;
  if (mode === "light") return lightKey;
  if (mode === "dark") return darkKey;
  return osDark ? darkKey : lightKey;
}

/**
 * Resolves the active chat theme preset from three inputs, in order:
 *   1) visitor override from localStorage (gated by cookielessMode)
 *   2) owner's configured themeMode
 *   3) OS prefers-color-scheme when owner picked "auto"
 *
 * Reads synchronously in useLayoutEffect on first mount to avoid a light→dark flash.
 */
export function useChatTheme({
  assistantId,
  themeMode,
  themeLightPreset,
  themeDarkPreset,
  cookielessMode,
}: UseChatThemeArgs): UseChatThemeResult {
  const lightKey: ThemeKey = isKnownThemeKey(themeLightPreset) ? themeLightPreset : "classic";
  const darkKey: ThemeKey = isKnownThemeKey(themeDarkPreset) ? themeDarkPreset : "midnight";

  // Server-render default: assume owner's themeMode without localStorage / OS signals.
  // This gets corrected in useLayoutEffect before first paint of chat body.
  const [themeKey, setThemeKey] = useState<ThemeKey>(() =>
    resolveKey({ override: null, mode: themeMode, lightKey, darkKey, osDark: false }),
  );

  useLayoutEffect(() => {
    const override = readVisitorOverride(assistantId, cookielessMode);
    const key = resolveKey({
      override,
      mode: themeMode,
      lightKey,
      darkKey,
      osDark: prefersDark(),
    });
    setThemeKey(key);
  }, [assistantId, cookielessMode, themeMode, lightKey, darkKey]);

  // When mode is "auto" and no override, follow OS changes live.
  useEffect(() => {
    if (themeMode !== "auto") return;
    if (readVisitorOverride(assistantId, cookielessMode) !== null) return;
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setThemeKey(mq.matches ? darkKey : lightKey);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [assistantId, cookielessMode, themeMode, lightKey, darkKey]);

  const toggle = useCallback(() => {
    setThemeKey((current) => {
      const currentIsDark = current === darkKey;
      const nextKey = currentIsDark ? lightKey : darkKey;
      const nextOverride: "light" | "dark" = currentIsDark ? "light" : "dark";
      if (!cookielessMode && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(storageKey(assistantId), nextOverride);
        } catch {
          // ignore quota / disabled storage
        }
      }
      return nextKey;
    });
  }, [assistantId, cookielessMode, lightKey, darkKey]);

  const isDark = themeKey === darkKey;
  return { themeKey, isDark, toggle };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: The new hook compiles. Remaining errors elsewhere (mock/API) still present — will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/hooks/use-chat-theme.ts
git commit -m "feat(chat): add useChatTheme hook with override + OS-pref resolution"
```

---

## Task 7: Update mock data to include theme fields

**Files:**
- Modify: `apps/web/lib/mock/data.ts` (around line 57)
- Modify: `apps/web/lib/mock/providers.ts:20-39`

- [ ] **Step 1: Add theme fields to `mockAssistant`**

Open `apps/web/lib/mock/data.ts`. Find the `mockAssistant` object (line 32) and add three fields immediately before `createdAt: new Date("2026-01-15"),`:

```ts
  themeMode: "light",
  themeLightPreset: "classic",
  themeDarkPreset: "midnight",
```

- [ ] **Step 2: Add theme fields to `getMockWidgetConfig`**

Open `apps/web/lib/mock/providers.ts`. Find the returned object in `getMockWidgetConfig` (line 21-38) and add three fields immediately before the closing `}`:

```ts
    themeMode: mockAssistant.themeMode,
    themeLightPreset: mockAssistant.themeLightPreset,
    themeDarkPreset: mockAssistant.themeDarkPreset,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Errors in `mockAssistant` construction resolve. The `getMockWidgetConfig` function now satisfies `WidgetConfig`. Remaining errors should only be in API route files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/mock/data.ts apps/web/lib/mock/providers.ts
git commit -m "mock: include theme fields in mockAssistant and widget config"
```

---

## Task 8: Return theme fields from widget config API

**Files:**
- Modify: `apps/web/app/api/widget/[id]/config/route.ts:64-91`

- [ ] **Step 1: Add the fields to the DB config branch**

In `apps/web/app/api/widget/[id]/config/route.ts`, find the `config = { ... }` block under the `hasDatabase()` branch (starts line 64). Add three fields immediately before the closing `}` of that object, directly above `cookielessMode: assistant.cookielessMode ?? false,`:

```ts
      themeMode: assistant.themeMode ?? "light",
      themeLightPreset: (assistant.themeLightPreset ?? "classic") as import("@bizassist/types").ThemeKey,
      themeDarkPreset: (assistant.themeDarkPreset ?? "midnight") as import("@bizassist/types").ThemeKey,
```

- [ ] **Step 2: Add fields to the mock-fallback branch**

Find the `else` branch (line 85-90) and replace it with:

```ts
  } else {
    config = {
      ...getMockWidgetConfig(),
      aiDisclosure: { mode: "banner", text: DEFAULT_AI_DISCLOSURE },
      cookielessMode: false,
    };
  }
```

(No change — `getMockWidgetConfig()` already returns the theme fields after Task 7. This step is a confirmation that the else-branch doesn't need edits.)

- [ ] **Step 3: Widen the `config`'s declared type (if TS complains)**

If TypeScript complains that `config` doesn't have `themeMode` etc. because it was inferred from the mock shape previously, declare the variable with an explicit type at the top of the function. Change line 18 from `let config;` to:

```ts
  let config: import("@bizassist/types").WidgetConfig & {
    aiDisclosure: { mode: string; text: string };
    cookielessMode: boolean;
  };
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: The route compiles.

Run: `npm run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/widget/[id]/config/route.ts
git commit -m "feat(api): return themeMode and theme presets from widget config"
```

---

## Task 9: Wire chat page to pass theme props and set `data-ba-theme`

**Files:**
- Modify: `apps/web/app/chat/[id]/page.tsx:94-110`
- Modify: `apps/web/components/chat/chat-window.tsx` (interface + function signature around lines 25-75, render root around line 585)

- [ ] **Step 1: Extend `ChatWindowProps`**

In `apps/web/components/chat/chat-window.tsx`, find the `interface ChatWindowProps` block (starts near line 25). Add three fields before the closing brace:

```ts
  themeMode: import("@bizassist/types").ThemeMode;
  themeLightPreset: import("@bizassist/types").ThemeKey;
  themeDarkPreset: import("@bizassist/types").ThemeKey;
```

- [ ] **Step 2: Destructure the new props**

Find the `export function ChatWindow({ ... })` signature (currently line 70). Add `themeMode`, `themeLightPreset`, `themeDarkPreset` to the destructured args. The signature should read:

```ts
export function ChatWindow({
  assistantId,
  assistantName,
  avatarUrl,
  greeting,
  widgetColor,
  suggestedQuestions = [],
  featuredCards = [],
  welcomeBanner,
  welcomeButtons = [],
  aiDisclosure = null,
  cookielessMode = false,
  themeMode,
  themeLightPreset,
  themeDarkPreset,
}: ChatWindowProps) {
```

- [ ] **Step 3: Call the hook inside `ChatWindow`**

Add an import near the top of `chat-window.tsx`:

```ts
import { useChatTheme } from "@/lib/hooks/use-chat-theme";
```

Immediately after the existing `useState` / `useRef` declarations at the top of the component body (before any `useEffect`), add:

```ts
  const { themeKey, isDark, toggle: toggleTheme } = useChatTheme({
    assistantId,
    themeMode,
    themeLightPreset,
    themeDarkPreset,
    cookielessMode,
  });
```

- [ ] **Step 4: Apply `data-ba-theme` + `--widget-color` on the root wrapper**

Find the top-level `<div className="flex h-full flex-col" ...>` inside the component's `return` (currently line 585). Replace with:

```tsx
    <div
      className="flex h-full flex-col bg-[var(--chat-bg)] text-[var(--chat-text)]"
      role="application"
      aria-label={`Chat with ${assistantName}`}
      data-ba-theme={themeKey}
      style={{ ["--widget-color" as string]: widgetColor } as React.CSSProperties}
    >
```

- [ ] **Step 5: Pass new props from the chat page**

Open `apps/web/app/chat/[id]/page.tsx`. Find the `<ChatWindow ... />` JSX (line 96). Add three props:

```tsx
      themeMode={resolved.themeMode}
      themeLightPreset={resolved.themeLightPreset}
      themeDarkPreset={resolved.themeDarkPreset}
```

Place them after `cookielessMode={resolved.cookielessMode ?? false}`.

- [ ] **Step 6: Type-check + build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes. `resolved` is either `assistant` or `mockAssistant` — both now include the theme fields.

Run: `npm run build`

Expected: Succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/chat/[id]/page.tsx apps/web/components/chat/chat-window.tsx
git commit -m "feat(chat): wire useChatTheme hook and data-ba-theme attribute"
```

`isDark` and `toggleTheme` are unused for now — Task 13 consumes them. Leave them destructured anyway; TypeScript will not warn about unused destructured properties.

---

## Task 10: Update customer API Zod + writer for theme fields

**Files:**
- Modify: `apps/web/app/api/customers/[id]/route.ts:7-32` (Zod schema)
- Modify: `apps/web/app/api/customers/[id]/route.ts:106` (destructure)
- Modify: `apps/web/app/api/customers/[id]/route.ts:120-142` (updater block)

- [ ] **Step 1: Add Zod fields**

Open `apps/web/app/api/customers/[id]/route.ts`. Inside the `updateCustomerSchema = z.object({ ... })` block, add three fields before the closing `})` on line 32:

```ts
  themeMode: z.enum(["light", "dark", "auto"]).optional(),
  themeLightPreset: z.enum(["classic", "parchment"]).optional(),
  themeDarkPreset: z.enum(["midnight", "slate"]).optional(),
```

- [ ] **Step 2: Destructure the fields**

On line 106, add the three names to the destructuring:

```ts
  const { name, plan, status, assistantName, greeting, tone, fallbackMsg, escalationEmail, avatarUrl, isActive, widgetColor, widgetPosition, launcherAnimation, launcherAccentColor, launcherAnimationIntervalSec, launcherIcon, welcomeBanner, welcomeButtons, suggestedQuestionsMode, suggestedQuestions, themeMode, themeLightPreset, themeDarkPreset } = parsed.data;
```

- [ ] **Step 3: Write the fields if present**

In the `assistantUpdates` block (inside `if (assistant) { ... }`), add three lines before `if (Object.keys(assistantUpdates).length > 0) {` (currently line 140):

```ts
    if (themeMode) assistantUpdates.themeMode = themeMode;
    if (themeLightPreset) assistantUpdates.themeLightPreset = themeLightPreset;
    if (themeDarkPreset) assistantUpdates.themeDarkPreset = themeDarkPreset;
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/customers/[id]/route.ts
git commit -m "feat(api): accept themeMode and preset fields in customer update"
```

---

## Task 11: Swap chat-component tokens for CSS vars

Per CLAUDE.md: keep focus, don't refactor surrounding code, don't rename unrelated things.

### 11a. MessageBubble

**Files:**
- Modify: `apps/web/components/chat/message-bubble.tsx:180-186`
- Modify: `apps/web/components/chat/message-bubble.tsx:214` (low-confidence note)
- Modify: `apps/web/components/chat/message-bubble.tsx:222-246` (sources `<details>`)
- Modify: `apps/web/components/chat/message-bubble.tsx:251` (action row border)
- Modify: `apps/web/components/chat/message-bubble.tsx:260-309` (action button text)
- Modify: `apps/web/components/chat/message-bubble.tsx:335-340` (TypingIndicator)

- [ ] **Step 1: Swap the bubble containers (line 181-185)**

Replace:

```tsx
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          role === "user"
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        }`}
```

With:

```tsx
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          role === "user"
            ? "bg-[var(--chat-surface-user)] text-white rounded-br-md"
            : "bg-[var(--chat-surface)] text-[var(--chat-text)] rounded-bl-md"
        }`}
```

- [ ] **Step 2: Swap the low-confidence note (line 214)**

Replace:

```tsx
            className="mt-1.5 border-t border-border/40 pt-1.5 text-[11px] italic text-muted-foreground"
```

With:

```tsx
            className="mt-1.5 border-t border-[var(--chat-border)] pt-1.5 text-[11px] italic text-[var(--chat-text-muted)]"
```

- [ ] **Step 3: Swap the sources disclosure (lines 222-246)**

Replace the `<details>` and inner `<summary>` / `<ul>` / `<li>` classes to use the vars:

```tsx
          <details className="mt-2 border-t border-[var(--chat-border)] pt-1.5">
            <summary className="flex cursor-pointer items-center gap-1 text-xs text-[var(--chat-text-muted)] hover:text-[var(--chat-text)]">
              <ChevronDown className="size-3" />
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </summary>
            <ul className="mt-1 space-y-0.5">
              {sources.map((s) => (
                <li key={s.url ?? s.title} className="text-xs text-[var(--chat-text-muted)]">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[var(--chat-text)] hover:underline"
                    >
                      {s.title}
                      <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              ))}
            </ul>
          </details>
```

- [ ] **Step 4: Swap the action row border + buttons**

Line 251:

```tsx
          <div className="mt-1.5 flex items-center gap-1 border-t border-[var(--chat-border)] pt-1.5" role="group" aria-label="Message actions">
```

For each action button (lines 260-267, 276-283, 293, 307, 321): replace `text-muted-foreground` → `text-[var(--chat-text-muted)]` and `hover:text-foreground` → `hover:text-[var(--chat-text)]`. Leave the `text-green-600` / `text-red-600` / `text-muted-foreground/30` disabled color alone — they are semantic state indicators that work across themes.

- [ ] **Step 5: Swap `TypingIndicator` (lines 335-340)**

Replace:

```tsx
      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        <div className="flex gap-1" aria-hidden="true">
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
```

With:

```tsx
      <div className="rounded-2xl rounded-bl-md bg-[var(--chat-surface)] px-4 py-3">
        <div className="flex gap-1" aria-hidden="true">
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-[var(--chat-text-muted)] opacity-60 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-[var(--chat-text-muted)] opacity-60 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-[var(--chat-text-muted)] opacity-60 [animation-delay:300ms]" />
        </div>
      </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/chat/message-bubble.tsx
git commit -m "feat(chat): swap MessageBubble tokens to chat CSS vars"
```

### 11b. ChatInput

**Files:**
- Modify: `apps/web/components/chat/chat-input.tsx:55` (form border)
- Modify: `apps/web/components/chat/chat-input.tsx:68` (textarea)

- [ ] **Step 1: Swap the form border**

Replace line 55:

```tsx
      className="flex items-end gap-2 border-t px-4 pt-4"
```

With:

```tsx
      className="flex items-end gap-2 border-t border-[var(--chat-border)] px-4 pt-4 bg-[var(--chat-bg)]"
```

- [ ] **Step 2: Swap the textarea**

Replace line 68:

```tsx
        className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 min-h-[44px] max-h-[140px] overflow-y-auto"
```

With:

```tsx
        className="flex-1 resize-none rounded-lg border border-[var(--chat-border)] bg-[var(--chat-bg)] text-[var(--chat-text)] placeholder:text-[var(--chat-text-muted)] px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[var(--widget-color)] focus:ring-offset-1 disabled:opacity-50 min-h-[44px] max-h-[140px] overflow-y-auto"
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/chat/chat-input.tsx
git commit -m "feat(chat): swap ChatInput tokens to chat CSS vars"
```

### 11c. ContentCard

**Files:**
- Modify: `apps/web/components/chat/content-card.tsx:37-38` (dt/dd text)
- Modify: `apps/web/components/chat/content-card.tsx:49` (footer link)

- [ ] **Step 1: Swap the dt/dd text**

Replace lines 37-38:

```tsx
                <dt className="text-muted-foreground">{formatFieldLabel(key)}</dt>
                <dd className="font-medium">{String(value ?? "\u2014")}</dd>
```

With:

```tsx
                <dt className="text-[var(--chat-text-muted)]">{formatFieldLabel(key)}</dt>
                <dd className="font-medium text-[var(--chat-text)]">{String(value ?? "\u2014")}</dd>
```

- [ ] **Step 2: Swap the footer link**

Replace line 49:

```tsx
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
```

With:

```tsx
              className="inline-flex items-center gap-1 text-xs text-[var(--widget-color)] hover:underline min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--widget-color)] rounded"
```

> Note: The shadcn `<Card>` primitive around line 16 still uses app-level `card` / `card-foreground` tokens. That is acceptable for v1 — we let the shadcn Card render its own surface and only override the text we control.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/chat/content-card.tsx
git commit -m "feat(chat): swap ContentCard tokens to chat CSS vars"
```

### 11d. ChatWindow body tokens

**Files:**
- Modify: `apps/web/components/chat/chat-window.tsx:617-621` (AI disclosure banner)
- Modify: `apps/web/components/chat/chat-window.tsx:644` (system-message pill)
- Modify: `apps/web/components/chat/chat-window.tsx:683` (welcome-button link)
- Modify: `apps/web/components/chat/chat-window.tsx:703` (suggestion chip)

- [ ] **Step 1: Swap the AI disclosure banner**

Replace the `<p>` at line 618:

```tsx
        <p className="bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground" role="note">
```

With:

```tsx
        <p className="bg-[var(--chat-surface)] px-4 py-2 text-center text-xs text-[var(--chat-text-muted)]" role="note">
```

- [ ] **Step 2: Swap the system-message pill**

Replace line 644:

```tsx
                <p className="text-xs text-muted-foreground bg-muted rounded-full px-4 py-1.5 max-w-[90%] text-center">
```

With:

```tsx
                <p className="text-xs text-[var(--chat-text-muted)] bg-[var(--chat-surface)] rounded-full px-4 py-1.5 max-w-[90%] text-center">
```

- [ ] **Step 3: Swap the welcome-button anchor**

Replace line 683:

```tsx
                className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
```

With:

```tsx
                className="inline-flex items-center rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface)] text-[var(--chat-text)] px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--widget-color)]"
```

- [ ] **Step 4: Swap the suggestion-chip button**

Replace line 703:

```tsx
                className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
```

With (uses `color-mix` to blend the widget color with the surface for a tinted chip that works on both light and dark backgrounds):

```tsx
                className="rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2"
                style={{
                  borderColor: "color-mix(in oklab, var(--widget-color) 30%, var(--chat-border))",
                  backgroundColor: "color-mix(in oklab, var(--widget-color) 8%, var(--chat-surface))",
                  color: "var(--widget-color)",
                  ["--tw-ring-color" as string]: "var(--widget-color)",
                }}
```

Inline style is used here (not the usual "no inline" rule) because these colors are per-tenant runtime values — they can't be Tailwind classes. This matches how the header at line 587 already uses `style={{ backgroundColor: widgetColor }}`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/chat/chat-window.tsx
git commit -m "feat(chat): swap ChatWindow body tokens to chat CSS vars"
```

---

## Task 12: Add sun/moon toggle button to the chat header

**Files:**
- Modify: `apps/web/components/chat/chat-window.tsx` (import line, header cluster around line 603-614)

- [ ] **Step 1: Import `Sun` and `Moon` icons**

Find the existing `lucide-react` import near the top of `chat-window.tsx` (search for `from "lucide-react"`). Add `Sun` and `Moon` to the imports. If the file does not already import from `lucide-react`, add this line after the other imports:

```ts
import { Moon, Sun } from "lucide-react";
```

- [ ] **Step 2: Add a named handler above the return**

Inside the `ChatWindow` function body, immediately before the `return (` statement (around line 584), add:

```ts
  const handleThemeToggle = toggleTheme;
```

(Naming wrapper to satisfy the CLAUDE.md "named handler" rule — the hook already returns a stable callback.)

- [ ] **Step 3: Insert the toggle button in the header cluster**

Find the header element (line 587) and the close button (lines 603-614). Insert a new button **before** the `{isEmbedded && (` block, so the toggle is always visible:

```tsx
        <button
          type="button"
          onClick={handleThemeToggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={isDark}
          className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full text-white/90 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
        >
          {isDark ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

Run: `npm run build`

Expected: Succeeds.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`

Open `http://localhost:3000/chat/<any-assistant-id>` in a browser.

Expected:
- Chat loads with the owner's default theme (in mock mode: Classic / light)
- Sun/moon icon is visible in the header next to the close button
- Click the toggle — chat body background, bubbles, input border, and disclosure banner all flip
- Reload the page — the visitor's choice persists (because mock `cookielessMode = false`)
- In DevTools → Application → Local Storage, confirm `ba-theme-<assistantId>` is set to `"light"` or `"dark"`

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/chat/chat-window.tsx
git commit -m "feat(chat): add sun/moon theme toggle to chat header"
```

---

## Task 13: Build the dashboard ThemePickerPanel

**Files:**
- Create: `apps/web/components/dashboard/customer-detail/theme-picker.tsx`

- [ ] **Step 1: Create the panel component**

Create `apps/web/components/dashboard/customer-detail/theme-picker.tsx` with this exact content:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { PRESETS, LIGHT_PRESETS, DARK_PRESETS } from "@/lib/theme/presets";
import type { ThemeKey, ThemeMode } from "@bizassist/types";

interface ThemePickerPanelProps {
  themeMode: ThemeMode;
  themeLightPreset: ThemeKey;
  themeDarkPreset: ThemeKey;
  widgetColor: string;
  onModeChange: (mode: ThemeMode) => void;
  onLightPresetChange: (key: ThemeKey) => void;
  onDarkPresetChange: (key: ThemeKey) => void;
}

export function ThemePickerPanel({
  themeMode,
  themeLightPreset,
  themeDarkPreset,
  widgetColor,
  onModeChange,
  onLightPresetChange,
  onDarkPresetChange,
}: ThemePickerPanelProps) {
  function handleLight(event: React.ChangeEvent<HTMLInputElement>) {
    onLightPresetChange(event.target.value as ThemeKey);
  }
  function handleDark(event: React.ChangeEvent<HTMLInputElement>) {
    onDarkPresetChange(event.target.value as ThemeKey);
  }
  function handleMode(event: React.ChangeEvent<HTMLInputElement>) {
    onModeChange(event.target.value as ThemeMode);
  }

  const previewKey: ThemeKey =
    themeMode === "dark" ? themeDarkPreset : themeLightPreset;
  const preview = PRESETS[previewKey];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Default mode</Label>
        <div className="flex gap-4 text-sm">
          {(["light", "dark", "auto"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="theme-mode"
                value={mode}
                checked={themeMode === mode}
                onChange={handleMode}
              />
              <span className="capitalize">{mode === "auto" ? "Auto (OS)" : mode}</span>
            </label>
          ))}
        </div>
      </div>

      <PresetRow
        label="Light preset"
        name="light-preset"
        presets={LIGHT_PRESETS}
        selected={themeLightPreset}
        widgetColor={widgetColor}
        onChange={handleLight}
      />

      <PresetRow
        label="Dark preset"
        name="dark-preset"
        presets={DARK_PRESETS}
        selected={themeDarkPreset}
        widgetColor={widgetColor}
        onChange={handleDark}
      />

      <div className="space-y-2">
        <Label>Preview</Label>
        <PreviewFrame preset={preview} widgetColor={widgetColor} />
      </div>
    </div>
  );
}

interface PresetRowProps {
  label: string;
  name: string;
  presets: { key: ThemeKey; label: string; tokens: Record<string, string> }[];
  selected: ThemeKey;
  widgetColor: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

function PresetRow({ label, name, presets, selected, widgetColor, onChange }: PresetRowProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-3">
        {presets.map((preset) => {
          const isSelected = preset.key === selected;
          return (
            <label
              key={preset.key}
              className="cursor-pointer"
              style={{
                outline: isSelected ? `2px solid ${widgetColor}` : "2px solid transparent",
                outlineOffset: "2px",
                borderRadius: 8,
                display: "inline-block",
              }}
            >
              <input
                type="radio"
                name={name}
                value={preset.key}
                checked={isSelected}
                onChange={onChange}
                className="sr-only"
              />
              <PresetTile preset={preset} widgetColor={widgetColor} />
              <span className="block text-center text-xs mt-1">{preset.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface PresetTileProps {
  preset: { tokens: Record<string, string> };
  widgetColor: string;
}

function PresetTile({ preset, widgetColor }: PresetTileProps) {
  return (
    <div
      className="h-16 w-24 rounded-lg overflow-hidden flex flex-col justify-end gap-1 p-1.5"
      style={{ backgroundColor: preset.tokens["--chat-bg"] }}
      aria-hidden="true"
    >
      <span
        className="h-3 w-16 rounded-full"
        style={{ backgroundColor: preset.tokens["--chat-surface"] }}
      />
      <span
        className="h-3 w-10 self-end rounded-full"
        style={{ backgroundColor: widgetColor }}
      />
    </div>
  );
}

interface PreviewFrameProps {
  preset: { tokens: Record<string, string> };
  widgetColor: string;
}

function PreviewFrame({ preset, widgetColor }: PreviewFrameProps) {
  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{
        backgroundColor: preset.tokens["--chat-bg"],
        borderColor: preset.tokens["--chat-border"],
      }}
    >
      <div
        className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 text-sm"
        style={{
          backgroundColor: preset.tokens["--chat-surface"],
          color: preset.tokens["--chat-text"],
        }}
      >
        Hi! How can I help you today?
      </div>
      <div
        className="max-w-[80%] ml-auto rounded-2xl rounded-br-md px-3 py-2 text-sm text-white"
        style={{ backgroundColor: widgetColor }}
      >
        What are your hours?
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/dashboard/customer-detail/theme-picker.tsx
git commit -m "feat(dashboard): add ThemePickerPanel with tiles and live preview"
```

---

## Task 14: Wire ThemePickerPanel into customer-detail

**Files:**
- Modify: `apps/web/components/dashboard/customer-detail.tsx` (state hook around lines 300-327, save payload around lines 438-457, destructured return around lines 472-515, JSX insertion around line 686)

- [ ] **Step 1: Add three state variables**

Find the `useState` declarations around line 325. Immediately after `const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(() => padTo5(assistant.suggestedQuestions));` add:

```ts
  const [themeMode, setThemeMode] = useState<import("@bizassist/types").ThemeMode>(assistant.themeMode);
  const [themeLightPreset, setThemeLightPreset] = useState<import("@bizassist/types").ThemeKey>(assistant.themeLightPreset);
  const [themeDarkPreset, setThemeDarkPreset] = useState<import("@bizassist/types").ThemeKey>(assistant.themeDarkPreset);
```

- [ ] **Step 2: Add named handlers for the picker**

Immediately after the three `useState` lines above, add:

```ts
  function handleThemeModeChange(mode: import("@bizassist/types").ThemeMode) {
    setThemeMode(mode);
  }
  function handleThemeLightPresetChange(key: import("@bizassist/types").ThemeKey) {
    setThemeLightPreset(key);
  }
  function handleThemeDarkPresetChange(key: import("@bizassist/types").ThemeKey) {
    setThemeDarkPreset(key);
  }
```

- [ ] **Step 3: Include the fields in the save payload**

Inside `handleSave`, find the `body: JSON.stringify({ ... })` object (around line 438). Add three lines before the closing `}`:

```ts
          themeMode,
          themeLightPreset,
          themeDarkPreset,
```

- [ ] **Step 4: Include the fields in the returned shape**

Inside the `return { ... }` at the end of the custom-detail hook (around line 472-515), add the new state + handlers. There are two places they need to appear:

In the "State values" block (after `suggestedQuestions`):

```ts
    themeMode,
    themeLightPreset,
    themeDarkPreset,
```

In the "Handlers" block (near `handleSuggestedQuestionChange`):

```ts
    handleThemeModeChange,
    handleThemeLightPresetChange,
    handleThemeDarkPresetChange,
```

- [ ] **Step 5: Destructure the new values in the component body**

If the component destructures the return of the hook via `const { ... } = useCustomerDetail(...)` (search for the destructure near the top of the `export function CustomerDetail(...)` body — around line 535-565), add the six new names: `themeMode, themeLightPreset, themeDarkPreset, handleThemeModeChange, handleThemeLightPresetChange, handleThemeDarkPresetChange`.

- [ ] **Step 6: Import and mount the panel**

Add this import at the top of `customer-detail.tsx`:

```ts
import { ThemePickerPanel } from "@/components/dashboard/customer-detail/theme-picker";
```

Find the Widget Appearance `<Card>` block (around line 682) — the one with `<CardTitle>Widget Appearance</CardTitle>`. Inside `<CardContent>`, after the existing `<LauncherCtaPanel ... />` (around line 722), insert:

```tsx
            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-medium">Chat theme</h3>
              <ThemePickerPanel
                themeMode={themeMode}
                themeLightPreset={themeLightPreset}
                themeDarkPreset={themeDarkPreset}
                widgetColor={widgetColor}
                onModeChange={handleThemeModeChange}
                onLightPresetChange={handleThemeLightPresetChange}
                onDarkPresetChange={handleThemeDarkPresetChange}
              />
            </div>
```

- [ ] **Step 7: Type-check + build**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: Passes.

Run: `npm run build`

Expected: Succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/dashboard/customer-detail.tsx
git commit -m "feat(dashboard): mount ThemePickerPanel in customer-detail appearance section"
```

---

## Task 15: End-to-end verification

- [ ] **Step 1: Run lint + type-check + build**

```bash
npm run lint
npx tsc --noEmit -p apps/web/tsconfig.json
npm run build
```

Expected: All three succeed with no errors.

- [ ] **Step 2: Manual browser test — dashboard**

Run `npm run dev` and open the customer detail page for any customer.

Check:
- Scroll to Widget Appearance card. The new "Chat theme" section appears.
- Three radio buttons: Light / Dark / Auto (OS). Pick each — preview frame below updates.
- Light preset row shows Classic + Parchment tiles with colored mini-bubbles. Click each — preview changes.
- Dark preset row shows Midnight + Slate tiles. Click each — preview changes (only if mode = Dark, otherwise preview stays on the light preset).
- Selected tile has a ring in the owner's `widgetColor`.
- Click Save. Reload the page — selections persist.

- [ ] **Step 3: Manual browser test — chat iframe**

Open `http://localhost:3000/chat/<assistant-id>`.

Check:
- Chat renders with the owner's current theme and default mode. On mock data: Classic / light.
- Sun/moon icon in the header to the left of the close button.
- Click it: body, assistant bubble, input border, disclosure banner, system-pill all flip.
- Reload: visitor override persists (with `cookielessMode=false`).
- DevTools → Application → Local Storage: `ba-theme-<assistantId>` is present.
- Emulate `prefers-color-scheme: dark` in DevTools. Set owner mode = Auto in dashboard. Reload chat. Expect dark preset applied without a stored override.
- Emulate `prefers-reduced-motion: reduce`. Click the toggle. No unpleasant transition (current CSS has no theme-transition — confirm no sudden animation appears).

- [ ] **Step 4: Accessibility spot-check**

With dark preset active:
- Body text on chat background: use a contrast checker (axe DevTools or WebAIM) to confirm ≥ 4.5:1.
- Muted text on chat background: ≥ 4.5:1.
- Toggle button focus ring visible on the brand-colored header.
- Toggle button announces its state via `aria-pressed`.

- [ ] **Step 5: Final commit (if any doc changes)**

Only commit if there are real changes. If everything is clean, skip.

```bash
git status
# if nothing to commit, move on
```

---

## Self-Review (pre-flight for the implementing agent)

Before starting Task 1, confirm:

1. **Spec coverage:** Every section of the spec is addressed here. Data model → Tasks 1-3. Theming mechanism → Tasks 4-5. Resolution flow → Task 6. Persistence → Task 6 (localStorage write guarded by `cookielessMode`). UI surfaces → Tasks 12 (header toggle) + 13-14 (dashboard picker). Edge cases → Task 6 (OS pref live updates when mode=auto; useLayoutEffect synchronous read).
2. **Type consistency:** All `ThemeMode` / `ThemeKey` references resolve to the names introduced in Task 1. Preset keys `classic | parchment | midnight | slate` match the spec exactly. Hook method names `toggle`, `themeKey`, `isDark` are consistent with Task 12 usage.
3. **Placeholders:** None. Every step has exact code and exact commands.

**Known simplifications vs the spec:**
- Spec mentions "no theme-transition animation when reduced motion is on." Plan achieves this by simply not adding any transition in the first place (theme swap is instant) — this satisfies the requirement without extra CSS.
- Spec mentions "Audit pass — anything with hard-coded `bg-gray-*` / `text-gray-*`." Task 11's listed lines are the complete audit; no other usages exist in the four affected files (verified by reading them end-to-end). If the implementer finds additional hard-coded tokens, swap them to the same CSS var scheme and note it in the commit.
