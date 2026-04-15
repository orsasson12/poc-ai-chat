import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

/**
 * POST — Send a message in an escalated conversation.
 * Used by both agents (from dashboard) and customers (from chat widget).
 *
 * For agents: requires auth session. sender = "agent".
 * For customers: authenticated by sessionId match. sender = "customer".
 */
const messageSchema = z.object({
  content: z.string().min(1).max(2000),
  sender: z.enum(["agent", "customer"]),
  sessionId: z.string().min(8).optional(), // required for customer sender
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: escalationId } = await params;

  if (!hasDatabase()) {
    return Response.json({ id: "mock_msg", status: "sent" });
  }

  const body = await request.json();
  const parsed = messageSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { content, sender, sessionId } = parsed.data;

  // Look up the escalation event
  const { getDb } = await import("@/lib/db/client");
  const { escalationEvents } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return Response.json({ error: "DB unavailable" }, { status: 503 });

  const rows = await d.select().from(escalationEvents).where(eq(escalationEvents.id, escalationId)).limit(1);
  const event = rows[0];
  if (!event) {
    return Response.json({ error: "Escalation not found" }, { status: 404 });
  }

  // Auth check
  if (sender === "agent") {
    const { getApiSession } = await import("@/lib/auth/session");
    const session = await getApiSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Verify agent owns this tenant
    const tenant = await queries.getTenantById(event.tenantId);
    if (!tenant || tenant.ownerId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    // Customer sender — verify sessionId matches the conversation
    if (!sessionId) {
      return Response.json({ error: "sessionId required for customer messages" }, { status: 400 });
    }
    const conv = await queries.getConversationBySession(sessionId, event.assistantId);
    if (!conv || conv.id !== event.conversationId) {
      return Response.json({ error: "Session mismatch" }, { status: 403 });
    }
  }

  // Save message
  const role = sender === "agent" ? "assistant" as const : "user" as const;
  const msg = await queries.createMessage({
    conversationId: event.conversationId,
    tenantId: event.tenantId,
    role,
    content,
  });

  return Response.json({ id: msg.id, sender, createdAt: msg.createdAt });
}

/**
 * GET — SSE stream for live messages in an escalated conversation.
 * Polls for new messages and pushes them to the client.
 *
 * Query params:
 * - after: ISO timestamp to only get messages after this time
 * - role: "agent" or "customer" (determines auth method)
 * - sessionId: required when role=customer
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: escalationId } = await params;
  const afterParam = request.nextUrl.searchParams.get("after");
  const role = request.nextUrl.searchParams.get("role") ?? "agent";
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!hasDatabase()) {
    // In mock mode, return an empty SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: {\"heartbeat\": true}\n\n"));
        // Keep alive for 30s then close
        setTimeout(() => controller.close(), 30000);
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // Look up escalation
  const { getDb } = await import("@/lib/db/client");
  const { escalationEvents } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return Response.json({ error: "DB unavailable" }, { status: 503 });

  const rows = await d.select().from(escalationEvents).where(eq(escalationEvents.id, escalationId)).limit(1);
  const event = rows[0];
  if (!event) {
    return Response.json({ error: "Escalation not found" }, { status: 404 });
  }

  // Auth check
  if (role === "agent") {
    const { getApiSession } = await import("@/lib/auth/session");
    const session = await getApiSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (role === "customer" && sessionId) {
    const conv = await queries.getConversationBySession(sessionId, event.assistantId);
    if (!conv || conv.id !== event.conversationId) {
      return Response.json({ error: "Session mismatch" }, { status: 403 });
    }
  }

  // SSE polling stream
  const encoder = new TextEncoder();
  let lastCheck = afterParam ? new Date(afterParam) : new Date();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Poll every 2 seconds for new messages
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          const messages = await queries.getMessages(event.conversationId, event.tenantId);
          const newMessages = messages.filter((m) => {
            const msgTime = m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt);
            return msgTime > lastCheck;
          });

          for (const msg of newMessages) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                id: msg.id,
                role: msg.role,
                sender: msg.sender,
                content: msg.content,
                createdAt: msg.createdAt,
              })}\n\n`),
            );
          }

          if (newMessages.length > 0) {
            const latestTime = newMessages[newMessages.length - 1].createdAt;
            lastCheck = latestTime instanceof Date ? latestTime : new Date(latestTime);
          }

          // Send heartbeat to keep connection alive
          controller.enqueue(encoder.encode(": heartbeat\n\n"));

          // Check if escalation is resolved — close stream
          const current = await queries.getEscalationEvent(event.id, event.tenantId);
          if (current && (current.status === "resolved" || current.status === "expired")) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "escalation_resolved", status: current.status })}\n\n`),
            );
            closed = true;
            clearInterval(interval);
            controller.close();
          }
        } catch {
          // On error, send heartbeat and continue
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }
      }, 2000);

      // Auto-close after 5 minutes to prevent zombie connections
      setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(interval);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "timeout" })}\n\n`));
          controller.close();
        }
      }, 5 * 60 * 1000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
