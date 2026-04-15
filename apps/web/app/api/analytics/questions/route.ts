import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { getQuestionAnalytics } from "@/lib/analytics/queries";
import * as queries from "@/lib/db/queries";
import { hasDatabase } from "@/lib/env";

export async function GET(request: NextRequest) {
  const tenantIdParam = request.nextUrl.searchParams.get("tenantId");

  if (!hasDatabase()) {
    return Response.json(await getQuestionAnalytics("mock"));
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

  return Response.json(await getQuestionAnalytics(tenantId));
}
