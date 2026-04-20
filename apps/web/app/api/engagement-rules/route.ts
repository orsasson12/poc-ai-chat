import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

const messageCtaSchema = z
  .object({ label: z.string().min(1).max(64), url: z.string().min(1).max(2048) })
  .nullable()
  .optional();

const messageButtonsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().min(1).max(64),
      url: z.string().min(1).max(2048),
      style: z.enum(["primary", "secondary"]).optional(),
    }),
  )
  .max(3)
  .optional();

const createSchema = z.object({
  assistantId: z.string().uuid(),
  name: z.string().min(1).max(256),
  trigger: z.enum(["time_on_page", "scroll_depth", "exit_intent", "return_visitor", "url_pattern"]),
  proactiveMessage: z.string().min(1).max(1000),
  delaySeconds: z.number().min(1).max(300).optional(),
  scrollPercent: z.number().min(1).max(100).optional(),
  urlPattern: z.string().max(512).optional(),
  qualifyingQuestions: z.array(z.string().max(500)).max(5).optional(),
  priority: z.number().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  maxPerSession: z.number().int().min(0).max(100).optional(),
  maxPerVisitor: z.number().int().min(0).max(10000).optional(),
  cooldownSeconds: z.number().int().min(0).max(31_536_000).optional(), // up to 1 year
  messageImage: z.string().max(2048).nullable().optional(),
  messageCta: messageCtaSchema,
  messageButtons: messageButtonsSchema,
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ id: "mock_rule", status: "created" });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const assistant = await queries.getAssistantById(parsed.data.assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rule = await queries.createEngagementRule({
    tenantId: assistant.tenantId,
    assistantId: assistant.id,
    name: parsed.data.name,
    trigger: parsed.data.trigger,
    proactiveMessage: parsed.data.proactiveMessage,
    delaySeconds: parsed.data.delaySeconds ?? 15,
    scrollPercent: parsed.data.scrollPercent ?? 50,
    urlPattern: parsed.data.urlPattern ?? null,
    qualifyingQuestions: parsed.data.qualifyingQuestions ?? [],
    priority: parsed.data.priority ?? 100,
    enabled: parsed.data.enabled ?? true,
    maxPerSession: parsed.data.maxPerSession ?? 0,
    maxPerVisitor: parsed.data.maxPerVisitor ?? 0,
    cooldownSeconds: parsed.data.cooldownSeconds ?? 0,
    messageImage: parsed.data.messageImage ?? null,
    messageCta: parsed.data.messageCta ?? null,
    messageButtons: parsed.data.messageButtons ?? [],
  });

  return Response.json(rule);
}

export async function GET(request: NextRequest) {
  const assistantId = request.nextUrl.searchParams.get("assistantId");

  if (!assistantId) {
    return Response.json({ error: "assistantId required" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json([]);
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const rules = await queries.getAllEngagementRules(assistantId, assistant.tenantId);
  return Response.json(rules);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(256).optional(),
  trigger: z.enum(["time_on_page", "scroll_depth", "exit_intent", "return_visitor", "url_pattern"]).optional(),
  proactiveMessage: z.string().min(1).max(1000).optional(),
  delaySeconds: z.number().min(1).max(300).optional(),
  scrollPercent: z.number().min(1).max(100).optional(),
  urlPattern: z.string().max(512).nullable().optional(),
  qualifyingQuestions: z.array(z.string().max(500)).max(5).optional(),
  priority: z.number().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  maxPerSession: z.number().int().min(0).max(100).optional(),
  maxPerVisitor: z.number().int().min(0).max(10000).optional(),
  cooldownSeconds: z.number().int().min(0).max(31_536_000).optional(),
  messageImage: z.string().max(2048).nullable().optional(),
  messageCta: messageCtaSchema,
  messageButtons: messageButtonsSchema,
});

export async function PUT(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;

  // Verify ownership by looking up the rule
  const { getDb } = await import("@/lib/db/client");
  const { engagementRules } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return Response.json({ error: "DB unavailable" }, { status: 503 });

  const rows = await d.select().from(engagementRules).where(eq(engagementRules.id, id)).limit(1);
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  const tenant = await queries.getTenantById(rows[0].tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.updateEngagementRule(id, rows[0].tenantId, updates);
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = (body as { id?: string } | null)?.id;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const { getDb } = await import("@/lib/db/client");
  const { engagementRules } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return Response.json({ error: "DB unavailable" }, { status: 503 });

  const rows = await d.select().from(engagementRules).where(eq(engagementRules.id, id)).limit(1);
  if (!rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  const tenant = await queries.getTenantById(rows[0].tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.deleteEngagementRule(id, rows[0].tenantId);
  return Response.json({ success: true });
}
