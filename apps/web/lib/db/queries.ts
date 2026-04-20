import { eq, and, desc, gte, sql, count, inArray } from "drizzle-orm";
import { getDb } from "./client";
import * as s from "./schema";
import type {
  Assistant,
  Message,
  SecurityEvent,
  DashboardMetrics,
  CustomerStats,
  TopQuestion,
  ConversationVolume,
  KnowledgeItem,
  Conversation,
} from "@bizassist/types";

function db() {
  const d = getDb();
  if (!d) throw new Error("Database not configured");
  return d;
}

// Columns that exist in the DB today. The freshness columns (refresh_schedule,
// last_refreshed_at, next_refresh_at, etc.) were added to the Drizzle schema
// but haven't been pushed to the database yet. Select only safe columns and
// backfill defaults so the KnowledgeItem type is satisfied.
const knowledgeItemCols = {
  id: s.knowledgeItems.id,
  tenantId: s.knowledgeItems.tenantId,
  assistantId: s.knowledgeItems.assistantId,
  type: s.knowledgeItems.type,
  title: s.knowledgeItems.title,
  content: s.knowledgeItems.content,
  sourceUrl: s.knowledgeItems.sourceUrl,
  filePath: s.knowledgeItems.filePath,
  fileSize: s.knowledgeItems.fileSize,
  status: s.knowledgeItems.status,
  chunkCount: s.knowledgeItems.chunkCount,
  errorMsg: s.knowledgeItems.errorMsg,
  metadata: s.knowledgeItems.metadata,
  featured: s.knowledgeItems.featured,
  createdAt: s.knowledgeItems.createdAt,
};

function backfillKnowledgeItem(row: typeof knowledgeItemCols extends Record<string, infer _> ? { [K in keyof typeof knowledgeItemCols]: unknown } : never): KnowledgeItem {
  return {
    ...(row as Record<string, unknown>),
    refreshSchedule: "manual",
    lastRefreshedAt: null,
    nextRefreshAt: null,
    refreshStatus: null,
    lastRefreshError: null,
    contentHash: null,
    versionCount: 1,
    pendingChangeId: null,
  } as unknown as KnowledgeItem;
}

// Original conversation columns (before escalation/channel/lead columns were added)
const conversationCols = {
  id: s.conversations.id,
  tenantId: s.conversations.tenantId,
  assistantId: s.conversations.assistantId,
  sessionId: s.conversations.sessionId,
  startedAt: s.conversations.startedAt,
  endedAt: s.conversations.endedAt,
  messageCount: s.conversations.messageCount,
  escalated: s.conversations.escalated,
  satisfaction: s.conversations.satisfaction,
  engagementRuleId: s.conversations.engagementRuleId,
};

function backfillConversation(row: Record<string, unknown>): Conversation {
  return {
    ...row,
    channel: "widget",
    contactId: null,
    channelConversationId: null,
    escalationStatus: null,
    assignedAgentId: null,
    customerEmail: null,
    customerName: null,
    customerLanguage: null,
    customerDevice: null,
    referrerUrl: null,
    leadId: null,
    engagementRuleId: (row as { engagementRuleId?: string | null }).engagementRuleId ?? null,
  } as unknown as Conversation;
}

// Original message columns (before sender/agentId were added)
const messageCols = {
  id: s.messages.id,
  conversationId: s.messages.conversationId,
  tenantId: s.messages.tenantId,
  role: s.messages.role,
  content: s.messages.content,
  chunksUsed: s.messages.chunksUsed,
  confidence: s.messages.confidence,
  latencyMs: s.messages.latencyMs,
  tokensUsed: s.messages.tokensUsed,
  isFallback: s.messages.isFallback,
  feedback: s.messages.feedback,
  createdAt: s.messages.createdAt,
};

function backfillMessage(row: Record<string, unknown>): typeof s.messages.$inferSelect {
  return {
    ...row,
    sender: "bot",
    agentId: null,
  } as typeof s.messages.$inferSelect;
}

// ---- Mappers (numeric → number) ----

function mapAssistant(row: typeof s.assistants.$inferSelect): Assistant {
  return {
    ...row,
    confidenceThreshold: parseFloat(row.confidenceThreshold),
    welcomeButtons: row.welcomeButtons ?? [],
  };
}

function mapMessage(row: typeof s.messages.$inferSelect): Message {
  return {
    ...row,
    confidence: row.confidence ? parseFloat(row.confidence) : null,
    chunksUsed: row.chunksUsed ?? [],
    feedback: (row.feedback as "positive" | "negative" | null) ?? null,
  };
}

function mapSecurityEvent(row: typeof s.securityEvents.$inferSelect): SecurityEvent {
  return {
    ...row,
    classificationScore: parseFloat(row.classificationScore),
  };
}

// ---- Tenant ----

function mapTenant(row: typeof s.tenants.$inferSelect): import("@bizassist/types").Tenant {
  return {
    ...row,
    dataRegion: row.dataRegion as import("@bizassist/types").DataRegion,
    aiDisclosureMode: row.aiDisclosureMode as import("@bizassist/types").AiDisclosureMode,
  };
}

export async function getTenantForUser(userId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.tenantMembers)
    .innerJoin(s.tenants, eq(s.tenantMembers.tenantId, s.tenants.id))
    .where(eq(s.tenantMembers.userId, userId))
    .limit(1);
  return rows[0]?.tenants ? mapTenant(rows[0].tenants) : null;
}

export async function createTenantWithAssistant(
  ownerId: string,
  name: string,
  slug: string,
) {
  const d = db();
  return await d.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(s.tenants)
      .values({ ownerId, name, slug })
      .returning();

    const [assistant] = await tx
      .insert(s.assistants)
      .values({ tenantId: tenant.id, name: `${name} Assistant` })
      .returning();

    await tx.insert(s.tenantMembers).values({
      tenantId: tenant.id,
      userId: ownerId,
      role: "owner",
      acceptedAt: new Date(),
    });

    return { tenant: mapTenant(tenant), assistant: mapAssistant(assistant) };
  });
}

