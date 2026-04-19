# Mission 3/6 — Retrieval Quality (Query Rewriting + Freshness Decay)

## Context

The current retrieval path in `app/api/chat/route.ts:resolveChunks` does one thing: embed the raw user message with `text-embedding-3-small`, query Pinecone with `topK=5`, filter by `confidenceThreshold`. That's it. No query rewriting, no freshness signal, no reranking.

Two concrete quality holes this creates:

1. **Conversational/vague messages retrieve badly.** "How much is that?" or "what about returns?" have no retrieval-relevant tokens. The embedding lands somewhere generic and chunks come back stale or wrong. Users with a short chat history get the worst results because the pronoun resolution happens nowhere.

2. **Stale content competes equally with fresh content.** The vector DB has no concept of recency. A knowledge item that was last refreshed 18 months ago has identical retrieval weight to one updated yesterday. We already track `lastRefreshedAt` / `createdAt` in `knowledge_items` but nothing uses them at retrieval time.

Missions 1 and 2 added observability + safety, so we can now measure this mission's impact (we'll emit `rag.rewrite.completed` and `rag.rerank.applied` events).

## Scope

**In:**
- Query rewriter: short Claude Haiku call that turns `(user message, last ~4 history turns)` into a retrieval-optimized query string. Falls back to the original message on error, timeout, or missing key.
- Retrieval widened to `topK=10`, hydrated against `knowledge_items` (already happening), then scored by `pineconeScore * freshnessDecay(lastRefreshedAt ?? createdAt)`. Keep top 5.
- Feature flag via env so we can ship dark and turn on per-env.
- Axiom events: `rag.rewrite.completed`, `rag.rewrite.skipped`, `rag.rerank.applied`.

**Out:**
- BM25/hybrid search (requires new infra — not for this mission).
- Haiku-based cross-encoder rerank (weakest latency/quality trade; deferred).
- Pinecone metadata migration (we do freshness in Postgres because we already hydrate there).
- Changes to `lib/channels/pipeline.ts` and `lib/analytics/suggest.ts` — they should stay on the old path. Mission 3 targets the chat route only.
- No UI changes.

## File Plan

### Create

- `apps/web/lib/rag/rewrite.ts` — `rewriteQuery({ message, history, tenantId, signal? }): Promise<{ rewritten: string; usedRewriter: boolean; durationMs: number }>`.
- `apps/web/lib/rag/freshness.ts` — pure decay function: `freshnessBoost(ageMs, halfLifeMs): number` returning a multiplier in `[FLOOR, 1.0]`. Exported `scoreChunks(chunks, itemMap, now)` composes Pinecone score × decay.

### Modify

- `apps/web/lib/env.ts` — add `ragQueryRewriteEnabled` (boolean env), `ragFreshnessHalfLifeDays` (number, default 180), `ragFreshnessFloor` (number, default 0.6).
- `apps/web/app/api/chat/route.ts:resolveChunks` — call `rewriteQuery` before `embedQuery`; widen `topK` to 10; hydrate items (already doing this); apply freshness scoring; re-sort; slice to 5. Emit rewrite/rerank events.
- `apps/web/lib/observability/schema.ts` — add three event types (see Event Schema below).
- `.env.example` — document the three new env flags.

### Do NOT touch
- `apps/web/lib/rag/retrieve.ts` — stays as-is (channels + analytics still use it). Mission 3's topK widening lives in `resolveChunks` by passing `topK=10`.
- `apps/web/lib/rag/embed.ts` — unchanged.
- `apps/web/lib/knowledge/process.ts` — no Pinecone metadata migration.

## Query Rewriter Design (`lib/rag/rewrite.ts`)

Model: `claude-haiku-4-5-20251001` (same family the project uses for analytics; fastest Claude currently available).

