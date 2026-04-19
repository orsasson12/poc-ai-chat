import { hasPinecone, env } from "@/lib/env";
import { logger } from "@/lib/observability";
import { classifyError } from "@/lib/observability/scrub";

export interface RetrievedChunk {
  id: string;
  content: string;
  heading: string | null;
  score: number;
  knowledgeItemId: string;
}

export async function retrieveChunks(
  queryEmbedding: number[],
  tenantId: string,
  confidenceThreshold: number,
  topK = 5
): Promise<RetrievedChunk[]> {
  if (!hasPinecone()) {
    return [
      {
        id: "chunk_mock_01",
        content: "Our office hours are Monday through Friday, 8 AM to 6 PM, and Saturday 9 AM to 2 PM.",
        heading: "Office Hours",
        score: 0.92,
        knowledgeItemId: "ki_001",
      },
    ];
  }

  try {
    const { Pinecone } = await import("@pinecone-database/pinecone");
    const client = new Pinecone({ apiKey: env.pineconeApiKey });
    const index = client.index(env.pineconeIndex);

    const results = await index.namespace(tenantId).query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      includeValues: false,
    });

    return (results.matches ?? [])
      .filter((match) => (match.score ?? 0) >= confidenceThreshold)
      .map((match) => ({
        id: match.id,
        content: (match.metadata?.content as string) ?? "",
        heading: (match.metadata?.heading as string) ?? null,
        score: match.score ?? 0,
        knowledgeItemId: (match.metadata?.knowledgeItemId as string) ?? "",
      }));
  } catch (err) {
    logger.error(err, { tenantId, stage: "pinecone_query" });
    logger.event("rag.retrieve.failed", {
      tenantId,
      stage: "query",
      errKind: classifyError(err),
    });
    throw err;
  }
}
