"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { mockChatResponse } from "@/lib/mock/providers";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatWindowProps {
  assistantName: string;
  greeting: string;
  widgetColor: string;
}

export function ChatWindow({ assistantName, greeting, widgetColor }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", content: greeting },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const simulateStreaming = useCallback(async (response: string, msgId: string) => {
    setIsStreaming(true);
    let current = "";
    for (let i = 0; i < response.length; i++) {
      current += response[i];
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: current } : m))
      );
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
    }
    setIsStreaming(false);
  }, []);

  const handleSend = useCallback(async (content: string) => {
    const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: "user", content };
    const assistantMsgId = `assistant_${Date.now()}`;
    const assistantMsg: ChatMessage = { id: assistantMsgId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    const response = mockChatResponse();
    await simulateStreaming(response, assistantMsgId);
  }, [simulateStreaming]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3" style={{ backgroundColor: widgetColor }}>
        <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
          {assistantName[0]}
        </div>
        <div className="text-white">
          <p className="text-sm font-medium">{assistantName}</p>
          <p className="text-xs opacity-80">Online</p>
        </div>
      </div>
      <div className="bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground">
        I&apos;m an AI assistant. Your messages are processed to answer your questions.
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === "assistant"}
          />
        ))}
      </div>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