Behavior:
- If `!hasAnthropic()` or `!env.ragQueryRewriteEnabled`: return `{ rewritten: message, usedRewriter: false, durationMs: 0 }`.
- Build a prompt: system message explains the job; user message includes last ≤4 history turns (already PII-stripped via Mission 2) + current message.
- `max_tokens: 80`, `temperature: 0.0`.
- Hard timeout 600ms via `AbortController`. On timeout or any error → fall back to original message, log `rag.rewrite.skipped` with reason.
- Strip leading/trailing whitespace and quotes from the output; cap at 400 chars; if result is empty or >2× original length, discard it and use original.

System prompt (verbatim):
```
You rewrite customer chat messages into short retrieval queries for a knowledge base search.
Rules:
- Resolve pronouns ("it", "that", "they") using the provided history.
- Expand vague terms into the specific topic they refer to (e.g. "returns" → "return policy refund window").
- Keep the user's intent and domain vocabulary. Do not invent facts.
- Output the rewritten query only. No explanation, no quotes, no prefix.
- If the message is already specific, return it unchanged.
- Never exceed 20 words.
```

User prompt template:
```
Recent conversation:
{last 4 turns, "user:" / "assistant:" prefixed, 200 char cap per turn}

Current message: {message}

Rewritten query:
```

Return shape includes `durationMs` and `usedRewriter` for the caller to emit events.

## Freshness Decay Design (`lib/rag/freshness.ts`)

Exponential decay with a floor — old content never goes to zero, just loses ground to fresh content.

```
ageMs = now - (lastRefreshedAt ?? createdAt ?? now)
halfLifeMs = ragFreshnessHalfLifeDays * 86_400_000
decay = max(FLOOR, 0.5 ^ (ageMs / halfLifeMs))
finalScore = pineconeScore * decay
```

Defaults:
- `halfLifeDays = 180` — a knowledge item at 6 months weighs 0.5×, at 12 months 0.25× (clamped to floor).
- `FLOOR = 0.6` — even ancient evergreen content keeps 60% of its semantic score. This is the safety net against knocking out legitimate static facts like "office hours" that never get refreshed.
- If we can't find the knowledge item in the hydrated map (shouldn't happen but defense-in-depth): decay = 1.0.

The floor+half-life pair is critical: a sharp cliff would starve evergreen content; no floor would effectively filter it out; a long half-life means fresh content gently outranks stale content without ever excluding it.

## Integration into `resolveChunks`

Current flow:
```
embedQuery(message) → retrieveChunks(topK=5) → hydrate items → map to ResolvedChunk
```

New flow:
```
rewrittenQuery = await rewriteQuery({ message, history, tenantId })   ← new
embedQuery(rewrittenQuery.rewritten)                                  ← same fn, new input
retrieveChunks(topK=10)                                               ← widened from 5
hydrate items via getKnowledgeItemsByIds                              ← already doing it
for each chunk: finalScore = score * freshnessBoost(...)              ← new
sort by finalScore desc, slice(0, 5)                                  ← new
map to ResolvedChunk                                                  ← same
```

`history` isn't currently threaded into `resolveChunks`. Pass it down from `streamClaudeResponse`. The `history` is already PII-cleaned by Mission 2 before reaching this point.

Confidence calculation: still `mean(scores)` but now using `finalScore` (decayed). This is semantically correct — fresher + more relevant chunks = higher confidence.

## Event Schema Additions (`lib/observability/schema.ts`)

```ts
"rag.rewrite.completed": {
  tenantId: string;
  conversationId: string | null;
  originalLen: number;
  rewrittenLen: number;
  changed: boolean;          // rewritten !== original (trimmed-compare)
  durationMs: number;
};
"rag.rewrite.skipped": {
  tenantId: string;
  conversationId: string | null;
  reason: "disabled" | "no_anthropic" | "timeout" | "error" | "empty_result" | "too_long";
  durationMs: number;
};
"rag.rerank.applied": {
  tenantId: string;
  conversationId: string | null;
  candidateCount: number;    // e.g. 10
  keptCount: number;         // e.g. 5
  freshnessAppliedCount: number;  // how many had lastRefreshedAt
  topScoreBefore: number;    // Pinecone score of rank-1 pre-decay
  topScoreAfter: number;     // final score of rank-1 post-decay
};
```

