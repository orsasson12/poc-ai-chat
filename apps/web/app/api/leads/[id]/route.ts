import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

/** GET — Lead detail with timeline */
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

  const lead = await findAndVerifyLead(id, session.user.id);
  if (!lead) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const events = await queries.getLeadEvents(id, lead.tenantId);

  return Response.json({ lead, events });
}

/** PATCH — Update lead status, intent, tags */
const patchSchema = z.object({
  status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).optional(),
  intent: z.enum(["high", "medium", "low", "unknown"]).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  name: z.string().max(256).optional(),
  email: z.string().email().max(256).optional(),
  phone: z.string().max(64).optional(),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const lead = await findAndVerifyLead(id, session.user.id);
  if (!lead) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.updateLead(id, lead.tenantId, parsed.data);
  return Response.json({ success: true });
}

async function findAndVerifyLead(leadId: string, userId: string) {
  const { getDb } = await import("@/lib/db/client");
  const { leads } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const d = getDb();
  if (!d) return null;

  const rows = await d.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!rows[0]) return null;

  const tenant = await queries.getTenantById(rows[0].tenantId);
  if (!tenant || tenant.ownerId !== userId) return null;

  return rows[0];
}
