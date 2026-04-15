import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { getPlugin } from "@/lib/integrations/plugin";
import "@/lib/integrations";
import type { IntegrationProvider } from "@bizassist/types";

/** GET — List integrations for a tenant/assistant */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  const assistantId = request.nextUrl.searchParams.get("assistantId");
  if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

  if (!hasDatabase()) return Response.json([]);

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const integrations = await queries.getIntegrations(tenantId, assistantId ?? undefined);
  // Strip sensitive fields before returning
  const safe = integrations.map((i) => ({
    ...i,
    accessToken: i.accessToken ? "***" : null,
    refreshToken: i.refreshToken ? "***" : null,
    apiKey: i.apiKey ? "***" : null,
  }));
  return Response.json(safe);
}

/** POST — Create integration (for generic webhook / API key auth) */
const createSchema = z.object({
  assistantId: z.string().uuid(),
  provider: z.enum(["shopify", "hubspot", "zendesk", "generic_webhook"]),
  label: z.string().min(1).max(256),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  shopDomain: z.string().optional(),
  webhookConfig: z.array(z.object({
    actionName: z.string().min(1),
    description: z.string().min(1),
    method: z.enum(["GET", "POST"]),
    path: z.string().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    queryParams: z.record(z.string(), z.string()).optional(),
    bodyTemplate: z.string().optional(),
    responseMapping: z.record(z.string(), z.string()),
    parameters: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      required: z.boolean(),
    })),
  })).optional(),
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ id: "mock", status: "connected" });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const assistant = await queries.getAssistantById(parsed.data.assistantId);
  if (!assistant) return Response.json({ error: "Assistant not found" }, { status: 404 });

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const integration = await queries.createIntegration({
    tenantId: assistant.tenantId,
    assistantId: assistant.id,
    provider: parsed.data.provider as IntegrationProvider,
    status: parsed.data.apiKey || parsed.data.provider === "generic_webhook" ? "connected" : "disconnected",
    label: parsed.data.label,
    apiKey: parsed.data.apiKey ?? null,
    baseUrl: parsed.data.baseUrl ?? null,
    shopDomain: parsed.data.shopDomain ?? null,
    webhookConfig: parsed.data.webhookConfig ?? [],
    connectedAt: parsed.data.apiKey ? new Date() : null,
  });

  return Response.json({ id: integration.id, status: integration.status });
}

/** DELETE — Remove integration */
export async function DELETE(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ success: true });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const id = body?.id;
  const tenantId = body?.tenantId;
  if (!id || !tenantId) return Response.json({ error: "id and tenantId required" }, { status: 400 });

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.deleteIntegration(id, tenantId);
  return Response.json({ success: true });
}

/** PATCH — Test connection */
const testSchema = z.object({ id: z.string().uuid(), tenantId: z.string().uuid() });

export async function PATCH(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ ok: true });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid" }, { status: 400 });

  const tenant = await queries.getTenantById(parsed.data.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const integration = await queries.getIntegrationById(parsed.data.id, parsed.data.tenantId);
  if (!integration) return Response.json({ error: "Not found" }, { status: 404 });

  const plugin = getPlugin(integration.provider);
  if (!plugin) return Response.json({ error: "Unknown provider" }, { status: 400 });

  const result = await plugin.testConnection(integration as Parameters<typeof plugin.testConnection>[0]);

  if (result.ok) {
    await queries.updateIntegration(integration.id, integration.tenantId, { status: "connected", lastError: null });
  } else {
    await queries.updateIntegration(integration.id, integration.tenantId, { status: "error", lastError: result.error ?? null });
  }

  return Response.json(result);
}