## Env Additions (`lib/env.ts`)

```
RAG_QUERY_REWRITE_ENABLED=false       // off by default; turn on per-env
RAG_FRESHNESS_HALF_LIFE_DAYS=180      // softer than a 90-day cutoff
RAG_FRESHNESS_FLOOR=0.6               // evergreen content safety net
```

All read via the existing `env` barrel. No new helpers — just raw values. Rewrite fires only when `hasAnthropic() && env.ragQueryRewriteEnabled`.

## Risks & Gotchas

1. **Haiku adds ~150–250ms pre-embed.** Unacceptable if we hit the free tier rate limit and it retries. Mitigation: 600ms abort, fallback is free (original message), log skipped.
2. **Rewriter hallucinating domain terms.** Mitigation: system prompt says "Do not invent facts"; temperature 0; length cap; always fallback if result is suspicious (too-long heuristic).
3. **Pronoun-heavy follow-ups depend on history being present.** If history is empty (first message), the rewriter should just leave the message alone. The system prompt handles this; verify in unit test.
4. **Freshness decay inverting on `createdAt` for never-refreshed items.** `createdAt` can itself be old. Acceptable: if a business uploaded a doc 2 years ago and never updated it, that item *is* stale. The floor prevents it from vanishing.
5. **Hidden state in `resolveChunks` fallback path.** The non-semantic fallback (all active items, `score: 1.0`) does NOT apply freshness decay. Intentional — if we're in fallback because Pinecone/OpenAI are down, we already have bigger problems than ranking. Don't over-engineer.
6. **Channels pipeline + analytics/suggest still call `retrieveChunks(topK=5)` directly.** That's fine — they don't need rewriting. Make sure nothing changes for them.
7. **Rewrite event emitted before tenantId is fully resolved?** No — by the time `resolveChunks` is called, `tenantId` is known. Pass it explicitly.
8. **Test coverage.** Freshness math is a pure function — add a small unit test block (node: prefix) if there's an existing test harness. If not, skip tests for this POC and lean on the verification steps below.

## Verification

From `apps/web/` (using local node_modules binaries — root `npx tsc` is broken per Mission 1 learnings):

1. **Type check:** `./node_modules/.bin/tsc --noEmit -p tsconfig.json` → expect clean.
2. **Lint:** `../../node_modules/.bin/eslint .` → expect clean.
3. **Build:** `npm run build` → expect no regressions.
4. **Mock smoke test:** With no Anthropic key set, hit `/api/chat` with `"how much does that cost?"` → expect `rag.rewrite.skipped` event with `reason: "no_anthropic"` and original message used.
5. **Enabled smoke test:** Set `RAG_QUERY_REWRITE_ENABLED=true` + valid Anthropic key. Send `"and for refunds?"` after an assistant turn about "shipping times" → expect `rag.rewrite.completed` with `changed: true` and a query like `"refund policy"`.
6. **Freshness smoke test:** Seed two knowledge items with near-identical content but different `lastRefreshedAt` (one recent, one 1 year old). Query something that matches both → expect the fresher one ranked first, `rag.rerank.applied` event shows `topScoreAfter != topScoreBefore`.

## Completion

- Commit: `feat(rag): add Haiku query rewriting and freshness decay scoring`
- Push to `master` (per-mission push per user instruction).
- Announce `Mission 3/6 complete — please run /compact before Mission 4.`
- WAIT for user to run `/compact` before any Mission 4 work.

## Future Missions Still Pending
- Mission 4: Hallucination guard + low-confidence UX
- Mission 5: Message actions (copy, regenerate)
- Mission 6: Mobile viewport + keyboard
