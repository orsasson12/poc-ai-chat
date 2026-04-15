import { and, eq, gte, lt, desc, sql, count, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";
import {
  getMockAnalyticsOverview,
  getMockKnowledgeGaps,
  getMockKnowledgeGapDetail,
  getMockQuestionAnalytics,
  getMockSourceAnalytics,
} from "@/lib/mock/analytics";
import type {
  AnalyticsOverview,
  KnowledgeGapDetail,
  KnowledgeGapSummary,
  QuestionAnalytics,
  SourceAnalytics,
} from "./types";

function dbOrNull() {
  return hasDatabase() ? getDb() : null;
}

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

// ---- Overview ----

export async function getAnalyticsOverview(
  tenantId: string,
  days = 30,
): Promise<AnalyticsOverview> {
  const d = dbOrNull();
  if (!d) return getMockAnalyticsOverview(days);

  const since = daysAgo(days);
  const prevSince = daysAgo(days * 2);

  const [kpiRow] = await d
    .select({
      totalConversations: sql<number>`count(distinct ${s.conversations.id})`,
      escalated: sql<number>`coalesce(sum(case when ${s.conversations.escalated} = true then 1 else 0 end), 0)`,
      deflected: sql<number>`coalesce(sum(case when ${s.conversations.escalated} = false and ${s.conversations.satisfaction} >= 0 then 1 else 0 end), 0)`,
      avgMessages: sql<string | null>`avg(${s.conversations.messageCount})`,
      satisfactionAvg: sql<string | null>`avg(case when ${s.conversations.satisfaction} != 0 then ${s.conversations.satisfaction} end)`,
    })
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.tenantId, tenantId),
        gte(s.conversations.startedAt, since),
      ),
    );

  const [msgRow] = await d
    .select({
      avgConfidence: sql<string | null>`avg(cast(${s.messages.confidence} as float))`,
      avgLatency: sql<string | null>`avg(${s.messages.latencyMs})`,
      fallbackCount: sql<number>`coalesce(sum(case when ${s.messages.isFallback} = true then 1 else 0 end), 0)`,
      total: count(),
    })
    .from(s.messages)
    .where(
      and(
        eq(s.messages.tenantId, tenantId),
        eq(s.messages.role, "assistant"),
        gte(s.messages.createdAt, since),
      ),
    );

  const [tenantRow] = await d
    .select({ costPerTicketCents: s.tenants.costPerTicketCents })
    .from(s.tenants)
    .where(eq(s.tenants.id, tenantId))
    .limit(1);

  const costPerTicketCents = tenantRow?.costPerTicketCents ?? 500;

  const total = Number(kpiRow?.totalConversations ?? 0);
  const escalated = Number(kpiRow?.escalated ?? 0);
  const deflected = Number(kpiRow?.deflected ?? 0);

  // Trends from analytics_daily
  const dailyRows = await d
    .select()
    .from(s.analyticsDaily)
    .where(
      and(
        eq(s.analyticsDaily.tenantId, tenantId),
        gte(s.analyticsDaily.date, daysAgoIso(days - 1)),
      ),
    )
    .orderBy(s.analyticsDaily.date);

  const volume = dailyRows.map((r) => ({
    date: String(r.date),
    count: r.conversationCount,
  }));
  const confidence = dailyRows.map((r) => ({
    date: String(r.date),
    value: r.avgConfidence ? parseFloat(r.avgConfidence) : 0,
  }));
  const csat = dailyRows.map((r) => ({
    date: String(r.date),
    positive: r.positiveFeedback,
    neutral: Math.max(0, r.conversationCount - r.positiveFeedback - r.negativeFeedback),
    negative: r.negativeFeedback,
  }));

  // Conversation length histogram
  const lengthRows = await d
    .select({
      bucket: sql<string>`case
        when ${s.conversations.messageCount} <= 2 then '1-2'
        when ${s.conversations.messageCount} <= 5 then '3-5'
        when ${s.conversations.messageCount} <= 10 then '6-10'
        when ${s.conversations.messageCount} <= 20 then '11-20'
        else '20+'
      end`,
      count: count(),
    })
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.tenantId, tenantId),
        gte(s.conversations.startedAt, since),
      ),
    )
    .groupBy(
      sql`case
        when ${s.conversations.messageCount} <= 2 then '1-2'
        when ${s.conversations.messageCount} <= 5 then '3-5'
        when ${s.conversations.messageCount} <= 10 then '6-10'
        when ${s.conversations.messageCount} <= 20 then '11-20'
        else '20+'
      end`,
    );

  // Top questions in range
  const topQuestions = await d
    .select({
      question: s.messages.content,
      count: count(),
    })
    .from(s.messages)
    .where(
      and(
        eq(s.messages.tenantId, tenantId),
        eq(s.messages.role, "user"),
        gte(s.messages.createdAt, since),
      ),
    )
    .groupBy(s.messages.content)
    .orderBy(desc(count()))
    .limit(10);

  // Open cluster count
  const [gapCountRow] = await d
    .select({ value: count() })
    .from(s.questionClusters)
    .where(
      and(
        eq(s.questionClusters.tenantId, tenantId),
        eq(s.questionClusters.status, "open"),
      ),
    );

  // avoid unused var lint if prevSince path not used yet
  void prevSince;

  const avgConfidence = msgRow?.avgConfidence ? parseFloat(msgRow.avgConfidence) : 0;
  const fallbackRate = msgRow?.total ? Number(msgRow.fallbackCount) / Number(msgRow.total) : 0;
  const satAvg = kpiRow?.satisfactionAvg ? parseFloat(kpiRow.satisfactionAvg) : 0;
  const csatScore = (satAvg + 1) / 2;

  return {
    range: {
      days,
      startDate: daysAgoIso(days - 1),
      endDate: daysAgoIso(0),
    },
    kpis: {
      totalConversations: total,
      resolutionRate: total > 0 ? Math.max(0, 1 - escalated / total) : 0,
      avgConfidence,
      csatScore,
      avgResponseMs: msgRow?.avgLatency ? parseFloat(msgRow.avgLatency) : 0,
      deflectedCount: deflected,
      fallbackRate,
      avgMessagesPerConv: kpiRow?.avgMessages ? parseFloat(kpiRow.avgMessages) : 0,
    },
    trends: {
      volume,
      confidence,
      csat,
      lengthHistogram: lengthRows.map((r) => ({ bucket: r.bucket, count: r.count })),
    },
    savings: {
      deflectedCount: deflected,
      costPerTicketCents,
      totalSavedCents: deflected * costPerTicketCents,
      rangeLabel: `Last ${days} days`,
    },
    topQuestions,
    openGapCount: Number(gapCountRow?.value ?? 0),
  };
}

