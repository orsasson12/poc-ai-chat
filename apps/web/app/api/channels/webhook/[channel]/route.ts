import { NextRequest } from "next/server";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { processChannelMessage } from "@/lib/channels/pipeline";
import { buildChannelPayload } from "@/lib/channels/format-response";
import type { ChannelType, InboundMessage } from "@bizassist/types";

const VALID_CHANNELS = new Set(["whatsapp", "messenger", "instagram"]);
const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

/**
 * GET — Webhook verification (Meta platforms use GET with hub.challenge).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!VALID_CHANNELS.has(channel)) {
    return Response.json({ error: "Invalid channel" }, { status: 400 });
  }

  // Meta webhook verification
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    // Verify token matches any active connection for this channel
    if (hasDatabase()) {
      const connection = await findConnectionByVerifyToken(token, channel as ChannelType);
      if (connection) {
        return new Response(challenge, { status: 200 });
      }
    }
    // In dev/mock mode, accept any verification
    if (!hasDatabase()) {
      return new Response(challenge, { status: 200 });
    }
    return Response.json({ error: "Invalid verify token" }, { status: 403 });
  }

  return Response.json({ error: "Missing verification params" }, { status: 400 });
}

/**
 * POST — Receive incoming messages from Meta platforms.
 * Normalizes the payload, runs through the pipeline, and sends the response.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> },
) {
  const { channel } = await params;
  if (!VALID_CHANNELS.has(channel)) {
    return Response.json({ error: "Invalid channel" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Always respond 200 to Meta quickly to avoid retries
  // Process asynchronously
  handleWebhookAsync(channel as ChannelType, body).catch((err) => {
    console.error(`[${channel} webhook] Processing error:`, err);
  });

  return Response.json({ status: "ok" });
}

/**
 * Async message processing — runs after 200 is returned to Meta.
 */
async function handleWebhookAsync(channel: ChannelType, body: unknown): Promise<void> {
  if (!hasDatabase()) return;

  const messages = parseMetaWebhook(channel, body);
  if (messages.length === 0) return;

  for (const inbound of messages) {
    // Skip non-text messages for now (media support is future work)
    if (!inbound.text) continue;

    // Resolve contact for cross-channel continuity
    await resolveContact(inbound);

    // Process through the unified pipeline
    const result = await processChannelMessage(inbound);

    // Build channel-specific payload
    const payload = buildChannelPayload(
      channel,
      result.outbound,
      inbound.platformSenderId,
    );

    // Look up connection for access token
    const connection = await findConnectionByPlatformId(channel, inbound);
    if (!connection?.accessToken) {
      console.error(`[${channel}] No access token for tenant ${inbound.tenantId}`);
      return;
    }

    // Send response via Meta Graph API
    await sendToMeta(channel, payload, connection.accessToken, connection.platformAccountId ?? "");

    // Update connection last webhook timestamp
    await updateConnectionTimestamp(connection.id, inbound.tenantId);
  }
}

// ---- Meta webhook parsing ----

function parseMetaWebhook(channel: ChannelType, body: unknown): InboundMessage[] {
  const messages: InboundMessage[] = [];
  const data = body as Record<string, unknown>;

  if (!data.entry || !Array.isArray(data.entry)) return messages;

  for (const entry of data.entry as Record<string, unknown>[]) {
    if (channel === "whatsapp") {
      const changes = (entry.changes as Record<string, unknown>[]) ?? [];
      for (const change of changes) {
        const value = change.value as Record<string, unknown>;
        if (!value?.messages) continue;
        const metadata = value.metadata as Record<string, string>;
        const waMessages = value.messages as Record<string, unknown>[];

        for (const msg of waMessages) {
          const textObj = msg.text as { body: string } | undefined;
          messages.push({
            platformMessageId: msg.id as string,
            channel: "whatsapp",
            platformSenderId: msg.from as string,
            text: textObj?.body ?? "",
            media: [],
            quickReplyPayload: null,
            rawPayload: msg,
            timestamp: new Date(parseInt(msg.timestamp as string) * 1000),
            tenantId: "", // resolved by findConnectionByPlatformId
            assistantId: "",
            connectionId: "",
          });
          // Store phone number ID for response routing
          (messages[messages.length - 1] as unknown as Record<string, unknown>)._phoneNumberId = metadata?.phone_number_id;
        }
      }
    } else {
      // Messenger + Instagram share the same webhook structure
      const messaging = (entry.messaging as Record<string, unknown>[]) ?? [];
      for (const event of messaging) {
        const sender = event.sender as { id: string };
        const message = event.message as { mid: string; text?: string; quick_reply?: { payload: string } } | undefined;
        if (!message || !sender) continue;

        messages.push({
          platformMessageId: message.mid,
          channel,
          platformSenderId: sender.id,
          text: message.text ?? "",
          media: [],
          quickReplyPayload: message.quick_reply?.payload ?? null,
          rawPayload: event,
          timestamp: new Date(event.timestamp as number),
          tenantId: "",
          assistantId: "",
          connectionId: "",
        });
        // Store page ID for connection lookup
        const recipient = event.recipient as { id: string } | undefined;
        (messages[messages.length - 1] as unknown as Record<string, unknown>)._pageId = recipient?.id ?? entry.id;
      }
    }
  }

  return messages;
}

