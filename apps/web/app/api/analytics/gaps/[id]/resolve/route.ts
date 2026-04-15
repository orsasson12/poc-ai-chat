import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { resolveKnowledgeGap, dismissKnowledgeGap } from "@/lib/analytics/queries";
import { hasDatabase } from "@/lib/env";

const bodySchema = z.object({
  action: z.enum(["resolve", "dismiss"]),
  knowledgeItemId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!hasDatabase()) {
    return Response.json({ ok: true, mock: true });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (parsed.data.action === "resolve") {
    await resolveKnowledgeGap(
      session.tenantId,
      id,
      parsed.data.knowledgeItemId ?? null,
    );
  } else {
    await dismissKnowledgeGap(session.tenantId, id);
  }

  return Response.json({ ok: true });
}
