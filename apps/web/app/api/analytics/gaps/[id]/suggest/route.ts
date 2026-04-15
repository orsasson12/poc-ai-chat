import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { generateSuggestedQA } from "@/lib/analytics/suggest";
import { hasDatabase } from "@/lib/env";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!hasDatabase()) {
    return Response.json({
      suggestedQuestion: "What are your international shipping costs?",
      suggestedAnswer:
        "We ship to 30+ countries. Rates are calculated at checkout based on destination and weight.",
      mock: true,
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateSuggestedQA(session.tenantId, id);
  if (!result) {
    return Response.json(
      { error: "Could not generate suggestion" },
      { status: 500 },
    );
  }
  return Response.json(result);
}
