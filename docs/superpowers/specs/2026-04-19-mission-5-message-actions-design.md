# Mission 5/6 — Message Actions (Copy + Regenerate)

## Context

The chat bubble already has feedback (thumbs up/down) and retry-on-error affordances, but no way for a user to:
1. **Copy** an assistant reply (for pasting into a ticket, docs, or email), and
2. **Regenerate** the last answer if it felt off but wasn't an outright error.

Both are low-risk, high-utility quality-of-life additions. Mission 5 adds them without introducing new deps (Sonner is already wired into the root layout) and without changing the chat SSE contract.

## Scope

**In:**
- Copy button on every completed (non-streaming, non-error) assistant bubble.
- Regenerate button on the *last* assistant bubble when the prior turn is a user message, the stream is idle, and we're not in a live-agent escalation.
- Sonner toast on copy success / failure.
- WCAG 2.1 AA: 44px tap targets, visible focus ring, `aria-label`s, `role="group"`.

**Out:**
- Server-side Axiom event for regenerate (client-initiated; existing `chat.request.started` fires via the re-send path).
- Regenerate history (no "previous version" navigation — simple replace).
- Copy of cards (copies the markdown text only; marker placeholders are included as-is).
- Mobile keyboard / viewport fixes (Mission 6).

## Files Touched

### Modify

- **`apps/web/components/chat/message-bubble.tsx`**
  - Add optional prop `onRegenerate?: () => void`.
  - Add local `justCopied` state + `handleCopy` handler (writes `content` to clipboard, fires Sonner toast, flips icon to `Check` for 2s).
  - Extend the bottom action row to include Copy (always shown on completed assistant bubbles) and Regenerate (only when `onRegenerate` is provided).
  - Render the action row when `role === "assistant" && !isStreaming && !isError` — so the greeting can be copied but not regenerated (greeting has no `messageId` or prior user message).

- **`apps/web/components/chat/chat-window.tsx`**
  - Add `handleRegenerate` `useCallback` that slices the last user+assistant pair off the message list and re-runs `handleSend(lastUserMessageRef.current)` — same stale-closure pattern as `handleRetry`.
  - Compute `canRegenerateLast` gate: last msg is assistant, not error, not streaming/waiting, not escalated, and the prior msg is a user turn.
  - Pass `onRegenerate` to the last assistant bubble only.

### Do Not Modify
- `apps/web/app/api/chat/route.ts` — regenerate reuses the existing POST path verbatim.
- SSE protocol, safety pipeline, validate.ts — no changes.

## UX Details

- **Copy icon:** `lucide-react` `Copy` → flips to `Check` for 2s after success. `aria-label="Copy message"` / `"Message copied"` toggles so SR users hear confirmation.
- **Regenerate icon:** `lucide-react` `RefreshCw` with `aria-label="Regenerate response"`. Disabled-look handled by simply not rendering the button when `canRegenerateLast === false`.
- **Toast copy:** `toast.success("Copied to clipboard")` on success, `toast.error("Couldn't copy — try again")` on clipboard rejection (private-browsing, insecure context).
- **Button sizing:** `min-w-[44px] min-h-[44px]` + `p-2` — matches existing feedback buttons exactly.
- **Focus ring:** `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary`.

## Regenerate Semantics

- **Trigger:** click regenerate on the tail assistant bubble.
- **State change:** `setMessages(prev => prev.slice(0, -2))` (removes last user + last assistant).
- **Re-send:** `setTimeout(() => handleSend(lastUserMessageRef.current), 0)` — `handleSend` re-appends the user turn and streams a new assistant reply.
- **History drift note:** The scheduled `handleSend` closes over the *previous* render's `messages`, so the LLM receives the pre-slice history (i.e., sees the old turn pair). This matches `handleRetry`'s existing behavior. Acceptable for POC; flagged for a future history-freshness pass.
- **Race guard:** `handleSend` already disables the input during streaming (`disabled={isStreaming}`), and `canRegenerateLast` checks `!isStreaming && !isWaiting`, so double-clicks are prevented.

## Verification

1. `npx tsc --noEmit -p apps/web/tsconfig.json`
2. `npm run lint`
3. `npm run build`
4. Manual smoke (documented, not automated here):
   - Send a message, wait for full reply, click Copy → toast appears, clipboard has the text, icon shows Check for ~2s.
   - Click Regenerate on the last reply → last user+assistant pair disappears, input shows typing indicator, new reply streams in.
   - Earlier replies show Copy only, no Regenerate.
   - Greeting shows Copy only.
   - Error messages show Retry (existing), not Copy or Regenerate.

## Completion

- Commit: `feat(chat): add copy and regenerate actions to assistant messages`
- Push to `master`.
- Announce Mission 5/6 complete. Stop and wait for `/compact` before Mission 6.
