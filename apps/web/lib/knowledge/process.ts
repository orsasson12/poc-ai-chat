/**
 * Orchestrates knowledge item processing: chunk → embed → store in Pinecone + DB.
 * Gracefully degrades when Pinecone/OpenAI are unavailable.
 */

import { hasPinecone, hasOpenAI, env } from "@/lib/env";
import { chunkContent, estimateTokenCount } from "@/lib/knowledge/chunk";
import { formatKnowledgeForLLM } from "@/lib/knowledge/format";
import { embedBatch } from "@/lib/rag/embed";
import * as queries from "@/lib/db/queries";

export async function processKnowledgeItem(
  knowledgeItemId: string,
  tenantId: string,
): Promise<void> {
  const item = await queries.getKnowledgeItemById(knowledgeItemId);
  if (!item || !item.content) {
    throw new Error("Knowledge item not found or has no content");
  }

  // Mark as processing
  await queries.updateKnowledgeItemStatus(item.id, tenantId, "processing");

  try {
    // Clean up any previous chunks (re-processing case)
    await queries.deleteChunksByKnowledgeItemId(item.id, tenantId);

    // Format content for LLM context
    const formatted = formatKnowledgeForLLM(item.title, item.content, item.type);

    // Split into chunks
    const chunks = chunkContent(formatted, item.type, item.title);

    if (chunks.length === 0) {
      // Content too small to chunk — treat entire content as one chunk
      chunks.push({ text: formatted, index: 0, heading: item.title });
    }

    // Embed chunks if Pinecone + OpenAI are available
    let embeddings: number[][] | null = null;
    if (hasPinecone() && hasOpenAI()) {
      embeddings = await embedBatch(chunks.map((c) => c.text));
    }

    // Upsert to Pinecone if available
    if (hasPinecone() && embeddings) {
      const { Pinecone } = await import("@pinecone-database/pinecone");
      const client = new Pinecone({ apiKey: env.pineconeApiKey });
      const index = client.index(env.pineconeIndex);

      const vectors = chunks.map((chunk, i) => ({
        id: `${item.id}_chunk_${chunk.index}`,
        values: embeddings![i],
        metadata: {
          content: chunk.text,
          heading: chunk.heading ?? "",
          knowledgeItemId: item.id,
          chunkIndex: chunk.index,
        },
      }));

      // Upsert in batches of 100 (Pinecone limit)
      const ns = index.namespace(tenantId);
      for (let i = 0; i < vectors.length; i += 100) {
        await ns.upsert({ records: vectors.slice(i, i + 100) });
      }
    }

    // Store chunks in Postgres
    for (const chunk of chunks) {
      await queries.createChunk({
        tenantId,
        knowledgeItemId: item.id,
        pineconeId: `${item.id}_chunk_${chunk.index}`,
        content: chunk.text,
        tokenCount: estimateTokenCount(chunk.text),
        chunkIndex: chunk.index,
        heading: chunk.heading,
      });
    }

    // Update item status and chunk count
    await queries.updateKnowledgeItemChunkCount(item.id, tenantId, chunks.length);
    await queries.updateKnowledgeItemStatus(item.id, tenantId, "active");
  } catch (err) {
    console.error("Knowledge processing failed:", err);
    await queries.updateKnowledgeItemStatus(item.id, tenantId, "error");
    throw err;
  }
}
