import { ChatWindow } from "@/components/chat/chat-window";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockAssistant } from "@/lib/mock/data";
import { extractSuggestedQuestions } from "@/lib/knowledge/suggested-questions";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  let assistant;
  let suggestedQuestions: string[] = [];

  if (hasDatabase()) {
    assistant = await queries.getAssistantById(id);
    if (assistant) {
      const knowledgeItems = await queries.getKnowledgeItems(assistant.tenantId);
      suggestedQuestions = extractSuggestedQuestions(knowledgeItems);
    }
  } else {
    suggestedQuestions = [
      "What are your office hours?",
      "What insurance do you accept?",
      "How do I schedule an appointment?",
      "What services do you offer?",
    ];
  }

  const resolved = assistant ?? mockAssistant;

  return (
    <div className="h-screen w-full">
      <ChatWindow
        assistantId={resolved.id}
        assistantName={resolved.name}
        greeting={resolved.greeting}
        widgetColor={resolved.widgetColor}
        suggestedQuestions={suggestedQuestions}
      />
    </div>
  );
}
