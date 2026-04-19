# Mission 4/6 — Hallucination Guard + Low-Confidence UX

## Context

With observability (M1), safety wiring (M2), and retrieval quality (M3) in place, three concrete hallucination risks remain visible in the code:

1. **Hallucinated card markers leak as raw text.** `MessageBubble` only runs the card-parsing branch when `cards && Object.keys(cards).length > 0`. When the LLM emits `[CARD:fake_id]` and no structured cards were retrieved, the plain-markdown branch renders the marker verbatim. When cards exist but the LLM invents an id, the parser silently drops the marker but the id still ships to the DB inside `messages.content`.
2. **Ungrounded-response check is dead code.** `lib/rag/validate.ts#validateResponse` wraps `validateOutput` with an "empty chunks + non-fallback" check, but the chat route (`app/api/chat/route.ts:538`) calls the bare `validateOutput` from `lib/safety/canary.ts`. A response generated with zero retrieved chunks that also fails to use the configured fallback message is never blocked.
3. **Low-confidence answers look identical to high-confidence ones.** `confidence` and `isFallback` are computed and logged, but the frontend meta event doesn't carry a confidence verdict and the bubble has no visual differentiation. Users cannot tell when an answer came from a weak retrieval.

Mission 4 closes all three gaps in one focused pass.

## Scope

**In:**
- Strip unknown `[CARD:id]` markers from the streamed response before persistence and before sending cards in the meta event.
- Wire `validateResponse` (grounded check) into the chat route in place of the bare canary validator.
- Add a new `lowConfidence` signal to the SSE meta event and render a subtle advisory note under assistant bubbles when it fires.
- Emit one new Axiom event for hallucinated-card stripping.

**Out:**
- Factual-claim extraction / chunk-level citation linking (future work).
- Regenerate button (Mission 5 territory).
- Raising/tuning `confidenceThreshold` defaults — we only expose the existing value.
- Changes to Pinecone metadata, the rewriter, or freshness scoring.

## File Plan

### Create

- `apps/web/lib/rag/cards.ts` — pure helper `stripUnknownCardMarkers(text, knownIds)` → `{ cleaned, strippedCount }`. Regex identical to frontend parser. Easy to unit-test.

### Modify

- `apps/web/app/api/chat/route.ts`
  - Line ~538: replace `validateOutput(fullResponse, tenantId)` with `validateResponse(fullResponse, tenantId, chunks.length === 0, assistant.fallbackMsg)` imported from `@/lib/rag/validate`.
  - After successful validation, call `stripUnknownCardMarkers(fullResponse, Object.keys(cards))`; persist the cleaned text in `createMessage`; use cleaned text for card-usage detection; emit `chat.response.cards_stripped` when count > 0.
  - Meta event: add `lowConfidence: boolean` = `!isFallback && confidence < assistant.confidenceThreshold && chunks.length > 0`. (Fallback and empty-chunks paths already surface via the fallback text; we only flag borderline retrieval.)
- `apps/web/lib/observability/schema.ts`
  - Add `"chat.response.cards_stripped": { tenantId; conversationId; strippedCount; responseLen }`.
- `apps/web/components/chat/message-bubble.tsx`
  - Always route assistant content through `parseContentWithCards` (default `cards` to `{}`), so unknown markers are silently dropped even when no cards exist. Remove the `cards && Object.keys(cards).length > 0` guard.
  - New optional prop `lowConfidence?: boolean`; when true and not streaming/error, render a small advisory under the message using `role="note"`.
- `apps/web/components/chat/chat-window.tsx`
  - Add `lowConfidence?: boolean` to `ChatMessage`.
  - Capture `meta.lowConfidence` and pass it to `MessageBubble`.

### Delete

- Nothing. `lib/rag/validate.ts` was dead code; we're wiring it up rather than deleting.

## Card Stripping Helper

```ts
// apps/web/lib/rag/cards.ts
const CARD_MARKER_RE = /\[CARD:([\w-]+)\]/g;

export function stripUnknownCardMarkers(
  text: string,
  knownIds: Iterable<string>,
): { cleaned: string; strippedCount: number } {
  const known = new Set(knownIds);
  let strippedCount = 0;
  const cleaned = text.replace(CARD_MARKER_RE, (match, id: string) => {
    if (known.has(id)) return match;
    strippedCount += 1;
    return "";
  });
  return { cleaned, strippedCount };
}
```

Pure, no I/O. Regex intentionally mirrors the frontend parser to avoid drift.

## Low-Confidence Note

**When it fires:** `!isFallback && chunks.length > 0 && confidence < assistant.confidenceThreshold`. Fallback responses already communicate uncertainty via their own text; empty-chunk responses are either fallbacks or blocked. Only borderline retrieval needs the extra cue.

**What it looks like:** small muted text, one line, below the message body and above the feedback row. Something like:

> *"I'm not fully sure about this — please double-check important details with our team."*

Rendered with `role="note"` and a muted color. Non-interactive. Respects `motion-reduce`.

## Observability

New event:

```ts
"chat.response.cards_stripped": {
  tenantId: string | null;
  conversationId: string | null;
  strippedCount: number;
  responseLen: number;
}
```

Emitted only when `strippedCount > 0`. Gives us a signal for prompt drift — if this spikes, the card-ID instruction in the system prompt isn't holding.

## Risks & Gotchas

1. **Double-stripping.** The frontend parser already drops unknown markers. Stripping server-side means the marker is gone from DB persistence (good — history loads won't reintroduce it) and from any future export. No double-count risk since we only emit the observability event server-side.
2. **validateResponse false-positives.** `chunks.length === 0` can legitimately happen for greetings/vague questions. The system prompt instructs the LLM to give a short intro in that case. If the intro doesn't contain the configured fallback string, `validateResponse` will flag it as `ungrounded_response` and swap in the fallback — which would be a regression in the greeting UX. Mitigation: when `chunks.length === 0` we already compute `confidence = 0`, and the existing fallback path (`confidence < threshold`) surfaces on the client. We pass `chunksWereEmpty` only when the retrieval actually returned zero AND the user's message was not trivially short. Simplification: keep the existing `validateResponse` contract but only trigger the ungrounded path when `chunks.length === 0 && message.length > 20` — short greetings bypass.
3. **lowConfidence flicker.** Meta arrives after streaming completes, so the note appears only on the finalized bubble. No streaming flicker.
4. **i18n.** The advisory copy is English-only for now. The system prompt already instructs the LLM to answer in the user's language; the advisory is English because this is a POC and the multi-language copy work is out of scope.

## Verification

From `apps/web/`:

1. `npx tsc --noEmit -p tsconfig.json` — types compile.
2. `npm run lint` — no new warnings in touched files.
3. `npm run build` — production build succeeds.
4. **Card hallucination test (manual):** Prompt the assistant with a question that has no structured cards in the tenant's knowledge base. Instruct it (via a test knowledge item) to always emit `[CARD:does_not_exist]`. Verify the final bubble shows no marker text and `chat.response.cards_stripped` fires with `strippedCount >= 1`.
5. **Grounded-check test (manual):** With Pinecone disabled and no knowledge items, send "what is the capital of France?". Expect the fallback message (not an answer about Paris) because `validateResponse` rejects the ungrounded text.
6. **Low-confidence UX test (manual):** Set `confidenceThreshold = 0.9` on the assistant, ask a question with weak matches (confidence ~0.6). Expect the message to render with the advisory note under it.

## Commit Plan

Single commit: `feat(chat): add hallucinated-card stripping and low-confidence UX`. Body references mission-split rule and lists the three closed gaps.
