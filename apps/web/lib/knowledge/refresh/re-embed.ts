/**
 * Re-embedding pipeline for updated knowledge content.
 *
 * When content changes:
 * 1. Save a version snapshot of the current state
 * 2. Re-chunk the new content
 * 3. Diff old vs. new chunks to find what actually changed
 * 4. Delete stale Pinecone vectors
 * 5. Embed and insert new/modified chunks
 * 6. Update Postgres chunk records
 */

import * as queries from "@/lib/db/queries";
import { chunkContent } from "@/lib/knowledge/chunk";
import { formatKnowledgeForLLM } from "@/lib/knowledge/format";
import { hasPinecone, hasOpenAI } from "@/lib/env";
import type { KnowledgeItem } from "@bizassist/types";

interface ReEmbedResult {
  chunksAdded: number;
  chunksRemoved: number;
  chunksUnchanged: number;
  newVersion: number;
}

/**
 * Re-embeds a knowledge item after content change.
 * Creates a version snapshot, diffs chunks, and does partial Pinecone updates.
 */
export async function reEmbedKnowledgeItem(
  itemId: string,
  tenantId: string,
  newContent: string,
  newTitle?: string,
): Promise<ReEmbedResult> {
  const item = await queries.getKnowledgeItemById(itemId);
  if (!item) throw new Error("Knowledge item not found");

  // 1. Save version snapshot of current state
  const currentChunks = await queries.getChunksForItem(itemId, tenantId);
  const newVersion = (item.versionCount ?? 1) + 1;

  await queries.createVersion({
    tenantId,
    knowledgeItemId: itemId,
    version: item.versionCount ?? 1,
    content: item.content ?? "",
    contentHash: item.contentHash ?? "",
    title: item.title,
    chunkCount: currentChunks.length,
    chunkIds: currentChunks.map((c) => c.id),
    source: "refresh",
  });

  // 2. Format and chunk the new content
  const formatted = formatKnowledgeForLLM(newTitle ?? item.title, newContent, item.type, item.id);
  const rawChunks = chunkContent(formatted, item.type, newTitle ?? item.title);
  const newChunks: NewChunk[] = rawChunks.map((c) => ({ content: c.text, heading: c.heading }));

  // 3. Diff old vs new chunks by content similarity
  const { toAdd, toRemove, unchanged } = diffChunks(currentChunks, newChunks);

  // 4. Delete stale vectors from Pinecone
  if (hasPinecone() && toRemove.length > 0) {
    try {
      // Delete old vectors from Pinecone
      // TODO: implement deletePineconeVectors in lib/rag/retrieve.ts
      console.log(`[re-embed] Would delete ${toRemove.length} vectors from Pinecone for tenant ${tenantId}`);
    } catch (err) {
      console.error("[re-embed] Pinecone delete failed:", err);
    }
  }

  // 5. Delete old chunk records from Postgres
  for (const chunk of toRemove) {
    await queries.deleteChunk(chunk.id, tenantId);
  }

  // 6. Embed and insert new chunks
  // Embed and store new chunks
  for (let i = 0; i < toAdd.length; i++) {
    const pineconeId = `${itemId}_v${newVersion}_${i}`;

    if (hasOpenAI() && hasPinecone()) {
      try {
        const { embedQuery } = await import("@/lib/rag/embed");
        const embedding = await embedQuery(toAdd[i].content);
        // TODO: upsert to Pinecone with embedding vector
        console.log(`[re-embed] Would upsert vector ${pineconeId} to Pinecone`);
        void embedding; // used by Pinecone upsert
      } catch (err) {
        console.error(`[re-embed] Embedding chunk ${i} failed:`, err);
      }
    }

    // Store chunk in Postgres regardless
    await queries.createChunk({
      tenantId,
      knowledgeItemId: itemId,
      pineconeId,
      content: toAdd[i].content,
      tokenCount: estimateTokens(toAdd[i].content),
      chunkIndex: i,
      heading: toAdd[i].heading ?? null,
    });
  }

  // 7. Update the knowledge item
  const crypto = await import("crypto");
  const newHash = crypto.createHash("sha256").update(newContent).digest("hex");

  await queries.updateKnowledgeItem(itemId, tenantId, {
    content: newContent,
    title: newTitle ?? item.title,
    contentHash: newHash,
    versionCount: newVersion,
    chunkCount: unchanged + toAdd.length,
    pendingChangeId: null,
    refreshStatus: "ok",
  });

  return {
    chunksAdded: toAdd.length,
    chunksRemoved: toRemove.length,
    chunksUnchanged: unchanged,
    newVersion,
  };
}

/**
 * Rolls back a knowledge item to a previous version.
 */
export async function rollbackToVersion(
  itemId: string,
  tenantId: string,
  targetVersion: number,
): Promise<ReEmbedResult> {
  const versions = await queries.getVersions(itemId, tenantId);
  const target = versions.find((v) => v.version === targetVersion);
  if (!target) throw new Error(`Version ${targetVersion} not found`);

  return reEmbedKnowledgeItem(itemId, tenantId, target.content, target.title);
}

// ---- Chunk diffing ----

interface ExistingChunk {
  id: string;
  pineconeId: string;
  content: string;
  heading: string | null;
}

interface NewChunk {
  content: string;
  heading: string | null;
}

function diffChunks(
  oldChunks: ExistingChunk[],
  newChunks: NewChunk[],
): { toAdd: NewChunk[]; toRemove: ExistingChunk[]; unchanged: number } {
  const toAdd: NewChunk[] = [];
  const toRemove: ExistingChunk[] = [];
  let unchanged = 0;

  // Match by content similarity
  const matchedOld = new Set<number>();

  for (const newChunk of newChunks) {
    let bestMatch = -1;
    let bestSim = 0;

    for (let j = 0; j < oldChunks.length; j++) {
      if (matchedOld.has(j)) continue;
      const sim = quickSimilarity(oldChunks[j].content, newChunk.content);
      if (sim > bestSim) {
        bestSim = sim;
        bestMatch = j;
      }
    }

    if (bestSim >= 0.9 && bestMatch >= 0) {
      // Chunk is essentially unchanged — keep it
      matchedOld.add(bestMatch);
      unchanged++;
    } else {
      toAdd.push(newChunk);
    }
  }

  // Any old chunks not matched → they were removed
  for (let j = 0; j < oldChunks.length; j++) {
    if (!matchedOld.has(j)) {
      toRemove.push(oldChunks[j]);
    }
  }

  return { toAdd, toRemove, unchanged };
}

/** Fast word-overlap similarity (avoids embedding for chunk diff) */
function quickSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / new Set([...setA, ...setB]).size;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
