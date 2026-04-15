import { NextRequest } from "next/server";
import { hasDatabase } from "@/lib/env";
import { getMockWidgetConfig } from "@/lib/mock/providers";
import { extractSuggestedQuestions } from "@/lib/knowledge/suggested-questions";
import * as queries from "@/lib/db/queries";
import type { CardData } from "@bizassist/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let config;

  const DEFAULT_AI_DISCLOSURE =
    "You're chatting with an AI assistant. Responses are generated, not written by a human.";

  if (hasDatabase()) {
    const assistant = await queries.getAssistantById(id);
    if (!assistant || !assistant.isActive) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const [knowledgeItems, featuredItems, topQuestions, tenant] = await Promise.all([
      queries.getKnowledgeItems(assistant.tenantId),
      queries.getFeaturedItems(assistant.tenantId),
      queries.getTopQuestions(assistant.tenantId),
      queries.getTenantById(assistant.tenantId),
    ]);

    const topFive = topQuestions.slice(0, 5).map((q) => q.question);
    const suggestedQuestions = topFive.length > 0
      ? topFive
      : extractSuggestedQuestions(knowledgeItems);

    const featuredCards: CardData[] = featuredItems
      .filter((item) => item.type === "structured" && item.metadata)
      .map((item) => {
        const meta = item.metadata as { imageUrl?: string | null; cardType: string; fields: Record<string, string | number | boolean | null> };
        return {
          knowledgeItemId: item.id,
          title: item.title,
          imageUrl: meta.imageUrl ?? null,
          cardType: meta.cardType,
          fields: meta.fields,
          sourceUrl: item.sourceUrl,
        };
      });

    config = {
      name: assistant.name,
      greeting: assistant.greeting,
      avatarUrl: assistant.avatarUrl,
      widgetColor: assistant.widgetColor,
      widgetPosition: assistant.widgetPosition,
      isActive: assistant.isActive,
      suggestedQuestions,
      featuredCards,
      welcomeBanner: assistant.welcomeBanner,
      welcomeButtons: assistant.welcomeButtons,
      aiDisclosure: {
        mode: tenant?.aiDisclosureMode ?? "banner",
        text: tenant?.aiDisclosureText || DEFAULT_AI_DISCLOSURE,
      },
      cookielessMode: assistant.cookielessMode ?? false,
    };
  } else {
    config = {
      ...getMockWidgetConfig(),
      aiDisclosure: { mode: "banner", text: DEFAULT_AI_DISCLOSURE },
      cookielessMode: false,
    };
  }

  return Response.json(config, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