// ---- Knowledge gaps ----

export async function getKnowledgeGaps(
  tenantId: string,
  status: "open" | "resolved" | "dismissed" = "open",
): Promise<KnowledgeGapSummary[]> {
  const d = dbOrNull();
  if (!d) return getMockKnowledgeGaps();

  const clusters = await d
    .select()
    .from(s.questionClusters)
    .where(
      and(
        eq(s.questionClusters.tenantId, tenantId),
        eq(s.questionClusters.status, status),
      ),
    )
    .orderBy(desc(s.questionClusters.questionCount));

  if (clusters.length === 0) return [];

  const clusterIds = clusters.map((c) => c.id);
  const representatives = await d
    .select({
      clusterId: s.clusteredQuestions.clusterId,
      questionText: s.clusteredQuestions.questionText,
    })
    .from(s.clusteredQuestions)
    .where(inArray(s.clusteredQuestions.clusterId, clusterIds))
    .orderBy(desc(s.clusteredQuestions.createdAt));

  const repByCluster = new Map<string, string>();
  for (const r of representatives) {
    if (!repByCluster.has(r.clusterId)) {
      repByCluster.set(r.clusterId, r.questionText);
    }
  }

  return clusters.map((c) => ({
    id: c.id,
    label: c.label,
    questionCount: c.questionCount,
    avgConfidence: c.avgConfidence ? parseFloat(c.avgConfidence) : null,
    lastSeenAt: c.lastSeenAt.toISOString(),
    firstSeenAt: c.firstSeenAt.toISOString(),
    status: c.status as "open" | "resolved" | "dismissed",
    representativeQuestion: repByCluster.get(c.id) ?? c.label,
    suggestedQuestion: c.suggestedQuestion,
  }));
}

export async function getKnowledgeGapDetail(
  tenantId: string,
  clusterId: string,
): Promise<KnowledgeGapDetail | null> {
  const d = dbOrNull();
  if (!d) return getMockKnowledgeGapDetail(clusterId);

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

  const questions = await d
    .select({
      messageId: s.clusteredQuestions.messageId,
      text: s.clusteredQuestions.questionText,
      createdAt: s.clusteredQuestions.createdAt,
      conversationId: s.messages.conversationId,
    })
    .from(s.clusteredQuestions)
    .innerJoin(s.messages, eq(s.messages.id, s.clusteredQuestions.messageId))
    .where(eq(s.clusteredQuestions.clusterId, clusterId))
    .orderBy(desc(s.clusteredQuestions.createdAt))
    .limit(50);

  return {
    id: cluster.id,
    label: cluster.label,
    questionCount: cluster.questionCount,
    avgConfidence: cluster.avgConfidence ? parseFloat(cluster.avgConfidence) : null,
    lastSeenAt: cluster.lastSeenAt.toISOString(),
    firstSeenAt: cluster.firstSeenAt.toISOString(),
    status: cluster.status as "open" | "resolved" | "dismissed",
    representativeQuestion: questions[0]?.text ?? cluster.label,
    suggestedQuestion: cluster.suggestedQuestion,
    suggestedAnswer: cluster.suggestedAnswer,
    questions: questions.map((q) => ({
      messageId: q.messageId,
      text: q.text,
      conversationId: q.conversationId,
      createdAt: q.createdAt.toISOString(),
    })),
  };
}

