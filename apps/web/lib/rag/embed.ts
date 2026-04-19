import { hasOpenAI } from "@/lib/env";
import { getOpenAIClient } from "@/lib/llm/providers";
import { mockEmbedding } from "@/lib/mock/providers";
import { logger } from "@/lib/observability";
import { classifyError } from "@/lib/observability/scrub";

export async function embedQuery(text: string): Promise<number[]> {
  if (!hasOpenAI()) return mockEmbedding();

  const openai = getOpenAIClient()!;
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    logger.error(err, { stage: "embed_query" });
    logger.event("rag.retrieve.failed", {
      tenantId: "unknown",
      stage: "embed",
      errKind: classifyError(err),
    });
    throw err;
  }
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) return texts.map(() => mockEmbedding());

  const openai = getOpenAIClient()!;
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });
    return response.data.map((d: { embedding: number[] }) => d.embedding);
  } catch (err) {
    logger.error(err, { stage: "embed_batch" });
    throw err;
  }
}
