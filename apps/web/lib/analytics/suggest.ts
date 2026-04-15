import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasAnthropic, hasDatabase, hasOpenAI, hasPinecone } from "@/lib/env";
import { getAnthropicClient } from "@/lib/llm/providers";
import { embedQuery } from "@/lib/rag/embed";
import { retrieveChunks } from "@/lib/rag/retrieve";

const LABEL_MODEL = "claude-4-sonnet-20250514";
const SUGGEST_MODEL = "claude-4-sonnet-20250514";

/**
 * Generate a short 4-6 word topic label from one or more clustered questions.
 * Falls back to a truncated representative question if Claude is unavailable.
 */
export async function generateClusterLabel(questions: string[]): Promise<string> {
  const rep = questions[0] ?? "Unlabeled topic";
  if (!hasAnthropic()) {
    return rep.slice(0, 60);
  }

  const anthropic = getAnthropicClient();
  if (!anthropic) return rep.slice(0, 60);

  try {
    const response = await anthropic.messages.create({
      model: LABEL_MODEL,
      max_tokens: 40,
      system:
        "You label customer-support topic clusters. Respond with ONLY a short 4-6 word label in title case. No quotes, no punctuation at the end.",
      messages: [
        {
          role: "user",
          content: `Label this cluster of related customer questions in 4-6 words:\n\n${questions
            .slice(0, 5)
            .map((q, i) => `${i + 1}. ${q}`)
            .join("\n")}`,
        },
      ],
    });

    const text = extractText(response);
    return (text || rep.slice(0, 60)).replace(/["']/g, "").slice(0, 120);
  } catch (err) {
    console.error("generateClusterLabel Anthropic call failed:", err);
    return rep.slice(0, 60);
  }
}

/**
 * Generate a suggested Q&A pair for a cluster, grounded in any currently-indexed
 * knowledge plus the cluster's own questions. Writes results back to the cluster row.
 */
export async function generateSuggestedQA(
  tenantId: string,
  clusterId: string,
): Promise<{ suggestedQuestion: string; suggestedAnswer: string } | null> {
  if (!hasDatabase()) return null;
  const d = getDb();
  if (!d) return null;

  const [cluster] = await d
    .select()
    .from(s.questionClusters)
    .where(
      and(
        eq(s.questionClusters.id, clusterId),
        eq(s.questionClusters.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!cluster) return null;

  // Return cached if already generated
  if (cluster.suggestedQuestion && cluster.suggestedAnswer) {
    return {
      suggestedQuestion: cluster.suggestedQuestion,
      suggestedAnswer: cluster.suggestedAnswer,
    };
  }

  const rows = await d
    .select({ text: s.clusteredQuestions.questionText })
    .from(s.clusteredQuestions)
    .where(eq(s.clusteredQuestions.clusterId, clusterId))
    .limit(5);
  const questions = rows.map((r) => r.text);

  // Try to retrieve grounding chunks for this topic (best-effort).
  let groundingText = "";
  if (hasPinecone() && hasOpenAI()) {
    try {
      const emb = await embedQuery(cluster.label);
      const chunks = await retrieveChunks(emb, tenantId, 0, 5);
      groundingText = chunks
        .map((c, i) => `[${i + 1}] ${c.heading ?? "Knowledge"}: ${c.content}`)
        .join("\n---\n");
    } catch (err) {
      console.error("retrieveChunks for cluster suggestion failed:", err);
    }
  }

  if (!hasAnthropic()) {
    // Provide a deterministic fallback so the UI still has something to show.
    const fallbackQ = questions[0] ?? cluster.label;
    const fallbackA =
      "Draft answer unavailable — Anthropic API key not configured. Questions customers asked:\n" +
      questions.map((q) => `- ${q}`).join("\n");
    await d
      .update(s.questionClusters)
      .set({ suggestedQuestion: fallbackQ, suggestedAnswer: fallbackA })
      .where(eq(s.questionClusters.id, clusterId));
    return { suggestedQuestion: fallbackQ, suggestedAnswer: fallbackA };
  }

  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const systemPrompt =
    "You help business owners fill gaps in their chatbot knowledge base. Given a cluster of related customer questions and any existing knowledge snippets, produce ONE consolidated Q&A pair. Keep the answer factual and concise (max 3 sentences). If no grounding is provided, write a question and an empty-template answer the owner should fill in. Respond in strict JSON: {\"question\": string, \"answer\": string}.";

  const userPrompt = `Customer questions from the cluster "${cluster.label}" (${cluster.questionCount} total):
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

${groundingText ? `Existing knowledge that may be relevant:\n${groundingText}\n` : "(No existing knowledge is indexed for this topic.)"}

Return JSON only.`;

  try {
    const response = await anthropic.messages.create({
      model: SUGGEST_MODEL,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = extractText(response);
    const parsed = safeParseJson(text);
    if (!parsed || !parsed.question || !parsed.answer) {
      return null;
    }

    await d
      .update(s.questionClusters)
      .set({
        suggestedQuestion: parsed.question,
        suggestedAnswer: parsed.answer,
      })
      .where(eq(s.questionClusters.id, clusterId));

    return {
      suggestedQuestion: parsed.question,
      suggestedAnswer: parsed.answer,
    };
  } catch (err) {
    console.error("generateSuggestedQA Anthropic call failed:", err);
    return null;
  }
}

// ---- helpers ----

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicTextBlock[];
}

function extractText(response: unknown): string {
  const r = response as AnthropicResponse;
  const blocks = r.content ?? [];
  return blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
}

function safeParseJson(text: string): { question: string; answer: string } | null {
  if (!text) return null;
  // Strip ```json ... ``` fences if present.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.question === "string" &&
      typeof parsed.answer === "string"
    ) {
      return { question: parsed.question, answer: parsed.answer };
    }
  } catch {
    return null;
  }
  return null;
}
