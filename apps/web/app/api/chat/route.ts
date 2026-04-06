import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase, hasAnthropic, hasPinecone, hasOpenAI } from "@/lib/env";
import { mockChatResponse } from "@/lib/mock/providers";
import { getAnthropicClient } from "@/lib/llm/providers";
import { buildSystemPrompt } from "@/lib/llm/prompts";
import { formatKnowledgeForLLM } from "@/lib/knowledge/format";
import { embedQuery } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { optimizeHistory } from "@/lib/llm/summarize";
import * as queries from "@/lib/db/queries";

const chatRequestSchema = z.object({
  assistantId: z.string().uuid(),
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(8),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { assistantId, message, sessionId, history } = parsed.data;

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
      });
      conversationId = conversation.id;

      await queries.createMessage({
        conversationId: conversation.id,
        tenantId,
        role: "user",
        content: message,
      });
    } catch (err) {
      console.error("Failed to save user message:", err);
      // Continue without persistence — still try to generate a response
    }
  }

  // Try real AI, fall back to mock
  if (hasAnthropic() && assistant && tenant && tenantId) {
    try {
      return await streamClaudeResponse({
        assistant,
        tenant,
        tenantId,
        conversationId,
        message,
        history: history ?? [],
      });
    } catch (err) {
      console.error("streamClaudeResponse failed:", err);
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < response.length; i++) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: response[i] })}\n\n`));
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
      }
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
}

async function resolveChunks(
  message: string,
  tenantId: string,
  confidenceThreshold: number,
): Promise<{ chunks: ResolvedChunk[]; chunksUsed: string[]; confidence: number }> {
  // Try semantic search first
  if (hasPinecone() && hasOpenAI()) {
    try {
      const queryEmbedding = await embedQuery(message);
      const retrieved = await retrieveChunks(queryEmbedding, tenantId, confidenceThreshold, 5);

      if (retrieved.length > 0) {
        // Look up sourceUrls from knowledge items
        const itemIds = [...new Set(retrieved.map((c) => c.knowledgeItemId).filter(Boolean))];
        const items = itemIds.length > 0 ? await queries.getKnowledgeItemsByIds(itemIds, tenantId) : [];
        const itemMap = new Map(items.map((i) => [i.id, i]));

        const chunks = retrieved.map((c) => ({
          content: c.content,
          heading: c.heading,
          sourceUrl: itemMap.get(c.knowledgeItemId)?.sourceUrl ?? null,
          score: c.score,
        }));

        const confidence = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;

        return {
          chunks,
          chunksUsed: retrieved.map((c) => c.id),
          confidence,
        };
      }
    } catch (err) {
      console.error("RAG retrieval failed, falling back to full context:", err);
    }
  }

  // Fallback: fetch all active knowledge items
  const knowledgeItems = await queries.getKnowledgeItems(tenantId);
  const activeItems = knowledgeItems.filter((item) => item.status === "active" && item.content);

  const chunks = activeItems.map((item) => ({
    content: formatKnowledgeForLLM(item.title, item.content!, item.type),
    heading: item.title,
    sourceUrl: item.sourceUrl,
    score: 1.0,
  }));

  return {
    chunks,
    chunksUsed: [],
    confidence: chunks.length > 0 ? 1.0 : 0,
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
}) {
  const { assistant, tenant, tenantId, conversationId, message, history } = opts;
  const startTime = Date.now();

  // Retrieve relevant chunks (semantic search or fallback)
  let chunks: ResolvedChunk[] = [];
  let chunksUsed: string[] = [];
  let confidence = 0;
  try {
    const result = await resolveChunks(message, tenantId, assistant.confidenceThreshold);
    chunks = result.chunks;
    chunksUsed = result.chunksUsed;
    confidence = result.confidence;
  } catch (err) {
    console.error("resolveChunks failed, continuing with no context:", err);
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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-4-sonnet-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`),
            );
          }
        }

        const latencyMs = Date.now() - startTime;
        const isFallback =
          chunks.length === 0 ||
          confidence < assistant.confidenceThreshold ||
          fullResponse.includes(assistant.fallbackMsg);

        // Save assistant message to DB before sending meta + DONE
        let savedMessageId: string | null = null;
        if (conversationId && tenantId) {
          const saved = await queries.createMessage({
            conversationId,
            tenantId,
            role: "assistant",
            content: fullResponse,
            confidence: confidence.toFixed(3),
            latencyMs,
            isFallback,
          });
          savedMessageId = saved.id;
        }

        // Send meta event with messageId, confidence, and sources
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ meta: { messageId: savedMessageId, confidence, sources } })}\n\n`,
          ),
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        console.error("Claude streaming error:", err);
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
