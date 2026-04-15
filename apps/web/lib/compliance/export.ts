import { and, eq, or, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";

export interface SubjectIdentity {
  email?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
}

export interface SubjectExport {
  schemaVersion: "1.0";
  exportedAt: string;
  tenantId: string;
  subject: SubjectIdentity;
  conversations: unknown[];
  messages: unknown[];
  leads: unknown[];
  leadEvents: unknown[];
  securityEvents: unknown[];
}

export interface TenantExport {
  schemaVersion: "1.0";
  exportedAt: string;
  tenantId: string;
  tenant: unknown;
  assistants: unknown[];
  knowledgeItems: unknown[];
  conversations: unknown[];
  messages: unknown[];
  leads: unknown[];
  leadEvents: unknown[];
  securityEvents: unknown[];
  analyticsDaily: unknown[];
}

function subjectHasIdentifier(subject: SubjectIdentity): boolean {
  return Boolean(
    (subject.email && subject.email.length > 0) ||
      (subject.visitorId && subject.visitorId.length > 0) ||
      (subject.sessionId && subject.sessionId.length > 0),
  );
}

/**
 * Gather every row tied to the subject within the tenant.
 * Lookup strategy — OR across every available identifier:
 *  - conversations.customer_email OR conversations.session_id
 *  - leads.email OR leads.visitor_id
 *  - messages / lead_events by parent id
 *
 * Returns an empty bundle (not an error) if no rows match — the controller should
 * still be able to confirm "we hold no data about this subject" with a signed response.
 */
export async function exportSubjectData(
  tenantId: string,
  subject: SubjectIdentity,
): Promise<SubjectExport> {
  if (!subjectHasIdentifier(subject)) {
    throw new Error("At least one subject identifier (email, visitorId, or sessionId) is required");
  }
  if (!hasDatabase()) {
    return {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      tenantId,
      subject,
      conversations: [],
      messages: [],
      leads: [],
      leadEvents: [],
      securityEvents: [],
    };
  }

  const d = getDb();
  if (!d) {
    throw new Error("Database not configured");
  }

  // 1. Conversations matched by email or session id.
  const conversationMatchers = [];
  if (subject.email) {
    conversationMatchers.push(eq(s.conversations.customerEmail, subject.email));
  }
  if (subject.sessionId) {
    conversationMatchers.push(eq(s.conversations.sessionId, subject.sessionId));
  }

  const conversationRows = conversationMatchers.length
    ? await d
        .select()
        .from(s.conversations)
        .where(and(eq(s.conversations.tenantId, tenantId), or(...conversationMatchers)))
    : [];

  const conversationIds = conversationRows.map((c) => c.id);

  // 2. Messages in those conversations.
  const messageRows = conversationIds.length
    ? await d
        .select()
        .from(s.messages)
        .where(
          and(eq(s.messages.tenantId, tenantId), inArray(s.messages.conversationId, conversationIds)),
        )
    : [];

  // 3. Leads matched by email or visitor id.
  const leadMatchers = [];
  if (subject.email) {
    leadMatchers.push(eq(s.leads.email, subject.email));
  }
  if (subject.visitorId) {
    leadMatchers.push(eq(s.leads.visitorId, subject.visitorId));
  }

  const leadRows = leadMatchers.length
    ? await d
        .select()
        .from(s.leads)
        .where(and(eq(s.leads.tenantId, tenantId), or(...leadMatchers)))
    : [];

  const leadIds = leadRows.map((l) => l.id);

  // 4. Lead events for matched leads.
  const leadEventRows = leadIds.length
    ? await d
        .select()
        .from(s.leadEvents)
        .where(
          and(eq(s.leadEvents.tenantId, tenantId), inArray(s.leadEvents.leadId, leadIds)),
        )
    : [];

  // 5. Security events linked to matched conversations.
  const securityEventRows = conversationIds.length
    ? await d
        .select()
        .from(s.securityEvents)
        .where(
          and(
            eq(s.securityEvents.tenantId, tenantId),
            inArray(s.securityEvents.conversationId, conversationIds),
          ),
        )
    : [];

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    tenantId,
    subject,
    conversations: conversationRows,
    messages: messageRows,
    leads: leadRows,
    leadEvents: leadEventRows,
    securityEvents: securityEventRows,
  };
}

/**
 * Whole-tenant export — for the controller (business owner) exercising their own
 * right of access against us (the processor). Everything scoped to tenant_id.
 */
export async function exportTenantData(tenantId: string): Promise<TenantExport> {
  if (!hasDatabase()) {
    return {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      tenantId,
      tenant: { id: tenantId, mock: true },
      assistants: [],
      knowledgeItems: [],
      conversations: [],
      messages: [],
      leads: [],
      leadEvents: [],
      securityEvents: [],
      analyticsDaily: [],
    };
  }

  const d = getDb();
  if (!d) {
    throw new Error("Database not configured");
  }

  const [tenant] = await d.select().from(s.tenants).where(eq(s.tenants.id, tenantId)).limit(1);

  const [assistants, knowledgeItems, conversations, messages, leads, leadEvents, securityEvents, analyticsDaily] =
    await Promise.all([
      d.select().from(s.assistants).where(eq(s.assistants.tenantId, tenantId)),
      d.select().from(s.knowledgeItems).where(eq(s.knowledgeItems.tenantId, tenantId)),
      d.select().from(s.conversations).where(eq(s.conversations.tenantId, tenantId)),
      d.select().from(s.messages).where(eq(s.messages.tenantId, tenantId)),
      d.select().from(s.leads).where(eq(s.leads.tenantId, tenantId)),
      d.select().from(s.leadEvents).where(eq(s.leadEvents.tenantId, tenantId)),
      d.select().from(s.securityEvents).where(eq(s.securityEvents.tenantId, tenantId)),
      d.select().from(s.analyticsDaily).where(eq(s.analyticsDaily.tenantId, tenantId)),
    ]);

  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    tenantId,
    tenant: tenant ?? null,
    assistants,
    knowledgeItems,
    conversations,
    messages,
    leads,
    leadEvents,
    securityEvents,
    analyticsDaily,
  };
}
