import { NextRequest } from "next/server";
import { hasDatabase } from "@/lib/env";
import { getApiSession } from "@/lib/auth/session";
import * as queries from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const tenantIdParam = request.nextUrl.searchParams.get("tenantId");

  if (!hasDatabase()) {
    return Response.json({
      questions: [
        { question: "How much does teeth whitening cost?", messageId: "msg_mock_1", conversationId: "conv_003", createdAt: new Date().toISOString() },
        { question: "Do you offer braces for adults?", messageId: "msg_mock_2", conversationId: "conv_005", createdAt: new Date().toISOString() },
      ],
    });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use explicit tenantId param (for per-customer views) or fall back to session tenant
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

  const questions = await queries.getUnansweredQuestions(tenantId);

  return Response.json({
    questions: questions.map((q) => ({
      ...q,
      createdAt: q.createdAt instanceof Date ? q.createdAt.toISOString() : q.createdAt,
    })),
  });
}
