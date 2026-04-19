import type { Viewport } from "next";
import { ChatWindow } from "@/components/chat/chat-window";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockAssistant, mockKnowledgeItems, mockTopQuestions } from "@/lib/mock/data";
import { extractSuggestedQuestions } from "@/lib/knowledge/suggested-questions";
import type { CardData } from "@bizassist/types";

// Opt this route into edge-to-edge safe-area handling so env(safe-area-inset-*)
// resolves to real notch/home-indicator insets on iOS. Scoped to the chat page
// so dashboard layout is unaffected.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

function buildFeaturedCards(
  items: { id: string; title: string; type: string; sourceUrl: string | null; metadata: unknown }[],
): CardData[] {
  return items
    .filter((item) => item.type === "structured" && item.metadata && typeof item.metadata === "object")
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
}

const DEFAULT_AI_DISCLOSURE =
  "You're chatting with an AI assistant. Responses are generated, not written by a human.";

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  let assistant;
  let suggestedQuestions: string[] = [];
  let featuredCards: CardData[] = [];
  let aiDisclosureMode: "banner" | "inline" | "off" = "banner";
  let aiDisclosureText: string = DEFAULT_AI_DISCLOSURE;

  if (hasDatabase()) {
    assistant = await queries.getAssistantById(id);
    if (assistant) {
      const [knowledgeItems, featuredItems, topQuestions, tenant] = await Promise.all([
        queries.getKnowledgeItems(assistant.tenantId),
        queries.getFeaturedItems(assistant.tenantId),
        queries.getTopQuestions(assistant.tenantId),
        queries.getTenantById(assistant.tenantId),
      ]);

      // Use top questions (by real user demand) if available, otherwise fall back to knowledge-based suggestions
      const topFive = topQuestions.slice(0, 5).map((q) => q.question);
      suggestedQuestions = topFive.length > 0
        ? topFive
        : extractSuggestedQuestions(knowledgeItems);

      featuredCards = buildFeaturedCards(featuredItems);

      if (tenant) {
        const mode = tenant.aiDisclosureMode;
        if (mode === "banner" || mode === "inline" || mode === "off") {
          aiDisclosureMode = mode;
        }
        if (tenant.aiDisclosureText) {
          aiDisclosureText = tenant.aiDisclosureText;
        }
      }
    }
  } else {
    suggestedQuestions = mockTopQuestions.slice(0, 5).map((q) => q.question);
    featuredCards = buildFeaturedCards(mockKnowledgeItems.filter((i) => i.featured));
  }

  const resolved = assistant ?? mockAssistant;

  return (
    <div className="h-dvh w-full">
      <ChatWindow
        assistantId={resolved.id}
        assistantName={resolved.name}
        avatarUrl={resolved.avatarUrl}
        greeting={resolved.greeting}
        widgetColor={resolved.widgetColor}
        suggestedQuestions={suggestedQuestions}
        featuredCards={featuredCards}
        welcomeBanner={resolved.welcomeBanner}
        welcomeButtons={resolved.welcomeButtons}
        aiDisclosure={{ mode: aiDisclosureMode, text: aiDisclosureText }}
        cookielessMode={resolved.cookielessMode ?? false}
      />
    </div>
  );
}
