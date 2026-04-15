import { NextRequest } from "next/server";
import { runDailyRollup } from "@/lib/analytics/aggregate";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";

/**
 * POST /api/analytics/rollup
 *
 * Trigger daily analytics rollup. Accepts either:
 *  - Authorization: Bearer $CRON_SECRET (Vercel Cron convention) — rolls up for all tenants
 *  - x-cron-secret header matching CRON_SECRET (alternative automated callers)
 *  - authenticated dashboard session (manual "Recompute now" button, tenant-scoped)
 */
// Vercel Cron sends GET requests by default — support both.
export async function GET(request: NextRequest) {
  return POST(request);
}

function isCronAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  const xHeader = request.headers.get("x-cron-secret") ?? "";
  return auth === `Bearer ${expected}` || xHeader === expected;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const daysBack = Number.isFinite(body?.daysBack) ? Math.max(1, Math.min(90, body.daysBack)) : 1;

  if (!hasDatabase()) {
    return Response.json({ ok: true, mock: true, daysBack });
  }

  // Cron path
  if (isCronAuthorized(request)) {
    const result = await runDailyRollup(undefined, daysBack);
    return Response.json({ ok: true, ...result });
  }

  // Manual path — authenticated user, tenant-scoped
  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyRollup(session.tenantId, daysBack);
  return Response.json({ ok: true, ...result });
}
