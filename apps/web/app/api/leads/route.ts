import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

/** GET — List leads for a tenant */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");

  if (!tenantId) {
    return Response.json({ error: "tenantId required" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json([]);
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const leads = await queries.getLeads(tenantId);
  return Response.json(leads);
}
