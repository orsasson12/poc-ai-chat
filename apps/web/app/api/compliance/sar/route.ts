import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { listSarRequests } from "@/lib/compliance/sar-store";
import { hasDatabase } from "@/lib/env";

/**
 * GET /api/compliance/sar
 *
 * List SAR requests (export/delete/tenant_export) filed on the caller's tenant.
 * Used by the compliance dashboard to render the request history table.
 */
export async function GET(_request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({
      requests: [
        {
          id: "sar_mock_1",
          tenantId: "mock",
          type: "export",
          subjectEmail: "customer@example.com",
          subjectIdentifier: null,
          status: "completed",
          requestedBy: null,
          requestedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          resultPath: null,
          errorMsg: null,
          notes: null,
        },
      ],
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await listSarRequests(session.tenantId);
  return Response.json({ requests });
}
