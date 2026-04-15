import { NextRequest } from "next/server";
import {
  runClusteringForAllTenants,
  runClusteringForTenant,
} from "@/lib/analytics/clustering";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";

/**
 * POST /api/analytics/cluster
 *
 * Run greedy cosine clustering over unanswered questions.
 * Cron path (x-cron-secret) clusters for all tenants.
 * Dashboard path clusters only the caller's tenant.
 */
function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const xHeader = request.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${expected}` || xHeader === expected;
}

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ ok: true, mock: true });
  }

  if (isCronAuthorized(request)) {
    const result = await runClusteringForAllTenants();
    return Response.json({ ok: true, ...result });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runClusteringForTenant(session.tenantId);
  return Response.json({ ok: true, ...result });
}
