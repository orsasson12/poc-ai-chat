import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import * as queries from "@/lib/db/queries";
import { hasDatabase } from "@/lib/env";

export async function GET(request: NextRequest) {
  const rangeParam = request.nextUrl.searchParams.get("range") ?? "30";
  const days = Math.max(1, Math.min(90, Number.parseInt(rangeParam, 10) || 30));
  const tenantIdParam = request.nextUrl.searchParams.get("tenantId");

  if (!hasDatabase()) {
    const overview = await getAnalyticsOverview("mock", days);
    return Response.json(overview);
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

  const overview = await getAnalyticsOverview(tenantId, days);
  return Response.json(overview);
}
