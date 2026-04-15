import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { getKnowledgeGaps } from "@/lib/analytics/queries";
import * as queries from "@/lib/db/queries";
import { hasDatabase } from "@/lib/env";

const STATUSES = new Set(["open", "resolved", "dismissed"]);

export async function GET(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status") ?? "open";
  const status = STATUSES.has(statusParam)
    ? (statusParam as "open" | "resolved" | "dismissed")
    : "open";
  const tenantIdParam = request.nextUrl.searchParams.get("tenantId");

  if (!hasDatabase()) {
    return Response.json({ clusters: await getKnowledgeGaps("mock", status) });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tenantId = session.tenantId;
  if (tenantIdParam) {
    const tenant = await queries.getTenantById(tenantIdParam);
    if (!tenant || tenant.ownerId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    tenantId = tenantIdParam;
  }

  if (!tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clusters = await getKnowledgeGaps(tenantId, status);
  return Response.json({ clusters });
}
