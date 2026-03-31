import { ChatWindow } from "@/components/chat/chat-window";
import { mockAssistant } from "@/lib/mock/data";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;
  const assistant = mockAssistant;

  return (
    <div className="h-screen w-full">
      <ChatWindow
        assistantName={assistant.name}
        greeting={assistant.greeting}
        widgetColor={assistant.widgetColor}
      />
    </div>
  );
}