export async function resolveKnowledgeGap(
  tenantId: string,
  clusterId: string,
  knowledgeItemId: string | null,
): Promise<void> {
  const d = dbOrNull();
  if (!d) return;

  await d
    .update(s.questionClusters)
    .set({
      status: "resolved",
      knowledgeItemId,
      lastSeenAt: new Date(),
    })
    .where(
      and(
        eq(s.questionClusters.id, clusterId),
        eq(s.questionClusters.tenantId, tenantId),
      ),
    );
}

export async function dismissKnowledgeGap(
  tenantId: string,
  clusterId: string,
): Promise<void> {
  const d = dbOrNull();
  if (!d) return;

  await d
    .update(s.questionClusters)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(s.questionClusters.id, clusterId),
        eq(s.questionClusters.tenantId, tenantId),
      ),
    );
}

// ---- Question analytics ----

export async function getQuestionAnalytics(
  tenantId: string,
): Promise<QuestionAnalytics> {
  const d = dbOrNull();
  if (!d) return getMockQuestionAnalytics();

  const since = daysAgo(7);
  const prev = daysAgo(14);

  const [top, currentWeek, previousWeek, low] = await Promise.all([
    d
      .select({ question: s.messages.content, count: count() })
      .from(s.messages)
      .where(and(eq(s.messages.tenantId, tenantId), eq(s.messages.role, "user")))
      .groupBy(s.messages.content)
      .orderBy(desc(count()))
      .limit(10),
    d
      .select({ question: s.messages.content, count: count() })
      .from(s.messages)
      .where(
        and(
          eq(s.messages.tenantId, tenantId),
          eq(s.messages.role, "user"),
          gte(s.messages.createdAt, since),
        ),
      )
      .groupBy(s.messages.content)
      .orderBy(desc(count()))
      .limit(20),
    d
      .select({ question: s.messages.content, count: count() })
      .from(s.messages)
      .where(
        and(
          eq(s.messages.tenantId, tenantId),
          eq(s.messages.role, "user"),
          gte(s.messages.createdAt, prev),
          lt(s.messages.createdAt, since),
        ),
      )
      .groupBy(s.messages.content),
    d
      .select({
        question: s.messages.content,
        avgConfidence: sql<string>`avg(cast(${s.messages.confidence} as float))`,
        count: count(),
      })
      .from(s.messages)
      .where(
        and(
          eq(s.messages.tenantId, tenantId),
          eq(s.messages.role, "assistant"),
          sql`cast(${s.messages.confidence} as float) < 0.5`,
        ),
      )
      .groupBy(s.messages.content)
      .orderBy(desc(count()))
      .limit(10),
  ]);

  const prevMap = new Map(previousWeek.map((r) => [r.question, r.count]));
  const trending = currentWeek
    .map((r) => {
      const previousCount = prevMap.get(r.question) ?? 0;
      const changePct =
        previousCount === 0
          ? r.count > 2
            ? 999
            : 0
          : Math.round(((r.count - previousCount) / previousCount) * 100);
      return { question: r.question, count: r.count, previousCount, changePct };
    })
    .filter((r) => r.changePct >= 100)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 10);

  return {
    top,
    trending,
    lowConfidence: low.map((r) => ({
      question: r.question,
      avgConfidence: parseFloat(r.avgConfidence),
      count: r.count,
    })),
  };
}

// ---- Source analytics ----

export async function getSourceAnalytics(
  tenantId: string,
): Promise<SourceAnalytics> {
  const d = dbOrNull();
  if (!d) return getMockSourceAnalytics();

  const rows = await d.execute<{
    id: string;
    title: string;
    type: string;
    usage_count: string | number;
    avg_confidence: string | null;
    positive: string | number;
    negative: string | number;
  }>(sql`
    SELECT
      ki.id,
      ki.title,
      ki.type::text AS type,
      COUNT(*) AS usage_count,
      AVG(used.confidence) AS avg_confidence,
      COALESCE(SUM(CASE WHEN used.feedback = 'positive' THEN 1 ELSE 0 END), 0) AS positive,
      COALESCE(SUM(CASE WHEN used.feedback = 'negative' THEN 1 ELSE 0 END), 0) AS negative
    FROM (
      SELECT
        UNNEST(chunks_used) AS ki_id,
        CAST(confidence AS float) AS confidence,
        feedback
      FROM messages
      WHERE tenant_id = ${tenantId}
        AND chunks_used IS NOT NULL
        AND role = 'assistant'
    ) used
    INNER JOIN knowledge_items ki ON ki.id = used.ki_id
    WHERE ki.tenant_id = ${tenantId}
    GROUP BY ki.id, ki.title, ki.type
    ORDER BY usage_count DESC
    LIMIT 50
  `);

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      usageCount: Number(r.usage_count),
      avgConfidenceWhenUsed: r.avg_confidence ? parseFloat(r.avg_confidence) : null,
      positiveFeedback: Number(r.positive),
      negativeFeedback: Number(r.negative),
    })),
  };
}
