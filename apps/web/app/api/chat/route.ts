import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase, hasAnthropic, hasPinecone, hasOpenAI } from "@/lib/env";
import { mockChatResponse, getMockCards } from "@/lib/mock/providers";
import { getAnthropicClient } from "@/lib/llm/providers";
import { MODELS } from "@/lib/llm/models";
import { buildSystemPrompt } from "@/lib/llm/prompts";
import { formatKnowledgeForLLM } from "@/lib/knowledge/format";
import { embedQuery } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { rewriteQuery } from "@/lib/rag/rewrite";
import { scoreChunk } from "@/lib/rag/freshness";
import { optimizeHistory } from "@/lib/llm/summarize";
import * as queries from "@/lib/db/queries";
import { logger } from "@/lib/observability";
import { classifyError } from "@/lib/observability/scrub";
import { runSafetyPipeline } from "@/lib/safety";
import { chatLimiter } from "@/lib/safety/rate-limit";
import { stripPii } from "@/lib/safety/pii";
import { generateCanaryToken } from "@/lib/safety/canary";
import { validateResponse } from "@/lib/rag/validate";
import { stripUnknownCardMarkers } from "@/lib/rag/cards";
import { logSecurityEvent } from "@/lib/safety/log-event";
import type { CardData } from "@bizassist/types";

const chatRequestSchema = z.object({
  assistantId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(8),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
  // When the widget's proactive engagement rule fired, it forwards the rule
  // id on the first message so the conversation can be attributed back to
  // the rule that opened the chat.
  engagementRuleId: z.string().uuid().optional(),
});

type HistoryEntry = { role: "user" | "assistant"; content: string };

// History is sent by the client and cannot be trusted. Cheap PII regex on each
// entry balances safety with latency — full injection+moderation on 20 items
// would be prohibitively slow.
function sanitizeHistory(history: HistoryEntry[]): HistoryEntry[] {
  return history.map((h) => (h.role === "user" ? { ...h, content: stripPii(h.content).cleanedMessage } : h));
}

