import { and, eq, inArray, or, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";
import type { SubjectIdentity } from "./export";

export interface DeletionCounts {
  conversations: number;
  messages: number;
  leads: number;
  leadEvents: number;
  securityEvents: number;
  chunks: number;
}

const EMPTY_COUNTS: DeletionCounts = {
  conversations: 0,
  messages: 0,
  leads: 0,
  leadEvents: 0,
  securityEvents: 0,
  chunks: 0,
};

function subjectHasIdentifier(subject: SubjectIdentity): boolean {
  return Boolean(
    (subject.email && subject.email.length > 0) ||
      (subject.visitorId && subject.visitorId.length > 0) ||
      (subject.sessionId && subject.sessionId.length > 0),
  );
}

/**
 * Hard-delete every record tied to a data subject inside a tenant.
 * Writes a row to data_deletion_audit with the counts.
 *
 * This is irreversible by design — GDPR Art. 17 erasure is a hard delete, not a tombstone.
 * Pinecone vectors are NOT removed here; they are not per-subject in this architecture
 * (chunks are tenant knowledge, not customer PII). If you later embed per-customer data
 * into Pinecone you must extend this function to delete by namespace+filter.
 */
export async function deleteSubjectData(opts: {
  tenantId: string;
  subject: SubjectIdentity;
  performedBy?: string | null;
  sarRequestId?: string | null;
}): Promise<DeletionCounts> {
  const { tenantId, subject, performedBy = null, sarRequestId = null } = opts;

  if (!subjectHasIdentifier(subject)) {
    throw new Error("At least one subject identifier (email, visitorId, or sessionId) is required");
  }
  if (!hasDatabase()) {
    return EMPTY_COUNTS;
  }

  const d = getDb();
  if (!d) throw new Error("Database not configured");

  // --- Discover affected rows first so we can count them accurately. ---
  const conversationMatchers = [];
  if (subject.email) conversationMatchers.push(eq(s.conversations.customerEmail, subject.email));
  if (subject.sessionId) conversationMatchers.push(eq(s.conversations.sessionId, subject.sessionId));

  const conversationRows = conversationMatchers.length
    ? await d
        .select({ id: s.conversations.id })
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), or(...conversationMatchers)))
    : [];
  const conversationIds = conversationRows.map((c) => c.id);

  const leadMatchers = [];
  if (subject.email) leadMatchers.push(eq(s.leads.email, subject.email));
  if (subject.visitorId) leadMatchers.push(eq(s.leads.visitorId, subject.visitorId));

  const leadRows = leadMatchers.length
    ? await d
        .select({ id: s.leads.id })
        .from(s.leads)
        .where(and(eq(s.leads.tenantId, tenantId), or(...leadMatchers)))
    : [];
  const leadIds = leadRows.map((l) => l.id);

  // Count messages and lead events before delete so the audit row is accurate.
  const messageRows = conversationIds.length
    ? await d
        .select({ id: s.messages.id })
        .from(s.messages)
        .where(
          and(eq(s.messages.tenantId, tenantId), inArray(s.messages.conversationId, conversationIds)),
        )
    : [];

  const leadEventRows = leadIds.length
    ? await d
        .select({ id: s.leadEvents.id })
        .from(s.leadEvents)
        .where(and(eq(s.leadEvents.tenantId, tenantId), inArray(s.leadEvents.leadId, leadIds)))
    : [];

  const securityEventRows = conversationIds.length
    ? await d
        .select({ id: s.securityEvents.id })
        .from(s.securityEvents)
        .where(
          and(
            eq(s.securityEvents.tenantId, tenantId),
            inArray(s.securityEvents.conversationId, conversationIds),
          ),
        )
    : [];

  // --- Delete in FK-safe order. Messages cascade from conversations, lead_events from leads. ---
  if (securityEventRows.length) {
    await d
      .delete(s.securityEvents)
      .where(
        and(
          eq(s.securityEvents.tenantId, tenantId),
          inArray(
            s.securityEvents.id,
            securityEventRows.map((r) => r.id),
          ),
        ),
      );
  }

  if (conversationIds.length) {
    // Messages cascade via FK (onDelete cascade). Deleting conversations removes messages too.
    await d
      .delete(s.conversations)
      .where(
        and(eq(s.conversations.tenantId, tenantId), inArray(s.conversations.id, conversationIds)),
      );
  }

  if (leadIds.length) {
    // lead_events cascade via FK.
    await d
      .delete(s.leads)
      .where(and(eq(s.leads.tenantId, tenantId), inArray(s.leads.id, leadIds)));
  }

  const counts: DeletionCounts = {
    conversations: conversationIds.length,
    messages: messageRows.length,
    leads: leadIds.length,
    leadEvents: leadEventRows.length,
    securityEvents: securityEventRows.length,
    chunks: 0,
  };

  await d.insert(s.dataDeletionAudit).values({
    tenantId,
    deletionType: "customer",
    subjectEmail: subject.email ?? null,
    subjectIdentifier: subject.visitorId ?? subject.sessionId ?? null,
    conversationsDeleted: counts.conversations,
    messagesDeleted: counts.messages,
    leadsDeleted: counts.leads,
    securityEventsDeleted: counts.securityEvents,
    chunksDeleted: 0,
    performedBy,
    sarRequestId,
  });

  return counts;
}

