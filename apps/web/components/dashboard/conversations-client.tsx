"use client";

import { useEffect, useState } from "react";
import { ConversationList } from "@/components/dashboard/conversation-list";
import { ConversationDetail } from "@/components/dashboard/conversation-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Message, SatisfactionScore } from "@bizassist/types";

interface SerializedConversation {
  id: string;
  tenantId: string;
  assistantId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  escalated: boolean;
  satisfaction: SatisfactionScore;
}

interface ConversationsClientProps {
  conversations: SerializedConversation[];
  initialMessages: Record<string, Message[]>;
  useApi: boolean;
}

export function ConversationsClient({
  conversations,
  initialMessages,
  useApi,
}: ConversationsClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Rehydrate dates for display
  const rehydrated = conversations.map((c) => ({
    ...c,
    startedAt: new Date(c.startedAt),
    endedAt: c.endedAt ? new Date(c.endedAt) : null,
  }));

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    if (useApi) {
      setLoading(true);
      fetch(`/api/conversations?conversationId=${selectedId}`)
        .then((res) => res.json())
        .then((data) => {
          const msgs = data.map((m: Message & { createdAt: string }) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          }));
          setMessages(msgs);
        })
        .finally(() => setLoading(false));
    } else {
      setMessages(initialMessages[selectedId] ?? []);
    }
  }, [selectedId, useApi, initialMessages]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "350px 1fr" }}>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Recent Conversations ({conversations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ConversationList
            conversations={rehydrated}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {selectedId
              ? loading
                ? "Loading..."
                : "Transcript"
              : "Select a Conversation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[600px] overflow-y-auto p-0">
          <ConversationDetail messages={messages} />
        </CardContent>
      </Card>
    </div>
  );
}