// ---- Connection resolution ----

async function findConnectionByVerifyToken(token: string, channel: ChannelType) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return null;

  const rows = await d
    .select()
    .from(s.channelConnections)
    .where(and(eq(s.channelConnections.webhookSecret, token), eq(s.channelConnections.channel, channel)))
    .limit(1);
  return rows[0] ?? null;
}

async function findConnectionByPlatformId(channel: ChannelType, inbound: InboundMessage) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return null;

  const extra = inbound as unknown as Record<string, unknown>;
  let rows;

  if (channel === "whatsapp") {
    const phoneNumberId = extra._phoneNumberId as string;
    if (!phoneNumberId) return null;
    rows = await d
      .select()
      .from(s.channelConnections)
      .where(and(eq(s.channelConnections.platformAccountId, phoneNumberId), eq(s.channelConnections.channel, "whatsapp")))
      .limit(1);
  } else {
    const pageId = extra._pageId as string;
    if (!pageId) return null;
    rows = await d
      .select()
      .from(s.channelConnections)
      .where(and(eq(s.channelConnections.platformPageId, pageId), eq(s.channelConnections.channel, channel)))
      .limit(1);
  }

  const connection = rows?.[0];
  if (connection) {
    // Populate inbound with resolved tenant/assistant
    inbound.tenantId = connection.tenantId;
    inbound.assistantId = connection.assistantId;
    inbound.connectionId = connection.id;
  }

  return connection ?? null;
}

async function updateConnectionTimestamp(connectionId: string, tenantId: string) {
  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return;

  await d
    .update(s.channelConnections)
    .set({ lastWebhookAt: new Date() })
    .where(and(eq(s.channelConnections.id, connectionId), eq(s.channelConnections.tenantId, tenantId)));
}

// ---- Contact resolution for cross-channel continuity ----

async function resolveContact(inbound: InboundMessage) {
  if (!inbound.tenantId) return;

  const { getDb } = await import("@/lib/db/client");
  const s = await import("@/lib/db/schema");
  const { eq, and, or } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return;

  // Try to find existing contact by channel-specific ID
  const channelField =
    inbound.channel === "whatsapp" ? s.channelContacts.whatsappId :
    inbound.channel === "messenger" ? s.channelContacts.messengerId :
    inbound.channel === "instagram" ? s.channelContacts.instagramId :
    s.channelContacts.widgetVisitorId;

  const rows = await d
    .select()
    .from(s.channelContacts)
    .where(and(eq(s.channelContacts.tenantId, inbound.tenantId), eq(channelField, inbound.platformSenderId)))
    .limit(1);

  if (rows[0]) {
    // Update last seen
    await d
      .update(s.channelContacts)
      .set({ lastSeenAt: new Date(), lastChannel: inbound.channel, totalMessages: rows[0].totalMessages + 1 })
      .where(eq(s.channelContacts.id, rows[0].id));
    return;
  }

  // Create new contact
  const contactData: Record<string, unknown> = {
    tenantId: inbound.tenantId,
    lastChannel: inbound.channel,
  };

  if (inbound.channel === "whatsapp") {
    contactData.whatsappId = inbound.platformSenderId;
    contactData.phone = inbound.platformSenderId; // WhatsApp ID is the phone number
  } else if (inbound.channel === "messenger") {
    contactData.messengerId = inbound.platformSenderId;
  } else if (inbound.channel === "instagram") {
    contactData.instagramId = inbound.platformSenderId;
  }

  await d.insert(s.channelContacts).values(contactData as typeof s.channelContacts.$inferInsert);
}

// ---- Meta Graph API delivery ----

async function sendToMeta(
  channel: ChannelType,
  payload: unknown,
  accessToken: string,
  platformAccountId: string,
): Promise<void> {
  let url: string;

  if (channel === "whatsapp") {
    url = `${META_GRAPH_URL}/${platformAccountId}/messages`;
  } else {
    // Messenger + Instagram use the same Send API
    url = `${META_GRAPH_URL}/me/messages`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error(`[${channel}] Send failed:`, res.status, error);
  }
}