// ---- Assistant ----

export async function getAssistantForTenant(tenantId: string): Promise<Assistant | null> {
  const d = db();
  const rows = await d
    .select()
    .from(s.assistants)
    .where(eq(s.assistants.tenantId, tenantId))
    .limit(1);
  return rows[0] ? mapAssistant(rows[0]) : null;
}

export async function getAssistantById(id: string): Promise<Assistant | null> {
  const d = db();
  const rows = await d
    .select()
    .from(s.assistants)
    .where(eq(s.assistants.id, id))
    .limit(1);
  return rows[0] ? mapAssistant(rows[0]) : null;
}

export async function updateAssistant(
  id: string,
  tenantId: string,
  data: Partial<Pick<typeof s.assistants.$inferInsert, "name" | "greeting" | "tone" | "fallbackMsg" | "escalationEmail" | "avatarUrl" | "isActive" | "widgetColor" | "widgetPosition" | "welcomeBanner" | "welcomeButtons" | "suggestedQuestionsMode" | "suggestedQuestions">>,
) {
  const d = db();
  await d
    .update(s.assistants)
    .set(data)
    .where(and(eq(s.assistants.id, id), eq(s.assistants.tenantId, tenantId)));
}

// ---- Knowledge Items ----

export async function getKnowledgeItems(tenantId: string): Promise<KnowledgeItem[]> {
  const d = db();
  const rows = await d
    .select(knowledgeItemCols)
    .from(s.knowledgeItems)
    .where(eq(s.knowledgeItems.tenantId, tenantId))
    .orderBy(desc(s.knowledgeItems.createdAt));
  return rows.map(backfillKnowledgeItem);
}

export async function createKnowledgeItem(data: {
  tenantId: string;
  assistantId: string;
  type: "document" | "url" | "manual_qa" | "structured";
  title: string;
  content?: string;
  sourceUrl?: string;
  metadata?: import("@bizassist/types").StructuredMetadata | null;
}): Promise<KnowledgeItem> {
  const d = db();
  const [item] = await d.insert(s.knowledgeItems).values(data).returning(knowledgeItemCols);
  return backfillKnowledgeItem(item);
}

export async function getKnowledgeItemById(id: string) {
  const d = db();
  const rows = await d.select(knowledgeItemCols).from(s.knowledgeItems).where(eq(s.knowledgeItems.id, id)).limit(1);
  return rows[0] ? backfillKnowledgeItem(rows[0]) : null;
}

export async function updateKnowledgeItemStatus(
  id: string,
  tenantId: string,
  status: "pending" | "processing" | "active" | "error" | "paused",
) {
  const d = db();
  await d
    .update(s.knowledgeItems)
    .set({ status })
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

export async function updateKnowledgeItemContent(
  id: string,
  tenantId: string,
  content: string,
  status: "pending" | "processing" | "active" | "error" | "paused" = "active",
) {
  const d = db();
  await d
    .update(s.knowledgeItems)
    .set({ content, status })
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

export async function updateKnowledgeItem(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.knowledgeItems.$inferInsert,
    "title" | "content" | "status" | "chunkCount" | "contentHash" |
    "versionCount" | "pendingChangeId" | "refreshStatus" | "refreshSchedule" |
    "lastRefreshedAt" | "nextRefreshAt" | "lastRefreshError"
  >>,
) {
  const d = db();
  await d
    .update(s.knowledgeItems)
    .set(data)
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

export async function updateKnowledgeItemChunkCount(id: string, tenantId: string, chunkCount: number) {
  const d = db();
  await d
    .update(s.knowledgeItems)
    .set({ chunkCount })
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

export async function getKnowledgeItemsByIds(ids: string[], tenantId: string): Promise<KnowledgeItem[]> {
  if (ids.length === 0) return [];
  const d = db();
  const rows = await d
    .select(knowledgeItemCols)
    .from(s.knowledgeItems)
    .where(and(inArray(s.knowledgeItems.id, ids), eq(s.knowledgeItems.tenantId, tenantId)));
  return rows.map(backfillKnowledgeItem);
}

export async function getFeaturedItems(tenantId: string): Promise<KnowledgeItem[]> {
  const d = db();
  const rows = await d
    .select(knowledgeItemCols)
    .from(s.knowledgeItems)
    .where(
      and(
        eq(s.knowledgeItems.tenantId, tenantId),
        eq(s.knowledgeItems.featured, true),
        eq(s.knowledgeItems.status, "active"),
      ),
    )
    .orderBy(s.knowledgeItems.createdAt);
  return rows.map(backfillKnowledgeItem);
}

export async function toggleFeatured(id: string, tenantId: string, featured: boolean) {
  const d = db();
  await d
    .update(s.knowledgeItems)
    .set({ featured })
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

// ---- Chunks ----

export async function createChunk(data: {
  tenantId: string;
  knowledgeItemId: string;
  pineconeId: string;
  content: string;
  tokenCount: number;
  chunkIndex: number;
  heading: string | null;
}) {
  const d = db();
  const [chunk] = await d.insert(s.chunks).values(data).returning();
  return chunk;
}

export async function getChunksForItem(knowledgeItemId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.chunks)
    .where(and(eq(s.chunks.knowledgeItemId, knowledgeItemId), eq(s.chunks.tenantId, tenantId)))
    .orderBy(s.chunks.chunkIndex);
}

export async function deleteChunk(id: string, tenantId: string) {
  const d = db();
  await d.delete(s.chunks).where(and(eq(s.chunks.id, id), eq(s.chunks.tenantId, tenantId)));
}

export async function deleteChunksByKnowledgeItemId(knowledgeItemId: string, tenantId: string) {
  const d = db();
  await d
    .delete(s.chunks)
    .where(and(eq(s.chunks.knowledgeItemId, knowledgeItemId), eq(s.chunks.tenantId, tenantId)));
}

export async function deleteKnowledgeItem(id: string, tenantId: string) {
  const d = db();
  await d
    .delete(s.knowledgeItems)
    .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
}

// ---- Conversations ----

export async function getConversations(tenantId: string): Promise<Conversation[]> {
  const d = db();
  const rows = await d
    .select(conversationCols)
    .from(s.conversations)
    .where(eq(s.conversations.tenantId, tenantId))
    .orderBy(desc(s.conversations.startedAt));
  return rows.map((r) => backfillConversation(r as Record<string, unknown>));
}

export async function getOrCreateConversation(data: {
  tenantId: string;
  assistantId: string;
  sessionId: string;
  engagementRuleId?: string | null;
}) {
  const d = db();
  const existing = await d
    .select(conversationCols)
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.sessionId, data.sessionId),
        eq(s.conversations.assistantId, data.assistantId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    // Existing conversation: if an engagementRuleId is supplied and the row
    // doesn't already have one, set it. This captures the attribution of the
    // rule that first opened the chat even when the conversation was created
    // before the chat message reached the API.
    if (data.engagementRuleId) {
      await d
        .update(s.conversations)
        .set({ engagementRuleId: data.engagementRuleId })
        .where(
          and(
            eq(s.conversations.id, existing[0].id),
            sql`${s.conversations.engagementRuleId} IS NULL`,
          ),
        );
    }
    return backfillConversation(existing[0] as Record<string, unknown>);
  }

  const insertValues = data.engagementRuleId
    ? { ...data, engagementRuleId: data.engagementRuleId }
    : data;
  const [conv] = await d.insert(s.conversations).values(insertValues).returning(conversationCols);
  return backfillConversation(conv as Record<string, unknown>);
}

export async function getConversationBySession(sessionId: string, assistantId: string) {
  const d = db();
  const rows = await d
    .select(conversationCols)
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.sessionId, sessionId),
        eq(s.conversations.assistantId, assistantId),
      ),
    )
    .limit(1);
  return rows[0] ? backfillConversation(rows[0] as Record<string, unknown>) : null;
}

