import { hasOpenAI } from "@/lib/env";
import { getOpenAIClient } from "@/lib/llm/providers";
import { mockEmbedding } from "@/lib/mock/providers";

export async function embedQuery(text: string): Promise<number[]> {
  if (!hasOpenAI()) return mockEmbedding();

  const openai = getOpenAIClient()!;
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!hasOpenAI()) return texts.map(() => mockEmbedding());

  const openai = getOpenAIClient()!;
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  return response.data.map((d: { embedding: number[] }) => d.embedding);
}