function buildFallbackStream(fallbackMsg: string, blockedReason?: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: fallbackMsg })}\n\n`));
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            meta: {
              messageId: null,
              confidence: 0,
              sources: [],
              cards: {},
              blocked: blockedReason ? true : undefined,
            },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { assistantId, message, sessionId, history, engagementRuleId } = parsed.data;

  const rateLimitKey = `${assistantId}:${sessionId}`;
  const { success, reset } = await chatLimiter.limit(rateLimitKey);
  if (!success) {
    logger.event("chat.rate_limited", { assistantId, key: rateLimitKey });
    return Response.json(
      { error: "Rate limited" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)) },
      },
    );
  }

  // Resolve assistant and tenant
  let assistant: Awaited<ReturnType<typeof queries.getAssistantById>> = null;
  let tenantId: string | null = null;
  let tenant: Awaited<ReturnType<typeof queries.getTenantById>> | null = null;
  let conversationId: string | null = null;

  if (hasDatabase()) {
    assistant = await queries.getAssistantById(assistantId);
    if (!assistant) {
      return Response.json({ error: "Assistant not found" }, { status: 404 });
    }
    if (!assistant.isActive) {
      return Response.json({ error: "Assistant is not active" }, { status: 403 });
    }
    tenantId = assistant.tenantId;
    tenant = await queries.getTenantById(tenantId);

    // Save user message
    try {
      const conversation = await queries.getOrCreateConversation({
        tenantId,
        assistantId,
        sessionId,
        engagementRuleId: engagementRuleId ?? null,
      });
      conversationId = conversation.id;

      await queries.createMessage({
        conversationId: conversation.id,
        tenantId,
        role: "user",
        content: message,
      });
    } catch (err) {
      logger.error(err, { tenantId, conversationId, assistantId, stage: "save_user_message" });
      // Continue without persistence — still try to generate a response
    }
  }

  logger.event("chat.request.started", {
    tenantId,
    assistantId,
    sessionId,
    conversationId,
    messageLen: message.length,
    hasHistory: (history?.length ?? 0) > 0,
  });

  // -------- SAFETY (Layers 1-3: injection / moderation / PII) --------
  const safetyTenantId = tenantId ?? "mock";
  const safety = await runSafetyPipeline(message);

  // Persist every event the pipeline produced. `pii_detected` is non-blocking
  // but still audited; blocking events are persisted + then we short-circuit.
  for (const evt of safety.events) {
    if (!evt.eventType) continue;
    await logSecurityEvent({
      tenantId: safetyTenantId,
      conversationId,
      eventType: evt.eventType,
      severity: evt.severity ?? "medium",
      score: evt.score ?? null,
      inputText: message,
      blocked: Boolean(evt.blocked),
      stage: "input",
    });
  }

  if (!safety.passed) {
    const fallbackMsg = assistant?.fallbackMsg ?? "I can only help with questions about this business. What would you like to know?";
    if (hasDatabase() && tenantId && conversationId) {
      try {
        await queries.createMessage({
          conversationId,
          tenantId,
          role: "assistant",
          content: fallbackMsg,
          isFallback: true,
        });
      } catch (err) {
        logger.error(err, { tenantId, conversationId, stage: "save_blocked_fallback" });
      }
    }
    logger.event("chat.request.blocked", {
      tenantId: safetyTenantId,
      conversationId,
      reason: safety.events[0]?.eventType ?? "unknown",
      durationMs: Date.now() - startedAt,
    });
    return buildFallbackStream(fallbackMsg, safety.events[0]?.eventType ?? "blocked");
  }

  const cleanedMessage = safety.cleanedMessage;
  const sanitizedHistory = sanitizeHistory(history ?? []);

  // Try real AI, fall back to mock
  if (hasAnthropic() && assistant && tenant && tenantId) {
    try {
      return await streamClaudeResponse({
        assistant,
        tenant,
        tenantId,
        conversationId,
        message: cleanedMessage,
        history: sanitizedHistory,
        startedAt,
        abortSignal: request.signal,
      });
    } catch (err) {
      logger.error(err, { tenantId, conversationId, assistantId, stage: "stream_claude_response" });
      logger.event("chat.request.failed", {
        tenantId,
        conversationId,
        stage: "stream_claude_response",
        errKind: classifyError(err),
        durationMs: Date.now() - startedAt,
      });
      return Response.json(
        { error: "Chat generation failed", details: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  }

  // Mock fallback
  const response = mockChatResponse();

  if (hasDatabase() && tenantId && conversationId) {
    await queries.createMessage({
      conversationId,
      tenantId,
      role: "assistant",
      content: response,
      isFallback: false,
    });
  }

  // Build cards for any [CARD:...] markers in the mock response
  const allMockCards = getMockCards();
  const mockCards: Record<string, CardData> = {};
  for (const [id, card] of Object.entries(allMockCards)) {
    if (response.includes(`[CARD:${id}]`)) {
      mockCards[id] = card;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < response.length; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: response[i] })}\n\n`));
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
      }
      // Send meta event with cards before DONE
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ meta: { messageId: null, confidence: 1, sources: [], cards: mockCards } })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ---- Chunk retrieval (semantic or fallback) ----

interface ResolvedChunk {
  content: string;
  heading: string | null;
  sourceUrl?: string | null;
  score: number;
  knowledgeItemId?: string;
  isStructured?: boolean;
}