// ---- Messages ----

export async function getMessages(conversationId: string, tenantId: string): Promise<Message[]> {
  const d = db();
  const rows = await d
    .select(messageCols)
    .from(s.messages)
    .where(
      and(eq(s.messages.conversationId, conversationId), eq(s.messages.tenantId, tenantId)),
    )
    .orderBy(s.messages.createdAt);
  return rows.map((r) => mapMessage(backfillMessage(r as Record<string, unknown>)));
}

export async function createMessage(data: {
  conversationId: string;
  tenantId: string;
  role: "user" | "assistant";
  content: string;
  chunksUsed?: string[];
  confidence?: string;
  latencyMs?: number;
  tokensUsed?: number;
  isFallback?: boolean;
}) {
  const d = db();
  const [msg] = await d.insert(s.messages).values(data).returning(messageCols);

  await d
    .update(s.conversations)
    .set({
      messageCount: sql`${s.conversations.messageCount} + 1`,
      endedAt: new Date(),
    })
    .where(eq(s.conversations.id, data.conversationId));

  return mapMessage(backfillMessage(msg as Record<string, unknown>));
}

export async function updateMessageFeedback(
  messageId: string,
  tenantId: string,
  feedback: "positive" | "negative",
) {
  const d = db();
  await d
    .update(s.messages)
    .set({ feedback })
    .where(and(eq(s.messages.id, messageId), eq(s.messages.tenantId, tenantId)));
}

export async function getMessageById(messageId: string) {
  const d = db();
  const rows = await d.select(messageCols).from(s.messages).where(eq(s.messages.id, messageId)).limit(1);
  return rows[0] ? mapMessage(backfillMessage(rows[0] as Record<string, unknown>)) : null;
}

// ---- Security Events ----

export async function getSecurityEvents(tenantId: string): Promise<SecurityEvent[]> {
  const d = db();
  const rows = await d
    .select()
    .from(s.securityEvents)
    .where(eq(s.securityEvents.tenantId, tenantId))
    .orderBy(desc(s.securityEvents.createdAt));
  return rows.map(mapSecurityEvent);
}

export async function createSecurityEvent(data: {
  tenantId: string;
  conversationId?: string;
  eventType: "prompt_injection" | "content_moderation" | "pii_detected" | "canary_leak" | "scope_violation";
  severity: "low" | "medium" | "high" | "critical";
  inputText: string;
  classificationScore: string;
  blocked: boolean;
}) {
  const d = db();
  const [evt] = await d.insert(s.securityEvents).values(data).returning();
  return mapSecurityEvent(evt);
}

// ---- Dashboard Metrics ----

export async function getDashboardMetrics(tenantId: string): Promise<DashboardMetrics> {
  const d = db();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
  const monthStart = new Date(todayStart.getTime() - 30 * 86400000);

  const [[todayRow], [weekRow], [monthRow], [escalatedRow], [fallbackRow], [csatRow]] =
    await Promise.all([
      d
        .select({ value: count() })
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), gte(s.conversations.startedAt, todayStart))),
      d
        .select({ value: count() })
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), gte(s.conversations.startedAt, weekStart))),
      d
        .select({ value: count() })
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), gte(s.conversations.startedAt, monthStart))),
      d
        .select({ value: count() })
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), eq(s.conversations.escalated, true))),
      d
        .select({ value: count() })
        .from(s.messages)
        .where(and(eq(s.messages.tenantId, tenantId), eq(s.messages.isFallback, true))),
      d
        .select({
          avg: sql<string | null>`avg(case when ${s.conversations.satisfaction} != 0 then ${s.conversations.satisfaction} end)`,
        })
        .from(s.conversations)
        .where(eq(s.conversations.tenantId, tenantId)),
    ]);

  const total = monthRow.value || 1;
  const resolutionRate = Math.max(0, 1 - escalatedRow.value / total);

  const csatAvg = csatRow.avg ? parseFloat(csatRow.avg) : 0;
  const csatScore = (csatAvg + 1) / 2; // normalize -1..1 to 0..1

  const healthScore = Math.min(
    100,
    Math.round(resolutionRate * 50 + (1 - fallbackRow.value / Math.max(total, 1)) * 50),
  );

  return {
    conversationsToday: todayRow.value,
    conversationsWeek: weekRow.value,
    conversationsMonth: monthRow.value,
    resolutionRate,
    csatScore,
    unansweredCount: fallbackRow.value,
    healthScore,
  };
}

