import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

// GET — Get escalation details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!hasDatabase()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the escalation and verify ownership
  const event = await findAndVerifyEscalation(id, session.user.id);
  if (!event) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch conversation messages for full context
  const messages = await queries.getMessages(event.conversationId, event.tenantId);

  return Response.json({ event, messages });
}

// PATCH — Update escalation (accept, resolve, reassign)
const patchSchema = z.object({
  action: z.enum(["accept", "resolve", "expire"]),
  resolutionNote: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await findAndVerifyEscalation(id, session.user.id);
  if (!event) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { action, resolutionNote } = parsed.data;

  switch (action) {
    case "accept": {
      if (event.status !== "pending") {
        return Response.json({ error: "Can only accept pending escalations" }, { status: 400 });
      }
      await queries.updateEscalationEvent(id, event.tenantId, {
        status: "active",
        assignedAgentId: session.user.id,
        assignedAt: new Date(),
      });
      break;
    }

    case "resolve": {
      if (event.status !== "active" && event.status !== "assigned") {
        return Response.json({ error: "Can only resolve active escalations" }, { status: 400 });
      }
      await queries.updateEscalationEvent(id, event.tenantId, {
        status: "resolved",
        resolvedAt: new Date(),
        resolutionNote: resolutionNote ?? null,
      });
      break;
    }

    case "expire": {
      await queries.updateEscalationEvent(id, event.tenantId, {
        status: "expired",
        resolvedAt: new Date(),
        resolutionNote: resolutionNote ?? "Expired without resolution",
      });
      break;
    }
  }

  return Response.json({ success: true, action });
}

async function findAndVerifyEscalation(escalationId: string, userId: string) {
  // We need to find the escalation and verify the user owns the tenant
  // Since getEscalationEvent requires tenantId, we do a two-step lookup
  const d = await import("@/lib/db/client").then((m) => m.getDb());
  if (!d) return null;

  const { escalationEvents } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await d
    .select()
    .from(escalationEvents)
    .where(eq(escalationEvents.id, escalationId))
    .limit(1);

  if (!rows[0]) return null;

  const tenant = await queries.getTenantById(rows[0].tenantId);
  if (!tenant || tenant.ownerId !== userId) return null;

  return rows[0];
}
