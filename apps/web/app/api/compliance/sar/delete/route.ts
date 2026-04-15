import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { deleteSubjectData } from "@/lib/compliance/delete";
import {
  createSarRequest,
  markSarRequestCompleted,
  markSarRequestFailed,
} from "@/lib/compliance/sar-store";
import { hasDatabase } from "@/lib/env";

const deleteSchema = z.object({
  email: z.string().email().optional(),
  visitorId: z.string().min(1).max(256).optional(),
  sessionId: z.string().min(1).max(256).optional(),
  // Belt-and-braces: owner must type DELETE to confirm the irreversible action.
  confirm: z.literal("DELETE"),
  notes: z.string().max(1000).optional(),
});

/**
 * POST /api/compliance/sar/delete
 *
 * Filed by the business owner on behalf of an end-customer exercising their
 * Art. 17 right to erasure. Hard-deletes every row tied to the subject within
 * the tenant and writes a data_deletion_audit row (retained for the controller's
 * records).
 *
 * This endpoint requires `confirm: "DELETE"` in the request body — deliberate
 * friction to prevent accidental erasure.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);

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
    return Response.json({
      request: null,
      counts: {
        conversations: 0,
        messages: 0,
        leads: 0,
        leadEvents: 0,
        securityEvents: 0,
        chunks: 0,
      },
      mock: true,
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.tenantId;
  const subjectIdentifier = parsed.data.visitorId ?? parsed.data.sessionId ?? null;

  const requestRecord = await createSarRequest({
    tenantId,
    type: "delete",
    subjectEmail: parsed.data.email ?? null,
    subjectIdentifier,
    requestedBy: session.user.id,
    notes: parsed.data.notes ?? null,
  });

  try {
    const counts = await deleteSubjectData({
      tenantId,
      subject: {
        email: parsed.data.email ?? null,
        visitorId: parsed.data.visitorId ?? null,
        sessionId: parsed.data.sessionId ?? null,
      },
      performedBy: session.user.id,
      sarRequestId: requestRecord?.id ?? null,
    });
    if (requestRecord) {
      await markSarRequestCompleted(requestRecord.id, tenantId);
    }
    return Response.json({ request: requestRecord, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (requestRecord) {
      await markSarRequestFailed(requestRecord.id, tenantId, message);
    }
    return Response.json({ error: "Deletion failed", message }, { status: 500 });
  }
}