async function resolveChunks(
  message: string,
  tenantId: string,
  confidenceThreshold: number,
  history: HistoryEntry[],
  conversationId: string | null,
): Promise<{ chunks: ResolvedChunk[]; chunksUsed: string[]; confidence: number; cards: Record<string, CardData> }> {
  // Helper to build cards map from knowledge items
  function buildCards(items: { id: string; title: string; type: string; sourceUrl: string | null; metadata?: unknown }[]): Record<string, CardData> {
    const cards: Record<string, CardData> = {};
    for (const item of items) {
      if (item.type === "structured" && item.metadata && typeof item.metadata === "object") {
        const meta = item.metadata as { imageUrl?: string | null; cardType: string; fields: Record<string, string | number | boolean | null> };
        cards[item.id] = {
          knowledgeItemId: item.id,
          title: item.title,
          imageUrl: meta.imageUrl ?? null,
          cardType: meta.cardType,
          fields: meta.fields,
          sourceUrl: item.sourceUrl,
        };
      }
    }
    return cards;
  }

  // Try semantic search first
  if (hasPinecone() && hasOpenAI()) {
    try {
      const rewrite = await rewriteQuery({ message, history, tenantId });
      if (rewrite.usedRewriter) {
        logger.event("rag.rewrite.completed", {
          tenantId,
          conversationId,
          originalLen: message.length,
          rewrittenLen: rewrite.rewritten.length,
          changed: rewrite.changed,
          durationMs: rewrite.durationMs,
        });
      } else if (rewrite.skippedReason) {
        logger.event("rag.rewrite.skipped", {
          tenantId,
          conversationId,
          reason: rewrite.skippedReason,
          durationMs: rewrite.durationMs,
        });
      }

      const queryEmbedding = await embedQuery(rewrite.rewritten);
      const retrieved = await retrieveChunks(queryEmbedding, tenantId, confidenceThreshold, 10);

      if (retrieved.length > 0) {
        // Look up sourceUrls from knowledge items
        const itemIds = [...new Set(retrieved.map((c) => c.knowledgeItemId).filter(Boolean))];
        const items = itemIds.length > 0 ? await queries.getKnowledgeItemsByIds(itemIds, tenantId) : [];
        const itemMap = new Map(items.map((i) => [i.id, i]));

        const now = Date.now();
        const topScoreBefore = retrieved[0]?.score ?? 0;
        let freshnessAppliedCount = 0;

        const scored = retrieved.map((c) => {
          const item = itemMap.get(c.knowledgeItemId);
          // Prefer lastRefreshedAt when present; fall back to createdAt. The shared
          // query currently backfills lastRefreshedAt to null, so createdAt drives
          // freshness in practice — still a meaningful signal.
          const ref = item?.lastRefreshedAt ?? item?.createdAt ?? null;
          const { finalScore, hasDate } = scoreChunk(c.score, ref, now);
          if (hasDate) freshnessAppliedCount += 1;
          return {
            content: c.content,
            heading: c.heading,
            sourceUrl: item?.sourceUrl ?? null,
            score: finalScore,
            knowledgeItemId: c.knowledgeItemId,
            isStructured: item?.type === "structured",
            pineconeId: c.id,
          };
        });

        scored.sort((a, b) => b.score - a.score);
        const kept = scored.slice(0, 5);

        logger.event("rag.rerank.applied", {
          tenantId,
          conversationId,
          candidateCount: retrieved.length,
          keptCount: kept.length,
          freshnessAppliedCount,
          topScoreBefore,
          topScoreAfter: kept[0]?.score ?? 0,
        });

        const chunks: ResolvedChunk[] = kept.map((c) => ({
          content: c.content,
          heading: c.heading,
          sourceUrl: c.sourceUrl,
          score: c.score,
          knowledgeItemId: c.knowledgeItemId,
          isStructured: c.isStructured,
        }));
        const confidence = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;

        return {
          chunks,
          chunksUsed: kept.map((c) => c.pineconeId),
          confidence,
          cards: buildCards(items),
        };
      }
    } catch (err) {
      logger.error(err, { tenantId, stage: "rag_retrieve" });
      logger.event("rag.retrieve.failed", {
        tenantId,
        stage: "query",
        errKind: classifyError(err),
      });
    }
  }

  // Fallback: fetch all active knowledge items
  const knowledgeItems = await queries.getKnowledgeItems(tenantId);
  const activeItems = knowledgeItems.filter((item) => item.status === "active" && item.content);

  const chunks = activeItems.map((item) => ({
    content: formatKnowledgeForLLM(item.title, item.content!, item.type, item.id),
    heading: item.title,
    sourceUrl: item.sourceUrl,
    score: 1.0,
    knowledgeItemId: item.id,
    isStructured: item.type === "structured",
  }));

  return {
    chunks,
    chunksUsed: [],
    confidence: chunks.length > 0 ? 1.0 : 0,
    cards: buildCards(activeItems),
  };
}

// ---- Real Claude streaming ----

