"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble, TypingIndicator } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";

interface Source {
  title: string;
  url: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  messageId?: string | null;
  sources?: Source[];
  feedback?: "positive" | "negative" | null;
  isError?: boolean;
}

interface ChatWindowProps {
  assistantId: string;
  assistantName: string;
  greeting: string;
  widgetColor: string;
  suggestedQuestions?: string[];
}

const SESSION_KEY_PREFIX = "bizassist_session_";

export function ChatWindow({ assistantId, assistantName, greeting, widgetColor, suggestedQuestions = [] }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", content: greeting },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>("");
  const lastUserMessageRef = useRef<string>("");

  // Initialize session from localStorage or create new
  useEffect(() => {
    const storageKey = SESSION_KEY_PREFIX + assistantId;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      sessionIdRef.current = stored;
    } else {
      sessionIdRef.current = `sess_${crypto.randomUUID().slice(0, 8)}`;
    }
  }, [assistantId]);

  // Load conversation history if session exists
  useEffect(() => {
    if (historyLoaded || !sessionIdRef.current) return;

    const storageKey = SESSION_KEY_PREFIX + assistantId;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      setHistoryLoaded(true);
      return;
    }

    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/chat/history?sessionId=${encodeURIComponent(sessionIdRef.current)}&assistantId=${encodeURIComponent(assistantId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            const loaded: ChatMessage[] = [
              { id: "greeting", role: "assistant", content: greeting },
              ...data.messages.map((m: { id: string; role: "user" | "assistant"; content: string; feedback?: string | null }) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                messageId: m.role === "assistant" ? m.id : null,
                feedback: (m.feedback as "positive" | "negative" | null) ?? null,
              })),
            ];
            setMessages(loaded);
          }
        }
      } catch {
        // Silently fail — start fresh
      } finally {
        setHistoryLoaded(true);
      }
    }

    loadHistory();
  }, [assistantId, greeting, historyLoaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isWaiting]);

  const handleSend = useCallback(async (content: string) => {
    // Persist session to localStorage
    localStorage.setItem(SESSION_KEY_PREFIX + assistantId, sessionIdRef.current);

    lastUserMessageRef.current = content;

    const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: "user", content };
    const assistantMsgId = `assistant_${Date.now()}`;

    setMessages((prev) => [...prev, userMsg]);
    setIsWaiting(true);
    setIsStreaming(true);

    try {
      // Build history from previous messages (exclude greeting)
      const history = messages
        .filter((m) => m.id !== "greeting")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          message: content,
          sessionId: sessionIdRef.current,
          history,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: "assistant", content: "Sorry, something went wrong. Please try again.", isError: true },
        ]);
        setIsStreaming(false);
        setIsWaiting(false);
        return;
      }

      // Add empty assistant message once streaming starts
      let assistantAdded = false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let meta: { messageId?: string; sources?: Source[] } = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);

            // Meta event (sent before [DONE])
            if (parsed.meta) {
              meta = parsed.meta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, messageId: meta.messageId ?? null, sources: meta.sources ?? [] }
                    : m,
                ),
              );
              continue;
            }

            if (parsed.token) {
              if (!assistantAdded) {
                assistantAdded = true;
                setIsWaiting(false);
                setMessages((prev) => [
                  ...prev,
                  { id: assistantMsgId, role: "assistant", content: parsed.token },
                ]);
                accumulated = parsed.token;
              } else {
                accumulated += parsed.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: accumulated } : m,
                  ),
                );
              }
            }
          } catch {}
        }
      }

      // If no tokens were received, show error
      if (!assistantAdded) {
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: "assistant", content: "Sorry, something went wrong. Please try again.", isError: true },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `assistant_${Date.now()}`, role: "assistant", content: "Sorry, something went wrong. Please try again.", isError: true },
      ]);
    } finally {
      setIsStreaming(false);
      setIsWaiting(false);
    }
  }, [assistantId, messages]);

  const handleFeedback = useCallback(async (messageId: string, feedback: "positive" | "negative") => {
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? { ...m, feedback } : m)),
    );

    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          sessionId: sessionIdRef.current,
          assistantId,
          feedback,
        }),
      });
    } catch {
      // Silently fail — local state already updated
    }
  }, [assistantId]);

  const handleRetry = useCallback(() => {
    if (!lastUserMessageRef.current) return;
    // Remove the error message and the last user message
    setMessages((prev) => {
      const copy = [...prev];
      // Remove last two messages (user + error assistant)
      if (copy.length >= 2) {
        const last = copy[copy.length - 1];
        const secondLast = copy[copy.length - 2];
        if (last.isError && secondLast.role === "user") {
          return copy.slice(0, -2);
        }
      }
      return prev;
    });
    // Re-send after state update
    setTimeout(() => handleSend(lastUserMessageRef.current), 0);
  }, [handleSend]);

  const hasUserMessages = messages.some((m) => m.role === "user");

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
            messageId={msg.messageId}
            sources={msg.sources}
            feedback={msg.feedback}
            isError={msg.isError}
            onFeedback={handleFeedback}
            onRetry={handleRetry}
          />
        ))}
        {isWaiting && <TypingIndicator />}
        {suggestedQuestions.length > 0 && !hasUserMessages && !isStreaming && (
          <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Suggested questions">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSend(q)}
                className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
