import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { getKnowledgeGapDetail } from "@/lib/analytics/queries";
import { hasDatabase } from "@/lib/env";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!hasDatabase()) {
    const detail = await getKnowledgeGapDetail("mock", id);
    if (!detail) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(detail);
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const detail = await getKnowledgeGapDetail(session.tenantId, id);
  if (!detail) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(detail);
}
