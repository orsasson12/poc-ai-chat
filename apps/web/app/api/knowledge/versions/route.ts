import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { rollbackToVersion } from "@/lib/knowledge/refresh/re-embed";

/** GET — List versions for a knowledge item */
export async function GET(request: NextRequest) {
  const knowledgeItemId = request.nextUrl.searchParams.get("knowledgeItemId");
  const tenantId = request.nextUrl.searchParams.get("tenantId");

  if (!knowledgeItemId || !tenantId) {
    return Response.json({ error: "knowledgeItemId and tenantId required" }, { status: 400 });
  }

  if (!hasDatabase()) return Response.json([]);

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const versions = await queries.getVersions(knowledgeItemId, tenantId);
  return Response.json(versions);
}

/** POST — Rollback to a specific version */
const rollbackSchema = z.object({
  knowledgeItemId: z.string().uuid(),
  tenantId: z.string().uuid(),
  targetVersion: z.number().min(1),
});

export async function POST(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ success: true });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = rollbackSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const tenant = await queries.getTenantById(parsed.data.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await rollbackToVersion(
      parsed.data.knowledgeItemId,
      parsed.data.tenantId,
      parsed.data.targetVersion,
    );
    return Response.json({ success: true, ...result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Rollback failed" },
      { status: 500 },
    );
  }
}
