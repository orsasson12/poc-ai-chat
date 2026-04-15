import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { exportTenantData } from "@/lib/compliance/export";
import { createSarRequest, markSarRequestCompleted } from "@/lib/compliance/sar-store";
import { hasDatabase } from "@/lib/env";

/**
 * GET /api/compliance/tenant-export
 *
 * Whole-tenant JSON export. Used by the business owner exercising their own
 * right of access against BizAssist as the processor. Streams a JSON file
 * download containing every row tenant-scoped to the authenticated user.
 */
export async function GET(_request: NextRequest) {
  if (!hasDatabase()) {
    const mock = await exportTenantData("mock");
    return new Response(JSON.stringify(mock, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bizassist-tenant-export.json"`,
      },
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;

  const record = await createSarRequest({
    tenantId,
    type: "tenant_export",
    requestedBy: session.user.id,
  });

  const bundle = await exportTenantData(tenantId);

  if (record) {
    await markSarRequestCompleted(record.id, tenantId);
  }

  const filename = `bizassist-tenant-export-${tenantId}.json`;
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