// ---- Unanswered Questions ----

export interface UnansweredQuestion {
  question: string;
  messageId: string;
  conversationId: string;
  createdAt: Date;
}

export async function getUnansweredQuestions(tenantId: string): Promise<UnansweredQuestion[]> {
  const d = db();

  // Single query: find fallback assistant messages and join with the preceding user message
  const rows = await d.execute<{
    question: string;
    message_id: string;
    conversation_id: string;
    created_at: Date;
  }>(sql`
    SELECT DISTINCT ON (fb.id)
      um.content AS question,
      um.id AS message_id,
      fb.conversation_id,
      um.created_at
    FROM messages fb
    JOIN messages um
      ON um.conversation_id = fb.conversation_id
      AND um.role = 'user'
      AND um.created_at < fb.created_at
    WHERE fb.tenant_id = ${tenantId}
      AND fb.role = 'assistant'
      AND fb.is_fallback = true
    ORDER BY fb.id, um.created_at DESC
    LIMIT 50
  `);

  return rows.map((r) => ({
    question: r.question,
    messageId: r.message_id,
    conversationId: r.conversation_id,
    createdAt: r.created_at,
  }));
}

// ---- Analytics ----

export async function getConversationVolume(tenantId: string): Promise<ConversationVolume[]> {
  const d = db();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const rows = await d
    .select({
      date: sql<string>`to_char(${s.conversations.startedAt}, 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(s.conversations)
    .where(and(eq(s.conversations.tenantId, tenantId), gte(s.conversations.startedAt, thirtyDaysAgo)))
    .groupBy(sql`to_char(${s.conversations.startedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${s.conversations.startedAt}, 'YYYY-MM-DD')`);

  return rows;
}

export async function getTopQuestions(tenantId: string): Promise<TopQuestion[]> {
  const d = db();
  const rows = await d
    .select({
      question: s.messages.content,
      count: count(),
    })
    .from(s.messages)
    .where(and(eq(s.messages.tenantId, tenantId), eq(s.messages.role, "user")))
    .groupBy(s.messages.content)
    .orderBy(desc(count()))
    .limit(10);

  return rows;
}

// Returns the most common *first* user message per conversation, scoped to
// one assistant. Powers the launcher suggested-question chips in auto mode:
// each conversation contributes exactly one vote (its opening message), so
// the result reflects what visitors actually ask first, not total mentions.
export async function getTopFirstUserMessages(
  tenantId: string,
  assistantId: string,
  limit = 5,
): Promise<{ question: string; count: number }[]> {
  const d = db();
  const rows = await d.execute<{ question: string; count: number }>(sql`
    WITH firsts AS (
      SELECT DISTINCT ON (m.conversation_id) m.content
      FROM messages m
      INNER JOIN conversations c ON m.conversation_id = c.id
      WHERE c.tenant_id = ${tenantId}
        AND c.assistant_id = ${assistantId}
        AND m.role = 'user'
      ORDER BY m.conversation_id, m.created_at ASC
    )
    SELECT content AS question, COUNT(*)::int AS count
    FROM firsts
    GROUP BY content
    ORDER BY count DESC, question ASC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({ question: r.question, count: Number(r.count) }));
}

// ---- Customer Stats ----

export async function getCustomerStats(tenantId: string): Promise<CustomerStats> {
  const d = db();

  // Message-level aggregates
  const [msgRow] = await d
    .select({
      avgLatency: sql<string | null>`avg(${s.messages.latencyMs})`,
      totalMessages: count(),
      positiveFeedback: sql<number>`coalesce(sum(case when ${s.messages.feedback} = 'positive' then 1 else 0 end), 0)`,
      negativeFeedback: sql<number>`coalesce(sum(case when ${s.messages.feedback} = 'negative' then 1 else 0 end), 0)`,
      totalTokens: sql<number>`coalesce(sum(${s.messages.tokensUsed}), 0)`,
      confidenceHigh: sql<number>`coalesce(sum(case when ${s.messages.role} = 'assistant' and cast(${s.messages.confidence} as float) >= 0.8 then 1 else 0 end), 0)`,
      confidenceMedium: sql<number>`coalesce(sum(case when ${s.messages.role} = 'assistant' and cast(${s.messages.confidence} as float) >= 0.5 and cast(${s.messages.confidence} as float) < 0.8 then 1 else 0 end), 0)`,
      confidenceLow: sql<number>`coalesce(sum(case when ${s.messages.role} = 'assistant' and (cast(${s.messages.confidence} as float) < 0.5 or ${s.messages.confidence} is null) then 1 else 0 end), 0)`,
    })
    .from(s.messages)
    .where(eq(s.messages.tenantId, tenantId));

  // Conversation-level aggregates
  const [convRow] = await d
    .select({
      totalConversations: count(),
      escalatedCount: sql<number>`coalesce(sum(case when ${s.conversations.escalated} = true then 1 else 0 end), 0)`,
      avgMessages: sql<string | null>`avg(${s.conversations.messageCount})`,
      satisfactionPositive: sql<number>`coalesce(sum(case when ${s.conversations.satisfaction} = 1 then 1 else 0 end), 0)`,
      satisfactionNeutral: sql<number>`coalesce(sum(case when ${s.conversations.satisfaction} = 0 then 1 else 0 end), 0)`,
      satisfactionNegative: sql<number>`coalesce(sum(case when ${s.conversations.satisfaction} = -1 then 1 else 0 end), 0)`,
    })
    .from(s.conversations)
    .where(eq(s.conversations.tenantId, tenantId));

  // Top knowledge items by usage — chunksUsed stores knowledgeItemIds referenced per response.
  const topKiRows = await d
    .select({
      id: s.knowledgeItems.id,
      title: s.knowledgeItems.title,
      usageCount: count(),
    })
    .from(
      sql`(select unnest(${s.messages.chunksUsed}) as ki_id from ${s.messages} where ${s.messages.tenantId} = ${tenantId} and ${s.messages.chunksUsed} is not null) as used_items`,
    )
    .innerJoin(s.knowledgeItems, sql`${s.knowledgeItems.id} = used_items.ki_id`)
    .groupBy(s.knowledgeItems.id, s.knowledgeItems.title)
    .orderBy(desc(count()))
    .limit(5);

  return {
    avgLatencyMs: msgRow.avgLatency ? parseFloat(msgRow.avgLatency) : 0,
    totalMessages: msgRow.totalMessages,
    positiveFeedback: Number(msgRow.positiveFeedback),
    negativeFeedback: Number(msgRow.negativeFeedback),
    totalTokensUsed: Number(msgRow.totalTokens),
    confidenceHigh: Number(msgRow.confidenceHigh),
    confidenceMedium: Number(msgRow.confidenceMedium),
    confidenceLow: Number(msgRow.confidenceLow),
    totalConversations: convRow.totalConversations,
    escalatedCount: Number(convRow.escalatedCount),
    avgMessagesPerConversation: convRow.avgMessages ? parseFloat(convRow.avgMessages) : 0,
    satisfactionPositive: Number(convRow.satisfactionPositive),
    satisfactionNeutral: Number(convRow.satisfactionNeutral),
    satisfactionNegative: Number(convRow.satisfactionNegative),
    topKnowledgeItems: topKiRows.map((r) => ({
      id: r.id,
      title: r.title,
      usageCount: r.usageCount,
    })),
  };
}

// ---- Members ----

export async function getTenantMembers(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.tenantMembers)
    .where(eq(s.tenantMembers.tenantId, tenantId));
}

// ---- Customer (Tenant) Management ----

export async function getAllTenantsForOwner(ownerId: string) {
  const d = db();

  const tenants = await d
    .select()
    .from(s.tenants)
    .where(eq(s.tenants.ownerId, ownerId))
    .orderBy(desc(s.tenants.createdAt));

  if (tenants.length === 0) return [];

  const tenantIds = tenants.map((t) => t.id);

  // Batch: fetch all assistants, knowledge counts, and conversation counts in 3 queries
  const [assistants, knowledgeCounts, conversationCounts] = await Promise.all([
    d.select().from(s.assistants).where(inArray(s.assistants.tenantId, tenantIds)),
    d
      .select({ tenantId: s.knowledgeItems.tenantId, value: count() })
      .from(s.knowledgeItems)
      .where(inArray(s.knowledgeItems.tenantId, tenantIds))
      .groupBy(s.knowledgeItems.tenantId),
    d
      .select({ tenantId: s.conversations.tenantId, value: count() })
      .from(s.conversations)
      .where(inArray(s.conversations.tenantId, tenantIds))
      .groupBy(s.conversations.tenantId),
  ]);

  const assistantMap = new Map(assistants.map((a) => [a.tenantId, a]));
  const knowledgeMap = new Map(knowledgeCounts.map((k) => [k.tenantId, k.value]));
  const convMap = new Map(conversationCounts.map((c) => [c.tenantId, c.value]));

  return tenants.map((tenant) => {
    const assistant = assistantMap.get(tenant.id);
    return {
      ...tenant,
      assistant: assistant ? mapAssistant(assistant) : null,
      knowledgeCount: knowledgeMap.get(tenant.id) ?? 0,
      conversationCount: convMap.get(tenant.id) ?? 0,
    };
  });
}

export async function getTenantById(id: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.tenants)
    .where(eq(s.tenants.id, id))
    .limit(1);
  return rows[0] ? mapTenant(rows[0]) : null;
}

