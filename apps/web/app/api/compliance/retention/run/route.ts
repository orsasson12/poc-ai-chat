import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { runRetentionPurge } from "@/lib/compliance/delete";
import { hasDatabase } from "@/lib/env";

function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const xHeader = request.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${expected}` || xHeader === expected;
}

/**
 * POST /api/compliance/retention/run
 *
 * Applies each tenant's retention policy (conversations / leads / security events)
 * and writes a data_deletion_audit row when anything was pruned.
 *
 * Auth:
 *  - Authorization: Bearer $CRON_SECRET → runs for ALL tenants (Vercel Cron)
 *  - Dashboard session → runs for the caller's tenant only
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ ok: true, mock: true, results: [] });
  }

  if (isCronAuthorized(request)) {
    const results = await runRetentionPurge();
    return Response.json({ ok: true, results });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await runRetentionPurge(session.tenantId);
  return Response.json({ ok: true, results });
}