/**
 * Retention-based purge. For each data class, delete rows older than the tenant's
 * configured retention window. Writes one audit row with deletion_type="retention"
 * summarising the totals.
 *
 * `retentionDaysConversations`/`retentionDaysLeads`/`retentionDaysSecurityEvents` of 0
 * means "keep forever" — that class is skipped.
 */
export async function runRetentionPurge(tenantId?: string): Promise<
  { tenantId: string; counts: DeletionCounts }[]
> {
  if (!hasDatabase()) return [];
  const d = getDb();
  if (!d) return [];

  const tenantRows = tenantId
    ? await d
        .select({
          id: s.tenants.id,
          conv: s.tenants.retentionDaysConversations,
          leads: s.tenants.retentionDaysLeads,
          sec: s.tenants.retentionDaysSecurityEvents,
        })
        .from(s.tenants)
        .where(eq(s.tenants.id, tenantId))
    : await d
        .select({
          id: s.tenants.id,
          conv: s.tenants.retentionDaysConversations,
          leads: s.tenants.retentionDaysLeads,
          sec: s.tenants.retentionDaysSecurityEvents,
        })
        .from(s.tenants);

  const results: { tenantId: string; counts: DeletionCounts }[] = [];

  for (const tr of tenantRows) {
    const counts: DeletionCounts = { ...EMPTY_COUNTS };

    // Conversations (cascades messages).
    if (tr.conv > 0) {
      const cutoff = new Date(Date.now() - tr.conv * 86400000);
      const toDelete = await d
        .select({ id: s.conversations.id })
        .from(s.conversations)
        .where(
          and(eq(s.conversations.tenantId, tr.id), lt(s.conversations.startedAt, cutoff)),
        );
      if (toDelete.length) {
        // Count messages for audit first.
        const msgs = await d
          .select({ id: s.messages.id })
          .from(s.messages)
          .where(
            and(
              eq(s.messages.tenantId, tr.id),
              inArray(
                s.messages.conversationId,
                toDelete.map((r) => r.id),
              ),
            ),
          );
        counts.messages += msgs.length;
        await d
          .delete(s.conversations)
          .where(
            and(
              eq(s.conversations.tenantId, tr.id),
              inArray(
                s.conversations.id,
                toDelete.map((r) => r.id),
              ),
            ),
          );
        counts.conversations += toDelete.length;
      }
    }

    // Leads (cascades lead_events).
    if (tr.leads > 0) {
      const cutoff = new Date(Date.now() - tr.leads * 86400000);
      const toDelete = await d
        .select({ id: s.leads.id })
        .from(s.leads)
        .where(and(eq(s.leads.tenantId, tr.id), lt(s.leads.lastSeenAt, cutoff)));
      if (toDelete.length) {
        await d
          .delete(s.leads)
          .where(
            and(
              eq(s.leads.tenantId, tr.id),
              inArray(
                s.leads.id,
                toDelete.map((r) => r.id),
              ),
            ),
          );
        counts.leads += toDelete.length;
      }
    }

    // Security events.
    if (tr.sec > 0) {
      const cutoff = new Date(Date.now() - tr.sec * 86400000);
      const toDelete = await d
        .select({ id: s.securityEvents.id })
        .from(s.securityEvents)
        .where(and(eq(s.securityEvents.tenantId, tr.id), lt(s.securityEvents.createdAt, cutoff)));
      if (toDelete.length) {
        await d
          .delete(s.securityEvents)
          .where(
            and(
              eq(s.securityEvents.tenantId, tr.id),
              inArray(
                s.securityEvents.id,
                toDelete.map((r) => r.id),
              ),
            ),
          );
        counts.securityEvents += toDelete.length;
      }
    }

    // Only write an audit row when anything actually got deleted.
    if (
      counts.conversations + counts.messages + counts.leads + counts.securityEvents >
      0
    ) {
      await d.insert(s.dataDeletionAudit).values({
        tenantId: tr.id,
        deletionType: "retention",
        conversationsDeleted: counts.conversations,
        messagesDeleted: counts.messages,
        leadsDeleted: counts.leads,
        securityEventsDeleted: counts.securityEvents,
        chunksDeleted: 0,
      });
    }

    results.push({ tenantId: tr.id, counts });
  }

  return results;
}