export async function updateTenant(
  id: string,
  data: Partial<Pick<typeof s.tenants.$inferInsert, "name" | "slug" | "plan" | "status">>,
) {
  const d = db();
  await d.update(s.tenants).set(data).where(eq(s.tenants.id, id));
}

// ---- Escalation Rules ----

export async function getEscalationRules(assistantId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.escalationRules)
    .where(
      and(
        eq(s.escalationRules.assistantId, assistantId),
        eq(s.escalationRules.tenantId, tenantId),
      ),
    );
}

export async function upsertEscalationRule(data: typeof s.escalationRules.$inferInsert) {
  const d = db();
  const existing = await d
    .select()
    .from(s.escalationRules)
    .where(
      and(
        eq(s.escalationRules.assistantId, data.assistantId),
        eq(s.escalationRules.trigger, data.trigger),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const { id: _id, ...updates } = data;
    await d
      .update(s.escalationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(s.escalationRules.id, existing[0].id));
    return existing[0];
  }

  const [rule] = await d.insert(s.escalationRules).values(data).returning();
  return rule;
}

// ---- Escalation Events ----

export async function createEscalationEvent(data: typeof s.escalationEvents.$inferInsert) {
  const d = db();
  const [event] = await d.insert(s.escalationEvents).values(data).returning();

  // Mark conversation as escalated
  await d
    .update(s.conversations)
    .set({ escalated: true, escalationStatus: data.status ?? "pending" })
    .where(eq(s.conversations.id, data.conversationId));

  return event;
}

export async function getEscalationEvent(id: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.escalationEvents)
    .where(and(eq(s.escalationEvents.id, id), eq(s.escalationEvents.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveEscalationForConversation(conversationId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.escalationEvents)
    .where(
      and(
        eq(s.escalationEvents.conversationId, conversationId),
        inArray(s.escalationEvents.status, ["pending", "assigned", "active"]),
      ),
    )
    .orderBy(desc(s.escalationEvents.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPendingEscalations(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.escalationEvents)
    .where(
      and(
        eq(s.escalationEvents.tenantId, tenantId),
        inArray(s.escalationEvents.status, ["pending", "assigned", "active"]),
      ),
    )
    .orderBy(s.escalationEvents.createdAt);
}

export async function updateEscalationEvent(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.escalationEvents.$inferInsert,
    "status" | "assignedAgentId" | "assignedAt" | "resolvedAt" | "resolutionNote" |
    "summary" | "webhookDeliveredAt" | "webhookResponseStatus" | "webhookRetries" |
    "emailSentAt" | "emailTo" | "customerEmail" | "customerName"
  >>,
) {
  const d = db();
  await d
    .update(s.escalationEvents)
    .set(data)
    .where(and(eq(s.escalationEvents.id, id), eq(s.escalationEvents.tenantId, tenantId)));

  // Sync escalation status to conversation
  if (data.status) {
    const event = await getEscalationEvent(id, tenantId);
    if (event) {
      await d
        .update(s.conversations)
        .set({
          escalationStatus: data.status,
          assignedAgentId: data.assignedAgentId ?? event.assignedAgentId,
        })
        .where(eq(s.conversations.id, event.conversationId));
    }
  }
}

// ---- Agent Availability ----

export async function getOnlineAgents(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.agentAvailability)
    .where(
      and(
        eq(s.agentAvailability.tenantId, tenantId),
        eq(s.agentAvailability.isOnline, true),
      ),
    );
}

export async function upsertAgentAvailability(data: {
  tenantId: string;
  userId: string;
  isOnline: boolean;
}) {
  const d = db();
  const existing = await d
    .select()
    .from(s.agentAvailability)
    .where(
      and(
        eq(s.agentAvailability.tenantId, data.tenantId),
        eq(s.agentAvailability.userId, data.userId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await d
      .update(s.agentAvailability)
      .set({ isOnline: data.isOnline, lastSeenAt: new Date() })
      .where(eq(s.agentAvailability.id, existing[0].id));
    return existing[0];
  }

  const [row] = await d
    .insert(s.agentAvailability)
    .values({ ...data, lastSeenAt: new Date() })
    .returning();
  return row;
}

// ---- Business Hours ----

export async function getBusinessHours(assistantId: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.businessHours)
    .where(
      and(
        eq(s.businessHours.assistantId, assistantId),
        eq(s.businessHours.tenantId, tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBusinessHours(data: typeof s.businessHours.$inferInsert) {
  const d = db();
  const existing = await d
    .select()
    .from(s.businessHours)
    .where(
      and(
        eq(s.businessHours.assistantId, data.assistantId),
        eq(s.businessHours.tenantId, data.tenantId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const { id: _id, ...updates } = data;
    await d
      .update(s.businessHours)
      .set(updates)
      .where(eq(s.businessHours.id, existing[0].id));
    return existing[0];
  }

  const [row] = await d.insert(s.businessHours).values(data).returning();
  return row;
}

// ---- Recent messages for escalation detection ----

export async function getRecentBotMessages(conversationId: string, tenantId: string, limit = 10) {
  const d = db();
  const rows = await d
    .select()
    .from(s.messages)
    .where(
      and(
        eq(s.messages.conversationId, conversationId),
        eq(s.messages.tenantId, tenantId),
      ),
    )
    .orderBy(desc(s.messages.createdAt))
    .limit(limit);

  return rows.reverse().map(mapMessage);
}

// ---- Engagement Rules ----

export async function getEngagementRules(assistantId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.engagementRules)
    .where(
      and(
        eq(s.engagementRules.assistantId, assistantId),
        eq(s.engagementRules.tenantId, tenantId),
        eq(s.engagementRules.enabled, true),
      ),
    )
    .orderBy(s.engagementRules.priority);
}

export async function getAllEngagementRules(assistantId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.engagementRules)
    .where(
      and(
        eq(s.engagementRules.assistantId, assistantId),
        eq(s.engagementRules.tenantId, tenantId),
      ),
    )
    .orderBy(s.engagementRules.priority);
}

export async function createEngagementRule(data: typeof s.engagementRules.$inferInsert) {
  const d = db();
  const [rule] = await d.insert(s.engagementRules).values(data).returning();
  return rule;
}

export async function updateEngagementRule(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.engagementRules.$inferInsert,
    "name" | "enabled" | "trigger" | "delaySeconds" | "scrollPercent" |
    "urlPattern" | "proactiveMessage" | "qualifyingQuestions" | "priority"
  >>,
) {
  const d = db();
  await d
    .update(s.engagementRules)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(s.engagementRules.id, id), eq(s.engagementRules.tenantId, tenantId)));
}

export async function deleteEngagementRule(id: string, tenantId: string) {
  const d = db();
  await d
    .delete(s.engagementRules)
    .where(and(eq(s.engagementRules.id, id), eq(s.engagementRules.tenantId, tenantId)));
}

export async function incrementEngagementStat(
  ruleId: string,
  tenantId: string,
  event: string,
) {
  const d = db();
  const field =
    event === "impression" ? s.engagementRules.impressions :
    event === "engagement" ? s.engagementRules.engagements :
    event === "lead" ? s.engagementRules.leadsGenerated :
    null;

  if (!field) return;

  await d
    .update(s.engagementRules)
    .set({ [field.name]: sql`${field} + 1` })
    .where(and(eq(s.engagementRules.id, ruleId), eq(s.engagementRules.tenantId, tenantId)));
}

// ---- Leads ----

export async function getLeads(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.leads)
    .where(eq(s.leads.tenantId, tenantId))
    .orderBy(desc(s.leads.lastSeenAt));
}

export async function getLeadById(id: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.leads)
    .where(and(eq(s.leads.id, id), eq(s.leads.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLeadByVisitorId(visitorId: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.leads)
    .where(and(eq(s.leads.visitorId, visitorId), eq(s.leads.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createLead(data: typeof s.leads.$inferInsert) {
  const d = db();
  const [lead] = await d.insert(s.leads).values(data).returning();
  return lead;
}

export async function updateLead(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.leads.$inferInsert,
    "email" | "phone" | "name" | "intent" | "status" | "tags" |
    "qualificationAnswers" | "lastSeenAt"
  >>,
) {
  const d = db();
  await d
    .update(s.leads)
    .set(data)
    .where(and(eq(s.leads.id, id), eq(s.leads.tenantId, tenantId)));
}

export async function updateLeadStats(
  id: string,
  tenantId: string,
  increment: { pageView?: boolean; conversation?: boolean; message?: boolean },
) {
  const d = db();
  const updates: Record<string, unknown> = { lastSeenAt: new Date() };
  if (increment.pageView) updates.totalPageViews = sql`${s.leads.totalPageViews} + 1`;
  if (increment.conversation) updates.totalConversations = sql`${s.leads.totalConversations} + 1`;
  if (increment.message) updates.totalMessages = sql`${s.leads.totalMessages} + 1`;

  await d
    .update(s.leads)
    .set(updates)
    .where(and(eq(s.leads.id, id), eq(s.leads.tenantId, tenantId)));
}

// ---- Lead Events ----

export async function getLeadEvents(leadId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.leadEvents)
    .where(and(eq(s.leadEvents.leadId, leadId), eq(s.leadEvents.tenantId, tenantId)))
    .orderBy(desc(s.leadEvents.createdAt));
}

export async function createLeadEvent(data: typeof s.leadEvents.$inferInsert) {
  const d = db();
  const [event] = await d.insert(s.leadEvents).values(data).returning();
  return event;
}

/**
 * Returns a map of ruleId → lifetime count of `trigger_fired` events for a
 * visitor's lead record, used to enforce engagement_rules.max_per_visitor.
 * Empty object when the visitor has no lead (anonymous — effectively infinite
 * lifetime cap for now).
 */
export async function getVisitorRuleFireCounts(
  tenantId: string,
  visitorId: string,
): Promise<Record<string, number>> {
  const d = db();
  const rows = await d.execute<{ rule_id: string; count: string }>(sql`
    SELECT (e.data->>'ruleId') AS rule_id, COUNT(*)::text AS count
    FROM lead_events e
    INNER JOIN leads l ON l.id = e.lead_id
    WHERE l.tenant_id = ${tenantId}
      AND l.visitor_id = ${visitorId}
      AND e.event_type = 'trigger_fired'
      AND (e.data->>'ruleId') IS NOT NULL
    GROUP BY (e.data->>'ruleId')
  `);
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.rule_id] = Number.parseInt(r.count, 10) || 0;
  }
  return out;
}

// ---- Channel Contacts ----

export async function getContactByPhone(tenantId: string, phone: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.channelContacts)
    .where(and(eq(s.channelContacts.tenantId, tenantId), eq(s.channelContacts.phone, phone)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getContactByEmail(tenantId: string, email: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.channelContacts)
    .where(and(eq(s.channelContacts.tenantId, tenantId), eq(s.channelContacts.email, email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateContactLastSeen(id: string, tenantId: string, channel: string) {
  const d = db();
  await d
    .update(s.channelContacts)
    .set({ lastSeenAt: new Date(), lastChannel: channel as "widget" | "whatsapp" | "messenger" | "instagram" })
    .where(and(eq(s.channelContacts.id, id), eq(s.channelContacts.tenantId, tenantId)));
}

// ---- Channel Connections ----

export async function getChannelConnections(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.channelConnections)
    .where(eq(s.channelConnections.tenantId, tenantId))
    .orderBy(s.channelConnections.createdAt);
}

export async function getChannelConnection(id: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.channelConnections)
    .where(and(eq(s.channelConnections.id, id), eq(s.channelConnections.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createChannelConnection(data: typeof s.channelConnections.$inferInsert) {
  const d = db();
  const [conn] = await d.insert(s.channelConnections).values(data).returning();
  return conn;
}

export async function updateChannelConnection(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.channelConnections.$inferInsert,
    "status" | "accessToken" | "refreshToken" | "tokenExpiresAt" |
    "platformAccountId" | "platformPageId" | "greeting" | "persistentMenu" |
    "iceBreakers" | "connectedAt" | "errorMessage" | "phoneNumberVerified"
  >>,
) {
  const d = db();
  await d
    .update(s.channelConnections)
    .set(data)
    .where(and(eq(s.channelConnections.id, id), eq(s.channelConnections.tenantId, tenantId)));
}

export async function deleteChannelConnection(id: string, tenantId: string) {
  const d = db();
  await d
    .delete(s.channelConnections)
    .where(and(eq(s.channelConnections.id, id), eq(s.channelConnections.tenantId, tenantId)));
}

// ---- Integrations ----

export async function getIntegrations(tenantId: string, assistantId?: string) {
  const d = db();
  const conditions = [eq(s.integrations.tenantId, tenantId)];
  if (assistantId) conditions.push(eq(s.integrations.assistantId, assistantId));
  return await d
    .select()
    .from(s.integrations)
    .where(and(...conditions))
    .orderBy(s.integrations.createdAt);
}

export async function getConnectedIntegrations(tenantId: string, assistantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.integrations)
    .where(
      and(
        eq(s.integrations.tenantId, tenantId),
        eq(s.integrations.assistantId, assistantId),
        eq(s.integrations.status, "connected"),
      ),
    );
}

export async function getIntegrationById(id: string, tenantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.integrations)
    .where(and(eq(s.integrations.id, id), eq(s.integrations.tenantId, tenantId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createIntegration(data: typeof s.integrations.$inferInsert) {
  const d = db();
  const [row] = await d.insert(s.integrations).values(data).returning();
  return row;
}

export async function updateIntegration(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.integrations.$inferInsert,
    "status" | "accessToken" | "refreshToken" | "tokenExpiresAt" |
    "shopDomain" | "apiKey" | "baseUrl" | "scopes" | "webhookConfig" |
    "connectedAt" | "lastUsedAt" | "lastError" | "label"
  >>,
) {
  const d = db();
  await d
    .update(s.integrations)
    .set(data)
    .where(and(eq(s.integrations.id, id), eq(s.integrations.tenantId, tenantId)));
}

export async function deleteIntegration(id: string, tenantId: string) {
  const d = db();
  await d
    .delete(s.integrations)
    .where(and(eq(s.integrations.id, id), eq(s.integrations.tenantId, tenantId)));
}

export async function incrementIntegrationCallCount(id: string, tenantId: string) {
  const d = db();
  await d
    .update(s.integrations)
    .set({ callCount: sql`${s.integrations.callCount} + 1`, lastUsedAt: new Date() })
    .where(and(eq(s.integrations.id, id), eq(s.integrations.tenantId, tenantId)));
}

// ---- Integration Audit Log ----

export async function createAuditEntry(data: typeof s.integrationAuditLog.$inferInsert) {
  const d = db();
  const [entry] = await d.insert(s.integrationAuditLog).values(data).returning();
  return entry;
}

export async function getAuditLog(tenantId: string, integrationId?: string, limit = 50) {
  const d = db();
  const conditions = [eq(s.integrationAuditLog.tenantId, tenantId)];
  if (integrationId) conditions.push(eq(s.integrationAuditLog.integrationId, integrationId));
  return await d
    .select()
    .from(s.integrationAuditLog)
    .where(and(...conditions))
    .orderBy(desc(s.integrationAuditLog.createdAt))
    .limit(limit);
}

// ---- Knowledge Versions ----

export async function getVersions(knowledgeItemId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.knowledgeVersions)
    .where(and(eq(s.knowledgeVersions.knowledgeItemId, knowledgeItemId), eq(s.knowledgeVersions.tenantId, tenantId)))
    .orderBy(desc(s.knowledgeVersions.version));
}

export async function createVersion(data: typeof s.knowledgeVersions.$inferInsert) {
  const d = db();
  const [row] = await d.insert(s.knowledgeVersions).values(data).returning();
  return row;
}

// ---- Knowledge Change Log ----

export async function getPendingChanges(tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.knowledgeChangeLog)
    .where(and(eq(s.knowledgeChangeLog.tenantId, tenantId), eq(s.knowledgeChangeLog.approval, "pending")))
    .orderBy(s.knowledgeChangeLog.createdAt);
}

export async function getChangeLog(knowledgeItemId: string, tenantId: string) {
  const d = db();
  return await d
    .select()
    .from(s.knowledgeChangeLog)
    .where(and(eq(s.knowledgeChangeLog.knowledgeItemId, knowledgeItemId), eq(s.knowledgeChangeLog.tenantId, tenantId)))
    .orderBy(desc(s.knowledgeChangeLog.createdAt));
}

export async function createChangeEntry(data: typeof s.knowledgeChangeLog.$inferInsert) {
  const d = db();
  const [row] = await d.insert(s.knowledgeChangeLog).values(data).returning();
  return row;
}

export async function updateChangeApproval(
  id: string,
  tenantId: string,
  data: { approval: "approved" | "rejected" | "auto_approved"; reviewedBy?: string; reviewNote?: string },
) {
  const d = db();
  await d
    .update(s.knowledgeChangeLog)
    .set({ ...data, reviewedAt: new Date() })
    .where(and(eq(s.knowledgeChangeLog.id, id), eq(s.knowledgeChangeLog.tenantId, tenantId)));
}

// ---- Items due for refresh ----

export async function getItemsDueForRefresh(limit = 50): Promise<KnowledgeItem[]> {
  // Freshness columns (next_refresh_at etc.) haven't been pushed to DB yet.
  // Return empty until schema is migrated.
  try {
    const d = db();
    const now = new Date();
    const rows = await d
      .select(knowledgeItemCols)
      .from(s.knowledgeItems)
      .where(
        and(
          eq(s.knowledgeItems.type, "url"),
          eq(s.knowledgeItems.status, "active"),
          sql`${s.knowledgeItems.nextRefreshAt} <= ${now}`,
        ),
      )
      .orderBy(s.knowledgeItems.nextRefreshAt)
      .limit(limit);
    return rows.map(backfillKnowledgeItem);
  } catch {
    return [];
  }
}

export async function updateRefreshStatus(
  id: string,
  tenantId: string,
  data: Partial<Pick<
    typeof s.knowledgeItems.$inferInsert,
    "refreshStatus" | "lastRefreshedAt" | "nextRefreshAt" | "lastRefreshError" | "contentHash" | "versionCount" | "pendingChangeId"
  >>,
) {
  // Freshness columns may not exist in DB yet — silently skip if so
  try {
    const d = db();
    await d
      .update(s.knowledgeItems)
      .set(data)
      .where(and(eq(s.knowledgeItems.id, id), eq(s.knowledgeItems.tenantId, tenantId)));
  } catch {
    // columns not yet migrated
  }
}
