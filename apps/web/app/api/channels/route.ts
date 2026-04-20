import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

  if (!hasDatabase()) return Response.json([]);

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const connections = await queries.getChannelConnections(tenantId);
  return Response.json(connections);
}

const createSchema = z.object({
  tenantId: z.string().uuid(),
  assistantId: z.string().uuid(),
  channel: z.enum(["whatsapp", "messenger", "instagram"]),
  accessToken: z.string().min(1),
  phoneNumber: z.string().optional(),
  platformAccountId: z.string().optional(),
  greeting: z.string().optional(),
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ id: "mock", status: "active" });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

  const tenant = await queries.getTenantById(parsed.data.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const webhookSecret = `ba_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const connection = await queries.createChannelConnection({
    tenantId: parsed.data.tenantId,
    assistantId: parsed.data.assistantId,
    channel: parsed.data.channel,
    status: "active",
    accessToken: parsed.data.accessToken,
    platformAccountId: parsed.data.platformAccountId ?? null,
    phoneNumber: parsed.data.phoneNumber ?? null,
    greeting: parsed.data.greeting ?? null,
    webhookSecret,
    connectedAt: new Date(),
  });

  return Response.json({
    id: connection.id,
    status: connection.status,
    webhookSecret,
    webhookUrl: `/api/channels/webhook/${parsed.data.channel}`,
  });
}
