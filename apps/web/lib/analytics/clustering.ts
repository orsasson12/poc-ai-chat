import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";
import { embedQuery } from "@/lib/rag/embed";
import { generateClusterLabel } from "./suggest";

// Tunable: cosine similarity to join an existing cluster. TODO tune on real data.
const SIMILARITY_THRESHOLD = 0.82;
const LOOKBACK_DAYS = 30;
const LOW_CONFIDENCE_CUTOFF = 0.5;

export interface ClusteringResult {
  newClusters: number;
  questionsClustered: number;
  skipped: number;
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function updateCentroid(current: number[], incoming: number[], currentCount: number): number[] {
  const out = new Array<number>(current.length);
  const total = currentCount + 1;
  for (let i = 0; i < current.length; i++) {
    out[i] = (current[i] * currentCount + incoming[i]) / total;
  }
  return out;
}

interface InMemoryCluster {
  id: string;
  centroid: number[];
  count: number;
}

export async function runClusteringForTenant(
  tenantId: string,
): Promise<ClusteringResult> {
  if (!hasDatabase()) {
    return { newClusters: 0, questionsClustered: 0, skipped: 0 };
  }
  const d = getDb();
  if (!d) return { newClusters: 0, questionsClustered: 0, skipped: 0 };

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);

  // Find unanswered assistant messages within lookback, then pull the preceding user question.
  // Exclude any user message already in clustered_questions.
  const candidates = await d.execute<{
    message_id: string;
    content: string;
  }>(sql`
    SELECT DISTINCT ON (um.id)
      um.id AS message_id,
      um.content
    FROM messages fb
    JOIN messages um
      ON um.conversation_id = fb.conversation_id
      AND um.role = 'user'
      AND um.created_at < fb.created_at
    LEFT JOIN clustered_questions cq ON cq.message_id = um.id
    WHERE fb.tenant_id = ${tenantId}
      AND fb.role = 'assistant'
      AND (fb.is_fallback = true OR CAST(fb.confidence AS float) < ${LOW_CONFIDENCE_CUTOFF})
      AND fb.created_at >= ${since.toISOString()}
      AND cq.message_id IS NULL
    ORDER BY um.id, um.created_at DESC
    LIMIT 500
  `);

  if (candidates.length === 0) {
    return { newClusters: 0, questionsClustered: 0, skipped: 0 };
  }

  // Load existing open clusters into memory.
  const existingRows = await d
    .select()
    .from(s.questionClusters)
    .where(
      and(
        eq(s.questionClusters.tenantId, tenantId),
        eq(s.questionClusters.status, "open"),
      ),
    );

  const clusters: InMemoryCluster[] = existingRows.map((row) => ({
    id: row.id,
    centroid: row.centroid as number[],
    count: row.questionCount,
  }));

  let newClusters = 0;
  let questionsClustered = 0;
  let skipped = 0;

  for (const c of candidates) {
    let embedding: number[];
    try {
      embedding = await embedQuery(c.content);
    } catch (err) {
      console.error("embedQuery failed for message", c.message_id, err);
      skipped++;
      continue;
    }

    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < clusters.length; i++) {
      const sim = cosine(clusters[i].centroid, embedding);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= SIMILARITY_THRESHOLD) {
      // Join existing cluster
      const cluster = clusters[bestIdx];
      const newCentroid = updateCentroid(cluster.centroid, embedding, cluster.count);
      cluster.centroid = newCentroid;
      cluster.count += 1;

      await d
        .update(s.questionClusters)
        .set({
          centroid: newCentroid,
          questionCount: cluster.count,
          lastSeenAt: new Date(),
        })
        .where(eq(s.questionClusters.id, cluster.id));

      await d.insert(s.clusteredQuestions).values({
        clusterId: cluster.id,
        messageId: c.message_id,
        tenantId,
        questionText: c.content,
        similarity: bestSim.toFixed(4),
      });

      questionsClustered++;
    } else {
      // Create a new cluster
      let label: string;
      try {
        label = await generateClusterLabel([c.content]);
      } catch (err) {
        console.error("generateClusterLabel failed:", err);
        label = c.content.slice(0, 60);
      }

      const [created] = await d
        .insert(s.questionClusters)
        .values({
          tenantId,
          label,
          centroid: embedding,
          questionCount: 1,
          status: "open",
        })
        .returning({ id: s.questionClusters.id });

      if (created) {
        await d.insert(s.clusteredQuestions).values({
          clusterId: created.id,
          messageId: c.message_id,
          tenantId,
          questionText: c.content,
          similarity: "1.0000",
        });

        clusters.push({ id: created.id, centroid: embedding, count: 1 });
        newClusters++;
        questionsClustered++;
      } else {
        skipped++;
      }
    }
  }

  return { newClusters, questionsClustered, skipped };
}

export async function runClusteringForAllTenants(): Promise<ClusteringResult> {
  if (!hasDatabase()) {
    return { newClusters: 0, questionsClustered: 0, skipped: 0 };
  }
  const d = getDb();
  if (!d) return { newClusters: 0, questionsClustered: 0, skipped: 0 };

  const tenantRows = await d.selectDistinct({ id: s.conversations.tenantId }).from(s.conversations);
  const totals: ClusteringResult = { newClusters: 0, questionsClustered: 0, skipped: 0 };

  for (const row of tenantRows) {
    const result = await runClusteringForTenant(row.id);
    totals.newClusters += result.newClusters;
    totals.questionsClustered += result.questionsClustered;
    totals.skipped += result.skipped;
  }

  // Silence unused imports that might appear if this file shrinks.
  void desc;
  void gte;
  void isNull;
  void or;

  return totals;
}