async function streamClaudeResponse(opts: {
  assistant: NonNullable<Awaited<ReturnType<typeof queries.getAssistantById>>>;
  tenant: NonNullable<Awaited<ReturnType<typeof queries.getTenantById>>>;
  tenantId: string;
  conversationId: string | null;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  startedAt: number;
  abortSignal: AbortSignal;
}) {
  const { assistant, tenant, tenantId, conversationId, message, history, startedAt, abortSignal } = opts;
  const startTime = Date.now();
  const canary = generateCanaryToken(tenantId);

  // Retrieve relevant chunks (semantic search or fallback)
  let chunks: ResolvedChunk[] = [];
  let chunksUsed: string[] = [];
  let confidence = 0;
  let cards: Record<string, CardData> = {};
  try {
    const result = await resolveChunks(message, tenantId, assistant.confidenceThreshold, history, conversationId);
    chunks = result.chunks;
    chunksUsed = result.chunksUsed;
    confidence = result.confidence;
    cards = result.cards;
  } catch (err) {
    logger.error(err, { tenantId, conversationId, stage: "resolve_chunks" });
  }

  // Build source info for SSE meta event — only include sources with external URLs
  const sources = chunks
    .filter((c) => c.sourceUrl)
    .map((c) => ({ title: c.heading ?? new URL(c.sourceUrl!).hostname, url: c.sourceUrl! }))
    // Deduplicate by URL
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    assistantName: assistant.name,
    businessName: tenant.name,
    tone: assistant.tone,
    fallbackMsg: assistant.fallbackMsg,
    tenantId,
    chunks,
  });

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    throw new Error("Anthropic client not available");
  }

  // Build message history for Claude (summarize if too long)
  const rawMessages: { role: "user" | "assistant"; content: string }[] = [
    ...history,
    { role: "user" as const, content: message },
  ];
  const messages = await optimizeHistory(rawMessages, anthropic);

  // Stream from Claude
  const encoder = new TextEncoder();
  let fullResponse = "";
  let firstTokenMs: number | null = null;
  let canaryLeaked = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create(
          {
            model: MODELS.primary,
            max_tokens: 1024,
            system: systemPrompt,
            messages,
            stream: true,
          },
          { signal: abortSignal },
        );

        for await (const event of response) {
          if (abortSignal.aborted) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - startTime;
              logger.event("chat.stream.token_latency", {
                tenantId,
                conversationId,
                firstTokenMs,
              });
            }
            fullResponse += text;

            // Layer 4 — live canary leak detection. If Claude echoes the
            // tenant-specific HMAC, it means the system prompt leaked; abort
            // the stream immediately and replace with a fallback.
            if (fullResponse.includes(canary)) {
              canaryLeaked = true;
              await logSecurityEvent({
                tenantId,
                conversationId,
                eventType: "canary_leak",
                severity: "critical",
                score: 1,
                inputText: fullResponse,
                blocked: true,
                stage: "output",
              });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ meta: { replaced: true, fallback: assistant.fallbackMsg, messageId: null, confidence: 0, sources: [], cards: {} } })}\n\n`,
                ),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`),
            );
          }
        }

        // Client disconnected (tab close, navigation, fetch abort). Skip
        // output validation, skip DB persistence, and close the stream
        // without a [DONE] sentinel — the reader is already gone. We also
        // deliberately drop the partial assistant message instead of saving
        // it: an aborted response is almost certainly incomplete/mid-sentence,
        // and surfacing it in conversation history would confuse the user
        // on reconnect and pollute analytics (latency/confidence/fallback
        // metrics assume a fully-generated answer).
        if (abortSignal.aborted) {
          logger.event("chat.stream.aborted", {
            tenantId,
            conversationId,
            charsEmitted: fullResponse.length,
            durationMs: Date.now() - startTime,
          });
          controller.close();
          return;
        }

        // Post-generation output validation (Layer 4 — canary + ungrounded check).
        // Short greetings/vague inputs legitimately retrieve zero chunks and the
        // system prompt asks the LLM to give a friendly intro, so we only apply
        // the grounded-response check once the user's message is substantial.
        const applyGroundedCheck = chunks.length === 0 && message.length > 20;
        const outputValidation = validateResponse(
          fullResponse,
          tenantId,
          applyGroundedCheck,
          assistant.fallbackMsg,
        );
        if (!outputValidation.passed) {
          await logSecurityEvent({
            tenantId,
            conversationId,
            eventType: outputValidation.reason === "canary_leak" ? "canary_leak" : "scope_violation",
            severity: "high",
            score: 1,
            inputText: fullResponse,
            blocked: true,
            stage: "output",
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ meta: { replaced: true, fallback: assistant.fallbackMsg, messageId: null, confidence: 0, sources: [], cards: {} } })}\n\n`,
            ),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // Strip hallucinated [CARD:id] markers (ids the LLM invented) before
        // persisting and before computing the used-cards set. Frontend also drops
        // unknown markers defensively; stripping server-side keeps the DB clean
        // so history reloads don't reintroduce stale markers.
        const knownCardIds = Object.keys(cards);
        const { cleaned: cleanedResponse, strippedCount } = stripUnknownCardMarkers(
          fullResponse,
          knownCardIds,
        );
        if (strippedCount > 0) {
          logger.event("chat.response.cards_stripped", {
            tenantId,
            conversationId,
            strippedCount,
            responseLen: cleanedResponse.length,
          });
        }

        const latencyMs = Date.now() - startTime;
        const isFallback =
          chunks.length === 0 ||
          confidence < assistant.confidenceThreshold ||
          cleanedResponse.includes(assistant.fallbackMsg);

        // Save assistant message to DB before sending meta + DONE
        let savedMessageId: string | null = null;
        if (conversationId && tenantId) {
          // chunksUsed stores unique knowledgeItemIds referenced — source analytics groups by knowledge item.
          const knowledgeItemsUsed = [
            ...new Set(chunks.map((c) => c.knowledgeItemId).filter((id): id is string => Boolean(id))),
          ];
          const saved = await queries.createMessage({
            conversationId,
            tenantId,
            role: "assistant",
            content: cleanedResponse,
            confidence: confidence.toFixed(3),
            latencyMs,
            isFallback,
            chunksUsed: knowledgeItemsUsed.length > 0 ? knowledgeItemsUsed : undefined,
          });
          savedMessageId = saved.id;
        }

        // Flag borderline retrieval so the UI can show an advisory note. Empty
        // chunks and explicit fallback text already communicate uncertainty via
        // the response itself, so we only surface the signal for responses that
        // did use retrieved context but under the configured threshold.
        const lowConfidence =
          !isFallback && chunks.length > 0 && confidence < assistant.confidenceThreshold;

        // Send meta event with messageId, confidence, sources, and cards
        // Only include cards that the LLM actually referenced in its response
        const usedCards: Record<string, CardData> = {};
        for (const [id, card] of Object.entries(cards)) {
          if (cleanedResponse.includes(`[CARD:${id}]`)) {
            usedCards[id] = card;
          }
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ meta: { messageId: savedMessageId, confidence, sources, cards: usedCards, lowConfidence } })}\n\n`,
          ),
        );

        logger.event("chat.request.completed", {
          tenantId,
          conversationId,
          durationMs: Date.now() - startedAt,
          firstTokenMs,
          totalChars: fullResponse.length,
          confidence,
          isFallback,
          chunksCount: chunks.length,
        });

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        if (canaryLeaked) return; // already closed
        // If the client disconnected mid-stream the SDK throws an abort
        // error. Treat it the same as a clean abort detected by the loop
        // guard: log once, drop the partial, no fallback token, no [DONE].
        if (abortSignal.aborted) {
          logger.event("chat.stream.aborted", {
            tenantId,
            conversationId,
            charsEmitted: fullResponse.length,
            durationMs: Date.now() - startTime,
          });
          try {
            controller.close();
          } catch {
            // Stream may already be torn down by the cancelled reader.
          }
          return;
        }
        logger.error(err, { tenantId, conversationId, stage: "claude_stream" });
        logger.event("chat.request.failed", {
          tenantId,
          conversationId,
          stage: "claude_stream",
          errKind: classifyError(err),
          durationMs: Date.now() - startedAt,
        });
        const fallback = assistant.fallbackMsg;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ token: fallback })}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
