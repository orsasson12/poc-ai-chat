import { NextRequest } from "next/server";
import { hasDatabase } from "@/lib/env";
import { getMockWidgetConfig } from "@/lib/mock/providers";
import { extractSuggestedQuestions } from "@/lib/knowledge/suggested-questions";
import * as queries from "@/lib/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let config;

  if (hasDatabase()) {
    const assistant = await queries.getAssistantById(id);
    if (!assistant || !assistant.isActive) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const knowledgeItems = await queries.getKnowledgeItems(assistant.tenantId);
    const suggestedQuestions = extractSuggestedQuestions(knowledgeItems);

    config = {
      name: assistant.name,
      greeting: assistant.greeting,
      widgetColor: assistant.widgetColor,
      widgetPosition: assistant.widgetPosition,
      isActive: assistant.isActive,
      suggestedQuestions,
    };
  } else {
    config = getMockWidgetConfig();
  }

  return Response.json(config, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
