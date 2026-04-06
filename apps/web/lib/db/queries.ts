import { eq, and, desc, gte, sql, count, inArray } from "drizzle-orm";
import { getDb } from "./client";
import * as s from "./schema";
import type {
  Assistant,
  Message,
  SecurityEvent,
  DashboardMetrics,
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

// ---- Mappers (numeric → number) ----

function mapAssistant(row: typeof s.assistants.$inferSelect): Assistant {
  return {
    ...row,
    confidenceThreshold: parseFloat(row.confidenceThreshold),
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

export async function getTenantForUser(userId: string) {
  const d = db();
  const rows = await d
    .select({
      id: s.tenants.id,
      ownerId: s.tenants.ownerId,
      name: s.tenants.name,
      slug: s.tenants.slug,
      plan: s.tenants.plan,
      status: s.tenants.status,
      stripeCustomerId: s.tenants.stripeCustomerId,
      createdAt: s.tenants.createdAt,
    })
    .from(s.tenantMembers)
    .innerJoin(s.tenants, eq(s.tenantMembers.tenantId, s.tenants.id))
    .where(eq(s.tenantMembers.userId, userId))
    .limit(1);
  return rows[0] ?? null;
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

    return { tenant, assistant: mapAssistant(assistant) };
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
  data: Partial<Pick<typeof s.assistants.$inferInsert, "name" | "greeting" | "tone" | "fallbackMsg" | "isActive" | "widgetColor" | "widgetPosition">>,
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
  return await d
    .select()
    .from(s.knowledgeItems)
    .where(eq(s.knowledgeItems.tenantId, tenantId))
    .orderBy(desc(s.knowledgeItems.createdAt));
}

export async function createKnowledgeItem(data: {
  tenantId: string;
  assistantId: string;
  type: "document" | "url" | "manual_qa" | "structured";
  title: string;
  content?: string;
  sourceUrl?: string;
}): Promise<KnowledgeItem> {
  const d = db();
  const [item] = await d.insert(s.knowledgeItems).values(data).returning();
  return item;
}

export async function getKnowledgeItemById(id: string) {
  const d = db();
  const rows = await d.select().from(s.knowledgeItems).where(eq(s.knowledgeItems.id, id)).limit(1);
  return rows[0] ?? null;
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
  return await d
    .select()
    .from(s.knowledgeItems)
    .where(and(inArray(s.knowledgeItems.id, ids), eq(s.knowledgeItems.tenantId, tenantId)));
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
    .select()
    .from(s.conversations)
    .where(eq(s.conversations.tenantId, tenantId))
    .orderBy(desc(s.conversations.startedAt));
  return rows as Conversation[];
}

export async function getOrCreateConversation(data: {
  tenantId: string;
  assistantId: string;
  sessionId: string;
}) {
  const d = db();
  const existing = await d
    .select()
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.sessionId, data.sessionId),
        eq(s.conversations.assistantId, data.assistantId),
      ),
    )
    .limit(1);

  if (existing[0]) return existing[0];

  const [conv] = await d.insert(s.conversations).values(data).returning();
  return conv;
}

export async function getConversationBySession(sessionId: string, assistantId: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.sessionId, sessionId),
        eq(s.conversations.assistantId, assistantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ---- Messages ----

export async function getMessages(conversationId: string, tenantId: string): Promise<Message[]> {
  const d = db();
  const rows = await d
    .select()
    .from(s.messages)
    .where(
      and(eq(s.messages.conversationId, conversationId), eq(s.messages.tenantId, tenantId)),
    )
    .orderBy(s.messages.createdAt);
  return rows.map(mapMessage);
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
  const [msg] = await d.insert(s.messages).values(data).returning();

  await d
    .update(s.conversations)
    .set({
      messageCount: sql`${s.conversations.messageCount} + 1`,
      endedAt: new Date(),
    })
    .where(eq(s.conversations.id, data.conversationId));

  return mapMessage(msg);
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
  const rows = await d.select().from(s.messages).where(eq(s.messages.id, messageId)).limit(1);
  return rows[0] ? mapMessage(rows[0]) : null;
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

  const [[todayRow], [weekRow], [monthRow], [escalatedRow], [fallbackRow]] =
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
    ]);

  const total = monthRow.value || 1;
  const resolutionRate = Math.max(0, 1 - escalatedRow.value / total);

  const [csatRow] = await d
    .select({
      avg: sql<string | null>`avg(case when ${s.conversations.satisfaction} != 0 then ${s.conversations.satisfaction} end)`,
    })
    .from(s.conversations)
    .where(eq(s.conversations.tenantId, tenantId));

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

  // Find assistant messages that are fallback, then get the preceding user message
  const fallbackMessages = await d
    .select({
      id: s.messages.id,
      conversationId: s.messages.conversationId,
      createdAt: s.messages.createdAt,
    })
    .from(s.messages)
    .where(
      and(
        eq(s.messages.tenantId, tenantId),
        eq(s.messages.role, "assistant"),
        eq(s.messages.isFallback, true),
      ),
    )
    .orderBy(desc(s.messages.createdAt))
    .limit(50);

  if (fallbackMessages.length === 0) return [];

  // For each fallback, find the user message just before it in the same conversation
  const results: UnansweredQuestion[] = [];

  for (const fb of fallbackMessages) {
    const [userMsg] = await d
      .select({
        id: s.messages.id,
        content: s.messages.content,
        createdAt: s.messages.createdAt,
      })
      .from(s.messages)
      .where(
        and(
          eq(s.messages.conversationId, fb.conversationId),
          eq(s.messages.role, "user"),
          sql`${s.messages.createdAt} < ${fb.createdAt}`,
        ),
      )
      .orderBy(desc(s.messages.createdAt))
      .limit(1);

    if (userMsg) {
      results.push({
        question: userMsg.content,
        messageId: userMsg.id,
        conversationId: fb.conversationId,
        createdAt: userMsg.createdAt,
      });
    }
  }

  return results;
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

  // Get tenants
  const tenants = await d
    .select()
    .from(s.tenants)
    .where(eq(s.tenants.ownerId, ownerId))
    .orderBy(desc(s.tenants.createdAt));

  // For each tenant, get assistant + counts
  const results = await Promise.all(
    tenants.map(async (tenant) => {
      const [assistant] = await d
        .select()
        .from(s.assistants)
        .where(eq(s.assistants.tenantId, tenant.id))
        .limit(1);

      const [kCount] = await d
        .select({ value: count() })
        .from(s.knowledgeItems)
        .where(eq(s.knowledgeItems.tenantId, tenant.id));

      const [cCount] = await d
        .select({ value: count() })
        .from(s.conversations)
        .where(eq(s.conversations.tenantId, tenant.id));

      return {
        ...tenant,
        assistant: assistant ? mapAssistant(assistant) : null,
        knowledgeCount: kCount.value,
        conversationCount: cCount.value,
      };
    }),
  );

  return results;
}

export async function getTenantById(id: string) {
  const d = db();
  const rows = await d
    .select()
    .from(s.tenants)
    .where(eq(s.tenants.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateTenant(
  id: string,
  data: Partial<Pick<typeof s.tenants.$inferInsert, "name" | "slug" | "plan" | "status">>,
) {
  const d = db();
  await d.update(s.tenants).set(data).where(eq(s.tenants.id, id));
}
