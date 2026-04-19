# Mission 6/6 — Mobile Viewport & Keyboard

## Context

`apps/web/app/chat/[id]/page.tsx` wraps `<ChatWindow>` in `<div className="h-screen w-full">`. On mobile Safari/Chrome, `100vh` is computed against the *largest* viewport (URL bar hidden), so when the soft keyboard opens — or the URL bar is visible — the last ~100px of the chat overflows the screen and the input gets pushed below the fold.

There's also no `viewport-fit=cover` meta tag, so `env(safe-area-inset-*)` returns `0` on notched iOS devices — the send button sits underneath the home indicator. The textarea uses `text-sm` (14px), which triggers iOS auto-zoom on focus. And there's no logic to re-anchor the scroll position when the keyboard opens, so the newest message can end up hidden behind the keyboard.

These are the last UX gaps from the 6-mission plan. Desktop and iframe-embedded widget usage must stay regression-free.

## Scope

**In:**
- Dynamic viewport height (`100dvh`) on the `/chat/[id]` page — keeps chat within the visual viewport when the keyboard shows.
- `viewport-fit=cover` via Next 15/16 `viewport` export on the chat route segment (not root — keeps dashboard untouched).
- Safe-area-inset padding on header (top) and input form (bottom) for iOS notched devices.
- 16px font-size floor on the textarea to prevent iOS auto-zoom on focus.
- Textarea auto-grow capped at 5 rows (visible multi-line typing on mobile without dominating the viewport).
- `visualViewport` listener: when the keyboard opens/closes and the user was near the bottom, re-anchor scroll to bottom so the newest message stays visible.

**Out:**
- Any changes to the embedded widget chrome (`apps/widget/src/widget.ts`) — the widget's own container manages its sizing inside the iframe.
- PWA / standalone-mode handling.
- Landscape-orientation-specific tweaks beyond what `dvh` already fixes.
- Mission-5 regressions (feedback/copy/regenerate buttons stay exactly as shipped).

## File Plan

### Modify

- **`apps/web/app/chat/[id]/page.tsx`**
  - Replace `className="h-screen w-full"` with `className="h-dvh w-full"` (Tailwind v4 built-in; falls back to `100vh` via browser-native behavior on pre-2022 engines).
  - Add a `viewport` export: `{ width: "device-width", initialScale: 1, viewportFit: "cover" }`.

- **`apps/web/components/chat/chat-window.tsx`**
  - Add safe-area-inset padding to the `<header>`: `style={{ backgroundColor: widgetColor, paddingTop: "env(safe-area-inset-top)" }}` (merge with existing style).
  - Add `overscroll-contain` to the scroll-log `<div>` so rubber-banding doesn't scroll the outer page.
  - Add a `useEffect` that listens to `window.visualViewport` `resize` / `scroll` events. When the visual viewport height changes *and* the user was within ~80px of the bottom before the change, call the same `scrollTo({ top: scrollHeight, behavior: "instant" })` we already use on new messages. No-op when `visualViewport` is undefined (SSR, older browsers).

- **`apps/web/components/chat/chat-input.tsx`**
  - Change textarea class `text-sm` → `text-base` (16px) to prevent iOS auto-zoom. Desktop users gain one font-size step; acceptable in a chat composer.
  - Wire auto-grow: on each change, set `textarea.style.height = 'auto'` then `textarea.style.height = Math.min(textarea.scrollHeight, 5 * lineHeightPx) + 'px'`. Reset after submit.
  - Add `pb-[max(1rem,env(safe-area-inset-bottom))]` class to the form so the send button clears the iOS home indicator.

### Do Not Modify
- `apps/web/app/layout.tsx` — root viewport would apply to dashboard, leave per-route.
- `apps/widget/src/widget.ts` and widget builds — iframe container owns its own sizing.
- Chat SSE protocol, safety pipeline, API routes — no contract changes.
- Mission-5 action row (copy, regenerate, feedback).

## Implementation Notes

### dvh support
Tailwind v4 ships `h-dvh` as a first-class utility. Browser support (dvh unit): iOS Safari 15.4+, Chrome 108+, Firefox 101+, all covering >97% of traffic. Older browsers fall back to the parent's height, which is `<body>` — same behavior as today. No JS polyfill needed.

### viewport-fit=cover scope
Exporting `viewport` from `app/chat/[id]/page.tsx` only affects that route segment. Dashboard pages keep Next's default viewport (no `viewport-fit`), so no chance of shifting dashboard layout.

### visualViewport scroll anchor
```ts
useEffect(() => {
  const vv = window.visualViewport;
  if (!vv || !scrollRef.current) return;
  const onResize = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
    }
  };
  vv.addEventListener("resize", onResize);
  return () => vv.removeEventListener("resize", onResize);
}, []);
```
The 80px gate avoids yanking scroll when the user has scrolled up to read history.

### Textarea auto-grow
One-line default (`rows={1}`), grows to 5 rows max. Uses `scrollHeight` on input change. Reset to single row after `setMessage("")`. No dependency on line-height parsing — computed via `getComputedStyle`.

### iOS font-size floor
iOS Safari auto-zooms when focusing inputs with `font-size < 16px`. We keep everything else at `text-sm` for density; only the composer bumps to `text-base`. The send button icon stays `size-4` — it's clearly a button regardless of composer font size.

## Verification

1. `npx tsc --noEmit -p apps/web/tsconfig.json`
2. `npm run lint`
3. `npm run build`
4. Manual smoke (documented, not automated):
   - Desktop Chrome: chat fills viewport, input auto-grows as typed (up to ~5 lines).
   - iOS Safari 17 (or Chrome DevTools iPhone 14 emulator): focus textarea → no zoom, keyboard opens → input stays visible above keyboard, last message auto-scrolls into view when keyboard opens.
   - Iframe embed (`/chat/[id]` inside widget): no visual regression, header close button still works, Mission-5 copy/regen buttons unchanged.
   - Landscape rotation on mobile: chat re-fits, no content hidden behind notch.

## Completion

- Commit: `feat(chat): mobile viewport (dvh), safe-area-insets, iOS keyboard handling`
- Push to `master`.
- Announce Mission 6/6 complete — the full 6-mission plan is shipped.
