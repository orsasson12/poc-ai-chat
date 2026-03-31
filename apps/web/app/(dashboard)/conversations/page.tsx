"use client";

import { useState } from "react";
import { ConversationList } from "@/components/dashboard/conversation-list";
import { ConversationDetail } from "@/components/dashboard/conversation-detail";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockConversations, mockMessages } from "@/lib/mock/data";
import type { Message } from "@bizassist/types";

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const messages: Message[] =
    selectedId && mockMessages[selectedId] ? mockMessages[selectedId] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-muted-foreground">
          Browse and review chat transcripts
        </p>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "350px 1fr" }}>
        {/* Conversation List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Recent Conversations ({mockConversations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <ConversationList
              conversations={mockConversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </CardContent>
        </Card>

        {/* Transcript Detail */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {selectedId ? "Transcript" : "Select a Conversation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[600px] overflow-y-auto p-0">
            <ConversationDetail messages={messages} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
