import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  plan: z.enum(["starter", "professional", "business"]).optional(),
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  // Assistant fields
  assistantName: z.string().min(1).max(256).optional(),
  greeting: z.string().max(1000).optional(),
  tone: z.string().max(64).optional(),
  fallbackMsg: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  widgetColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  widgetPosition: z.enum(["bottom-right", "bottom-left"]).optional(),
});

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

  const tenant = await queries.getTenantById(id);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [assistant, knowledgeItems, conversations, securityEvents] =
    await Promise.all([
      queries.getAssistantForTenant(id),
      queries.getKnowledgeItems(id),
      queries.getConversations(id),
      queries.getSecurityEvents(id),
    ]);

  return Response.json({
    tenant,
    assistant,
    knowledgeItems,
    conversations,
    securityEvents,
  });
}

export async function PUT(
  request: NextRequest,
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

  const tenant = await queries.getTenantById(id);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, plan, status, assistantName, greeting, tone, fallbackMsg, isActive, widgetColor, widgetPosition } = parsed.data;

  // Update tenant fields
  const tenantUpdates: Record<string, string> = {};
  if (name) tenantUpdates.name = name;
  if (plan) tenantUpdates.plan = plan;
  if (status) tenantUpdates.status = status;

  if (Object.keys(tenantUpdates).length > 0) {
    await queries.updateTenant(id, tenantUpdates);
  }

  // Update assistant fields
  const assistant = await queries.getAssistantForTenant(id);
  if (assistant) {
    const assistantUpdates: Record<string, string | boolean> = {};
    if (assistantName) assistantUpdates.name = assistantName;
    if (greeting) assistantUpdates.greeting = greeting;
    if (tone) assistantUpdates.tone = tone;
    if (fallbackMsg) assistantUpdates.fallbackMsg = fallbackMsg;
    if (isActive !== undefined) assistantUpdates.isActive = isActive;
    if (widgetColor) assistantUpdates.widgetColor = widgetColor;
    if (widgetPosition) assistantUpdates.widgetPosition = widgetPosition;

    if (Object.keys(assistantUpdates).length > 0) {
      await queries.updateAssistant(assistant.id, id, assistantUpdates);
    }
  }

  return Response.json({ success: true });
}
