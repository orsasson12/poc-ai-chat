/**
 * Cross-channel identity resolution.
 *
 * Identifies the same customer across channels by matching:
 * 1. Exact channel-specific ID (fastest, direct match)
 * 2. Phone number (WhatsApp ↔ widget if phone collected)
 * 3. Email (any channel where email was collected)
 *
 * When a match is found, the contact record is merged so all channels
 * share the same conversation history context.
 */

import * as queries from "@/lib/db/queries";
import type { ChannelType } from "@bizassist/types";

interface ResolveResult {
  contactId: string;
  isNew: boolean;
  /** Previous conversations from other channels for context transfer */
  crossChannelHistory: {
    channel: ChannelType;
    messageCount: number;
    lastMessage: string | null;
    lastAt: Date | null;
  }[];
}

/**
 * Resolves or creates a contact for a message from any channel.
 * Returns the contact ID and any cross-channel conversation history.
 */
export async function resolveContactIdentity(opts: {
  tenantId: string;
  channel: ChannelType;
  platformSenderId: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}): Promise<ResolveResult> {
  const { tenantId, channel, platformSenderId } = opts;

  // Step 1: Try direct channel-specific ID match
  let contact = await findByChannelId(tenantId, channel, platformSenderId);

  // Step 2: Try phone number match (WhatsApp provides phone directly)
  if (!contact && opts.phone) {
    contact = await queries.getContactByPhone(tenantId, opts.phone);
    if (contact) {
      // Link this channel ID to the existing contact
      await linkChannelId(contact.id, tenantId, channel, platformSenderId);
    }
  }

  // Step 3: Try email match
  if (!contact && opts.email) {
    contact = await queries.getContactByEmail(tenantId, opts.email);
    if (contact) {
      await linkChannelId(contact.id, tenantId, channel, platformSenderId);
    }
  }

  // Step 4: Create new contact
  if (!contact) {
    const newContact = await createContact({
      tenantId,
      channel,
      platformSenderId,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      name: opts.name ?? null,
    });
    return { contactId: newContact.id, isNew: true, crossChannelHistory: [] };
  }

  // Update last seen
  await queries.updateContactLastSeen(contact.id, tenantId, channel);

  // Step 5: Build cross-channel history for context transfer
  const crossChannelHistory = await getCrossChannelHistory(contact.id, tenantId, channel);

  return {
    contactId: contact.id,
    isNew: false,
    crossChannelHistory,
  };
}

/**
 * Builds a context summary from cross-channel conversations.
 * Used to inject into the LLM prompt so the bot knows about prior interactions.
 */
export function buildCrossChannelContext(
  history: ResolveResult["crossChannelHistory"],
): string | null {
  if (history.length === 0) return null;

  const lines = history.map((h) => {
    const channelLabel = h.channel === "widget" ? "website chat" : h.channel;
    const timeAgo = h.lastAt ? formatRelativeTime(h.lastAt) : "unknown time";
    return `Previously chatted via ${channelLabel} (${h.messageCount} messages, ${timeAgo})${h.lastMessage ? `: "${truncate(h.lastMessage, 100)}"` : ""}`;
  });

  return `RETURNING CUSTOMER CONTEXT:\n${lines.join("\n")}`;
}

// ---- Internal helpers ----

async function findByChannelId(
  tenantId: string,
  channel: ChannelType,
  platformId: string,
) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return null;

  const field =
    channel === "whatsapp" ? s.channelContacts.whatsappId :
    channel === "messenger" ? s.channelContacts.messengerId :
    channel === "instagram" ? s.channelContacts.instagramId :
    s.channelContacts.widgetVisitorId;

  const rows = await d
    .select()
    .from(s.channelContacts)
    .where(and(eq(s.channelContacts.tenantId, tenantId), eq(field, platformId)))
    .limit(1);

  return rows[0] ?? null;
}

async function linkChannelId(
  contactId: string,
  tenantId: string,
  channel: ChannelType,
  platformId: string,
) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return;

  const field =
    channel === "whatsapp" ? "whatsappId" :
    channel === "messenger" ? "messengerId" :
    channel === "instagram" ? "instagramId" :
    "widgetVisitorId";

  await d
    .update(s.channelContacts)
    .set({ [field]: platformId, lastChannel: channel, lastSeenAt: new Date() })
    .where(and(eq(s.channelContacts.id, contactId), eq(s.channelContacts.tenantId, tenantId)));
}

async function createContact(opts: {
  tenantId: string;
  channel: ChannelType;
  platformSenderId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
}) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");

  const d = getDb();
  if (!d) throw new Error("DB not available");

  const data: Record<string, unknown> = {
    tenantId: opts.tenantId,
    email: opts.email,
    phone: opts.phone,
    name: opts.name,
    lastChannel: opts.channel,
  };

  if (opts.channel === "whatsapp") data.whatsappId = opts.platformSenderId;
  else if (opts.channel === "messenger") data.messengerId = opts.platformSenderId;
  else if (opts.channel === "instagram") data.instagramId = opts.platformSenderId;
  else data.widgetVisitorId = opts.platformSenderId;

  const [contact] = await d
    .insert(s.channelContacts)
    .values(data as typeof s.channelContacts.$inferInsert)
    .returning();

  return contact;
}

async function getCrossChannelHistory(
  contactId: string,
  tenantId: string,
  currentChannel: ChannelType,
): Promise<ResolveResult["crossChannelHistory"]> {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and, ne, desc } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return [];

  // Find conversations on OTHER channels for this contact
  const conversations = await d
    .select()
    .from(s.conversations)
    .where(
      and(
        eq(s.conversations.tenantId, tenantId),
        eq(s.conversations.contactId, contactId),
        ne(s.conversations.channel, currentChannel),
      ),
    )
    .orderBy(desc(s.conversations.startedAt))
    .limit(5);

  const history: ResolveResult["crossChannelHistory"] = [];

  for (const conv of conversations) {
    // Get the last message from this conversation
    const msgs = await d
      .select()
      .from(s.messages)
      .where(eq(s.messages.conversationId, conv.id))
      .orderBy(desc(s.messages.createdAt))
      .limit(1);

    history.push({
      channel: conv.channel,
      messageCount: conv.messageCount,
      lastMessage: msgs[0]?.content ?? null,
      lastAt: conv.endedAt ?? conv.startedAt,
    });
  }

  return history;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}
