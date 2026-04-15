import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { buildEscalationContext } from "@/lib/escalation/context";
import { sendEscalationEmail } from "@/lib/escalation/email";
import type { EscalationTrigger, EscalationMode } from "@bizassist/types";

// POST — Trigger an escalation (called by the chat pipeline or manually)
const triggerSchema = z.object({
  conversationId: z.string().uuid(),
  assistantId: z.string().uuid(),
  trigger: z.enum(["low_confidence", "explicit_request", "repeat_failure", "safety", "sentiment"]),
  mode: z.enum(["email", "native", "webhook"]),
  confidence: z.number().min(0).max(1),
  botDraftAnswer: z.string().nullable().optional(),
  knowledgeSourceIds: z.array(z.string()).optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ id: "mock_escalation", status: "pending" });
  }

  const body = await request.json();
  const parsed = triggerSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { conversationId, assistantId, trigger, mode, confidence, botDraftAnswer, knowledgeSourceIds, customerEmail, customerName } = parsed.data;

  // Resolve tenant from assistant
  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }
  const tenantId = assistant.tenantId;

  // Check if there's already an active escalation for this conversation
  const existing = await queries.getActiveEscalationForConversation(conversationId);
  if (existing) {
    return Response.json({ id: existing.id, status: existing.status, message: "Escalation already active" });
  }

  // Create escalation event
  const event = await queries.createEscalationEvent({
    tenantId,
    conversationId,
    assistantId,
    trigger: trigger as EscalationTrigger,
    mode: mode as EscalationMode,
    status: "pending",
    confidenceAtEscalation: confidence.toFixed(3),
    botDraftAnswer: botDraftAnswer ?? null,
    knowledgeSourceIds: knowledgeSourceIds ?? [],
    customerEmail: customerEmail ?? null,
    customerName: customerName ?? null,
  });

  // Build context package
  const context = await buildEscalationContext({
    conversationId,
    tenantId,
    assistantId,
    trigger: trigger as EscalationTrigger,
    confidence,
    botDraftAnswer: botDraftAnswer ?? null,
    knowledgeSourceIds: knowledgeSourceIds ?? [],
  });
  context.escalationId = event.id;

  // Store summary on the event
  await queries.updateEscalationEvent(event.id, tenantId, {
    summary: context.summary,
  });

  // Handle mode-specific delivery
  if (mode === "email") {
    const escalationEmail = assistant.escalationEmail;
    if (escalationEmail) {
      try {
        await sendEscalationEmail({
          to: escalationEmail,
          context,
        });
        await queries.updateEscalationEvent(event.id, tenantId, {
          emailSentAt: new Date(),
          emailTo: escalationEmail,
          status: "active",
        });
      } catch (err) {
        console.error("Failed to send escalation email:", err);
        // Event stays pending — can be retried
      }
    }
  }

  // For "native" mode, the event stays "pending" until an agent claims it
  // For "webhook" mode, delivery happens in Mission 7

  return Response.json({
    id: event.id,
    status: event.status,
    mode,
    context,
  });
}

// GET — List escalations for a tenant (agent dashboard)
export async function GET(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json([]);
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }

  // Verify ownership
  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const escalations = await queries.getPendingEscalations(tenantId);
  return Response.json(escalations);
}
