import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { exportSubjectData } from "@/lib/compliance/export";
import {
  createSarRequest,
  markSarRequestCompleted,
  markSarRequestFailed,
} from "@/lib/compliance/sar-store";
import { hasDatabase } from "@/lib/env";

const exportSchema = z.object({
  email: z.string().email().optional(),
  visitorId: z.string().min(1).max(256).optional(),
  sessionId: z.string().min(1).max(256).optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/compliance/sar/export
 *
 * Filed by the business owner (controller) on behalf of an end-customer (data subject)
 * who has exercised their Art. 15 right of access. Returns an immediate JSON bundle
 * of everything this tenant holds about the subject, and logs the request in sar_requests.
 *
 * The body must provide at least one of: email, visitorId, sessionId.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = exportSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.email && !parsed.data.visitorId && !parsed.data.sessionId) {
    return Response.json(
      { error: "Provide at least one of: email, visitorId, sessionId" },
      { status: 400 },
    );
  }

  if (!hasDatabase()) {
    const mockBundle = await exportSubjectData("mock", parsed.data);
    return Response.json({ request: null, bundle: mockBundle });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;
  const subjectIdentifier = parsed.data.visitorId ?? parsed.data.sessionId ?? null;

  const requestRecord = await createSarRequest({
    tenantId,
    type: "export",
    subjectEmail: parsed.data.email ?? null,
    subjectIdentifier,
    requestedBy: session.user.id,
    notes: parsed.data.notes ?? null,
  });

  try {
    const bundle = await exportSubjectData(tenantId, {
      email: parsed.data.email ?? null,
      visitorId: parsed.data.visitorId ?? null,
      sessionId: parsed.data.sessionId ?? null,
    });
    if (requestRecord) {
      await markSarRequestCompleted(requestRecord.id, tenantId);
    }
    return Response.json({ request: requestRecord, bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (requestRecord) {
      await markSarRequestFailed(requestRecord.id, tenantId, message);
    }
    return Response.json({ error: "Export failed", message }, { status: 500 });
  }
}
