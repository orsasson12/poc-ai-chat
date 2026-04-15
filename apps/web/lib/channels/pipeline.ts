/**
 * Unified channel message pipeline.
 *
 * Takes a normalized InboundMessage from any channel, runs it through
 * the existing BizAssist pipeline (safety → RAG → LLM → format), and
 * returns an OutboundMessage ready for channel-specific delivery.
 */

import type {
  InboundMessage,
  OutboundMessage,
  ChannelType,
  CardData,
} from "@bizassist/types";
import { hasDatabase, hasAnthropic, hasPinecone, hasOpenAI } from "@/lib/env";
import { mockChatResponse } from "@/lib/mock/providers";
import * as queries from "@/lib/db/queries";
import { buildSystemPrompt } from "@/lib/llm/prompts";
import { formatKnowledgeForLLM } from "@/lib/knowledge/format";
import { formatForChannel } from "./format-response";

interface PipelineResult {
  outbound: OutboundMessage;
  confidence: number;
  isFallback: boolean;
  savedMessageId: string | null;
}

/**
 * Processes an inbound message through the full BizAssist pipeline.
 * Returns a formatted OutboundMessage ready for channel delivery.
 */
export async function processChannelMessage(
  inbound: InboundMessage,
): Promise<PipelineResult> {
  const { tenantId, assistantId, text, channel } = inbound;

  // Get or create conversation
  let conversationId: string | null = null;
  let assistant: Awaited<ReturnType<typeof queries.getAssistantById>> = null;

  if (hasDatabase()) {
    assistant = await queries.getAssistantById(assistantId);
    if (!assistant) {
      return mockResult(channel);
    }

    const conversation = await queries.getOrCreateConversation({
      tenantId,
      assistantId,
      sessionId: inbound.platformSenderId, // use platform sender as session
    });
    conversationId = conversation.id;

    // Save inbound message
    await queries.createMessage({
      conversationId,
      tenantId,
      role: "user",
      content: text,
    });
  }

  // If we can't do real AI, return mock
  if (!hasAnthropic() || !assistant) {
    return mockResult(channel);
  }

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant) return mockResult(channel);

  // Resolve chunks (semantic search or fallback)
  let chunks: { content: string; heading: string | null; sourceUrl?: string | null; score: number; knowledgeItemId?: string; isStructured?: boolean }[] = [];
  let confidence = 0;
  let cards: Record<string, CardData> = {};

  if (hasPinecone() && hasOpenAI()) {
    try {
      const { embedQuery } = await import("@/lib/rag/embed");
      const { retrieveChunks } = await import("@/lib/rag/retrieve");

      const queryEmbedding = await embedQuery(text);
      const retrieved = await retrieveChunks(queryEmbedding, tenantId, assistant.confidenceThreshold, 5);

      if (retrieved.length > 0) {
        const itemIds = [...new Set(retrieved.map((c) => c.knowledgeItemId).filter(Boolean))];
        const items = itemIds.length > 0 ? await queries.getKnowledgeItemsByIds(itemIds, tenantId) : [];
        const itemMap = new Map(items.map((i) => [i.id, i]));

        chunks = retrieved.map((c) => ({
          content: c.content,
          heading: c.heading,
          sourceUrl: itemMap.get(c.knowledgeItemId)?.sourceUrl ?? null,
          score: c.score,
          knowledgeItemId: c.knowledgeItemId,
          isStructured: itemMap.get(c.knowledgeItemId)?.type === "structured",
        }));

        confidence = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;

        // Build cards
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
      }
    } catch (err) {
      console.error("RAG retrieval failed in channel pipeline:", err);
    }
  }

  // Fallback: fetch all active knowledge items
  if (chunks.length === 0) {
    const knowledgeItems = await queries.getKnowledgeItems(tenantId);
    const activeItems = knowledgeItems.filter((item) => item.status === "active" && item.content);
    chunks = activeItems.map((item) => ({
      content: formatKnowledgeForLLM(item.title, item.content!, item.type, item.id),
      heading: item.title,
      sourceUrl: item.sourceUrl,
      score: 1.0,
      knowledgeItemId: item.id,
      isStructured: item.type === "structured",
    }));
    confidence = chunks.length > 0 ? 1.0 : 0;
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    assistantName: assistant.name,
    businessName: tenant.name,
    tone: assistant.tone,
    fallbackMsg: assistant.fallbackMsg,
    tenantId,
    chunks,
  });

  // Generate response (non-streaming for channel delivery)
  const { getAnthropicClient } = await import("@/lib/llm/providers");
  const anthropic = getAnthropicClient();
  if (!anthropic) return mockResult(channel);

  const response = await anthropic.messages.create({
    model: "claude-4-sonnet-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: text }],
  });

  const botText = (response.content as { type: string; text?: string }[])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");

  const isFallback =
    chunks.length === 0 ||
    confidence < assistant.confidenceThreshold ||
    botText.includes(assistant.fallbackMsg);

  // Save bot message
  let savedMessageId: string | null = null;
  if (conversationId && tenantId) {
    const saved = await queries.createMessage({
      conversationId,
      tenantId,
      role: "assistant",
      content: botText,
      confidence: confidence.toFixed(3),
      isFallback,
    });
    savedMessageId = saved.id;
  }

  // Build sources
  const sources = chunks
    .filter((c) => c.sourceUrl)
    .map((c) => ({ title: c.heading ?? "Source", url: c.sourceUrl! }))
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);

  // Format for channel
  const outbound = formatForChannel(
    channel,
    botText,
    Object.values(cards),
    sources,
  );

  return { outbound, confidence, isFallback, savedMessageId };
}

function mockResult(channel: ChannelType): PipelineResult {
  const text = mockChatResponse();
  return {
    outbound: formatForChannel(channel, text, [], []),
    confidence: 1,
    isFallback: false,
    savedMessageId: null,
  };
}
