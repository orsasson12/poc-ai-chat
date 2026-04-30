"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageBubble, TypingIndicator } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { ContentCard } from "@/components/chat/content-card";
import type { CardData, WelcomeButton } from "@bizassist/types";

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
  cards?: Record<string, CardData>;
  feedback?: "positive" | "negative" | null;
  isError?: boolean;
  lowConfidence?: boolean;
  sender?: "bot" | "agent" | "customer" | "system";
}

interface AiDisclosure {
  mode: "banner" | "inline" | "off";
  text: string;
}

interface ChatWindowProps {
  assistantId: string;
  assistantName: string;
  avatarUrl?: string | null;
  greeting: string;
  widgetColor: string;
  suggestedQuestions?: string[];
  featuredCards?: CardData[];
  welcomeBanner?: string | null;
  welcomeButtons?: WelcomeButton[];
  aiDisclosure?: AiDisclosure | null;
  cookielessMode?: boolean;
}

const SESSION_KEY_PREFIX = "bizassist_session_";

/**
 * Cookieless-aware storage accessor. Writes to sessionStorage when cookieless mode
 * is enabled, otherwise localStorage. Both paths swallow errors so a disabled
 * storage (e.g., third-party cookies blocked in an iframe) never breaks chat.
 */
function readStoredSession(key: string, cookieless: boolean): string | null {
  try {
    return cookieless ? sessionStorage.getItem(key) : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredSession(key: string, value: string, cookieless: boolean): void {
  try {
    if (cookieless) sessionStorage.setItem(key, value);
    else localStorage.setItem(key, value);
  } catch {
    // storage disabled — degrade silently
  }
}

export function ChatWindow({ assistantId, assistantName, avatarUrl, greeting, widgetColor, suggestedQuestions = [], featuredCards = [], welcomeBanner, welcomeButtons = [], aiDisclosure = null, cookielessMode = false }: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greeting", role: "assistant", content: greeting },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [escalationId, setEscalationId] = useState<string | null>(null);
  const [isEscalated, setIsEscalated] = useState(false);
  // True when the chat is rendered inside the widget iframe (vs. loaded
  // directly at /chat/[id]). Drives the close-button affordance in the
  // header: only embedded chats can ask the parent widget to close them.
  const [isEmbedded, setIsEmbedded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>("");
  const lastUserMessageRef = useRef<string>("");
  const escalationSseRef = useRef<boolean>(false);
  // Remembers which proactive engagement rule (if any) opened this chat, so
  // the first message to /api/chat can attribute the resulting conversation
  // to the rule. Cleared after the first message is sent.
  const engagementRuleIdRef = useRef<string | null>(null);
  // A qualifying-question text handed over from the proactive bubble. State
  // (not a ref) so the auto-send effect re-runs when a new postMessage arrives
  // on a re-open. Single-shot semantics come from clearing to null in the
  // effect before firing handleSend.
  const [pendingAutoMessage, setPendingAutoMessage] = useState<string | null>(null);

  // Initialize session from storage or create new
  useEffect(() => {
    const storageKey = SESSION_KEY_PREFIX + assistantId;
    const stored = readStoredSession(storageKey, cookielessMode);
    if (stored) {
      sessionIdRef.current = stored;
    } else {
      sessionIdRef.current = `sess_${crypto.randomUUID().slice(0, 8)}`;
    }
  }, [assistantId, cookielessMode]);

  // Detect iframe embedding on mount so the header can render a close button
  // that tells the parent widget shell to hide the chat.
  useEffect(() => {
    try {
      if (window.parent !== window) setIsEmbedded(true);
    } catch {
      setIsEmbedded(true);
    }
  }, []);

  // Load conversation history if session exists
  useEffect(() => {
    if (historyLoaded || !sessionIdRef.current) return;

    const storageKey = SESSION_KEY_PREFIX + assistantId;
    const stored = readStoredSession(storageKey, cookielessMode);
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

  // Listen for proactive-engage handoffs from the wrapper widget script.
  // widget.js postMessages `{ type: "ba:proactive_engage", payload: { ruleId, ...} }`
  // when the visitor clicks the proactive bubble — we capture the ruleId so
  // the first chat POST can attribute the conversation back to the rule.
  useEffect(() => {
    function handleProactiveEngage(ev: MessageEvent) {
      if (!ev.data || typeof ev.data !== "object") return;
      if ((ev.data as { type?: string }).type !== "ba:proactive_engage") return;
      const payload = (ev.data as { payload?: { ruleId?: string; autoSendMessage?: string } }).payload;
      if (payload?.ruleId && typeof payload.ruleId === "string") {
        engagementRuleIdRef.current = payload.ruleId;
      }
      if (payload?.autoSendMessage && typeof payload.autoSendMessage === "string") {
        setPendingAutoMessage(payload.autoSendMessage);
      }
    }
    // Also allow the URL to carry the ruleId and auto-send text — the widget
    // passes them as query params on first iframe load (before the listener
    // above has a chance to attach), and the landing-page harness uses the
    // same mechanism to preview rules.
    try {
      const params = new URLSearchParams(window.location.search);
      const paramRule = params.get("engagementRuleId");
      if (paramRule) engagementRuleIdRef.current = paramRule;
      const paramAutoSend = params.get("autoSend");
      if (paramAutoSend) setPendingAutoMessage(paramAutoSend);
    } catch {
      /* SSR/no-window — noop */
    }

    window.addEventListener("message", handleProactiveEngage);
    return () => window.removeEventListener("message", handleProactiveEngage);
  }, []);

  // Dev-harness reset channel. Host-side test harnesses (e.g. the Lumina
  // landing page) can postMessage `{ type: "bizassist.reset" }` to wipe this
  // widget's session storage and restore the initial greeting state, so you
  // can test the welcome flow without manually clearing browser storage.
  // This is a no-op in production because no real host will ever send it.
  useEffect(() => {
    function handleReset(ev: MessageEvent) {
      if (!ev.data || typeof ev.data !== "object") return;
      if ((ev.data as { type?: string }).type !== "bizassist.reset") return;

      const storageKey = SESSION_KEY_PREFIX + assistantId;
      try { localStorage.removeItem(storageKey); } catch { /* noop */ }
      try { sessionStorage.removeItem(storageKey); } catch { /* noop */ }

      sessionIdRef.current = `sess_${crypto.randomUUID().slice(0, 8)}`;
      lastUserMessageRef.current = "";
      setMessages([{ id: "greeting", role: "assistant", content: greeting }]);
      setIsStreaming(false);
      setIsWaiting(false);
      setIsEscalated(false);
      setEscalationId(null);
      setHistoryLoaded(true);
    }

    window.addEventListener("message", handleReset);
    return () => window.removeEventListener("message", handleReset);
  }, [assistantId, greeting]);

  // SSE listener for live agent messages during escalation
  useEffect(() => {
    if (!escalationId || escalationSseRef.current) return;
    escalationSseRef.current = true;

    const url = `/api/escalations/${escalationId}/messages?role=customer&sessionId=${encodeURIComponent(sessionIdRef.current)}&after=${encodeURIComponent(new Date().toISOString())}`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "escalation_resolved") {
          setIsEscalated(false);
          setEscalationId(null);
          escalationSseRef.current = false;
          setMessages((prev) => [
            ...prev,
            {
              id: `system_resolved_${Date.now()}`,
              role: "assistant",
              content: "This conversation has been resolved. Thank you for your patience!",
              sender: "system",
            },
          ]);
          eventSource.close();
          return;
        }
        if (data.sender === "agent" && data.content) {
          setMessages((prev) => [
            ...prev,
            {
              id: data.id ?? `agent_${Date.now()}`,
              role: "assistant",
              content: data.content,
              sender: "agent",
            },
          ]);
        }
      } catch {
        // Ignore parse errors / heartbeats
      }
    };

    eventSource.onerror = () => {
      // Reconnect will be handled by EventSource automatically
    };

    return () => {
      eventSource.close();
      escalationSseRef.current = false;
    };
  }, [escalationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isWaiting]);

  // Re-anchor scroll to bottom when the mobile soft keyboard opens/closes.
  // visualViewport.resize fires on keyboard show; we only re-anchor when the
  // user was already near the bottom, so scrolled-up history reading isn't
  // disturbed. No-op on desktop (keyboard resize doesn't fire).
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const handleViewportResize = () => {
      const el = scrollRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < 80) {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      }
    };
    vv.addEventListener("resize", handleViewportResize);
    return () => vv.removeEventListener("resize", handleViewportResize);
  }, []);

  // iOS soft-keyboard sizing. `h-dvh` does NOT shrink when the keyboard opens,
  // so the wrapper overflows the visible area and the textarea ends up under
  // the keyboard. We pin the wrapper height to `visualViewport.height` only
  // when the keyboard is open on a phone-sized screen — mirrors the same
  // logic used in widget.js (syncContainerToViewport) for iframe mode.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const el = wrapperRef.current;
    if (!vv || !el) return;
    const KB_DELTA_PX = 120; // shrink larger than this = keyboard, not URL bar
    const sync = () => {
      const isMobile = window.innerWidth <= 480;
      const keyboardOpen = isMobile && window.innerHeight - vv.height > KB_DELTA_PX;
      el.style.height = keyboardOpen ? `${vv.height}px` : "";
    };
    const handleOrientation = () => setTimeout(sync, 200);
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", handleOrientation);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", handleOrientation);
    };
  }, []);

  const handleSend = useCallback(async (content: string) => {
    // Persist session. Respects cookieless mode — sessionStorage when enabled.
    writeStoredSession(SESSION_KEY_PREFIX + assistantId, sessionIdRef.current, cookielessMode);

    lastUserMessageRef.current = content;

    const userMsg: ChatMessage = { id: `user_${Date.now()}`, role: "user", content, sender: "customer" };

    setMessages((prev) => [...prev, userMsg]);

    // If escalated, send directly to the escalation message endpoint
    if (isEscalated && escalationId) {
      try {
        await fetch(`/api/escalations/${escalationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            sender: "customer",
            sessionId: sessionIdRef.current,
          }),
        });
      } catch {
        // Message still visible locally
      }
      return;
    }

    const assistantMsgId = `assistant_${Date.now()}`;
    setIsWaiting(true);
    setIsStreaming(true);

    try {
      // Build history from previous messages (exclude greeting)
      const history = messages
        .filter((m) => m.id !== "greeting")
        .map((m) => ({ role: m.role, content: m.content }));

      // Attribute the conversation to the engagement rule that opened it.
      // Consumed and cleared on first send so it's never double-attributed.
      const ruleToAttribute = engagementRuleIdRef.current;
      if (ruleToAttribute) engagementRuleIdRef.current = null;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          message: content,
          sessionId: sessionIdRef.current,
          history,
          ...(ruleToAttribute ? { engagementRuleId: ruleToAttribute } : {}),
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
      let meta: { messageId?: string; sources?: Source[]; cards?: Record<string, CardData>; replaced?: boolean; fallback?: string; lowConfidence?: boolean } = {};

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

              // Output-validation replacement: the server detected a canary
              // leak or scope violation mid/post-stream. Discard accumulated
              // tokens and render the fallback message instead.
              if (meta.replaced && meta.fallback) {
                const fallbackText = meta.fallback;
                accumulated = fallbackText;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: fallbackText, sources: [], cards: {}, messageId: null }
                      : m,
                  ),
                );
                continue;
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        messageId: meta.messageId ?? null,
                        sources: meta.sources ?? [],
                        cards: meta.cards ?? {},
                        lowConfidence: meta.lowConfidence ?? false,
                      }
                    : m,
                ),
              );

              // Check if escalation was triggered
              if (parsed.meta.escalation) {
                const esc = parsed.meta.escalation;
                setEscalationId(esc.id);
                setIsEscalated(true);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `system_handoff_${Date.now()}`,
                    role: "assistant",
                    content: "Let me connect you with our team \u2014 they'll have the full context of our conversation, so you won't need to repeat anything.",
                    sender: "system",
                  },
                ]);
              }
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
  }, [assistantId, messages, isEscalated, escalationId, cookielessMode]);

  // Auto-send a qualifying-question handed over from the proactive bubble.
  // Re-fires per handoff because pendingAutoMessage is state, so both the
  // URL-param intake (first open) and the postMessage intake (subsequent
  // opens) trigger this effect. We don't gate on historyLoaded: handleSend
  // appends the user message optimistically, so making the visitor wait for
  // /api/chat/history would hide their click behind a network round-trip.
  useEffect(() => {
    if (!pendingAutoMessage) return;
    if (isStreaming || isWaiting) return;
    const text = pendingAutoMessage;
    setPendingAutoMessage(null);
    handleSend(text);
  }, [pendingAutoMessage, isStreaming, isWaiting, handleSend]);

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

  // Asks the parent widget shell (widget.js) to hide the chat container.
  // widget.js listens for `ba:close_widget` on window.message and calls its
  // own closeWidget(). No-op when not embedded.
  const handleClose = useCallback(() => {
    try {
      window.parent.postMessage({ type: "ba:close_widget" }, "*");
    } catch {
      /* cross-frame postMessage failed — nothing to do */
    }
  }, []);

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

  const handleRegenerate = useCallback(() => {
    if (!lastUserMessageRef.current) return;
    setMessages((prev) => {
      if (prev.length < 2) return prev;
      const last = prev[prev.length - 1];
      const secondLast = prev[prev.length - 2];
      if (
        last.role === "assistant" &&
        !last.isError &&
        last.sender !== "agent" &&
        last.sender !== "system" &&
        secondLast.role === "user"
      ) {
        return prev.slice(0, -2);
      }
      return prev;
    });
    setTimeout(() => handleSend(lastUserMessageRef.current), 0);
  }, [handleSend]);

  const hasUserMessages = messages.some((m) => m.role === "user");
  const lastMessage = messages[messages.length - 1];
  const prevMessage = messages[messages.length - 2];
  const canRegenerateLast =
    !isStreaming &&
    !isWaiting &&
    !isEscalated &&
    Boolean(lastUserMessageRef.current) &&
    lastMessage?.role === "assistant" &&
    !lastMessage?.isError &&
    lastMessage?.sender !== "agent" &&
    lastMessage?.sender !== "system" &&
    prevMessage?.role === "user";

  const createSuggestedQuestionHandler = useCallback(
    (question: string) => () => handleSend(question),
    [handleSend],
  );

  return (
    <div ref={wrapperRef} className="flex h-full flex-col" role="application" aria-label={`Chat with ${assistantName}`}>
      {/* Header landmark */}
      <header className="flex items-center gap-3 border-b px-4 py-3" style={{ backgroundColor: widgetColor, paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${assistantName} avatar`}
            className="h-8 w-8 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm shrink-0" aria-hidden="true">
            {assistantName[0]}
          </div>
        )}
        <div className="text-white min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{assistantName}</p>
          <p className="text-xs opacity-80 truncate" aria-live="polite">{isEscalated ? "Connected to Team" : "Online"}</p>
        </div>
        {isEmbedded && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close chat"
            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-full text-white/90 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-5 w-5">
              <path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </header>
      {/* AI Act Art. 50 transparency disclosure — controlled by tenant compliance settings. */}
      {aiDisclosure?.mode !== "off" && (
        <p className="bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground" role="note">
          {aiDisclosure?.text ??
            "I'm an AI assistant. Your messages are processed to answer your questions."}
        </p>
      )}
      {/* Message area — ARIA log role for chat history */}
      <div ref={scrollRef} className="flex-1 overflow-auto overscroll-contain p-4 space-y-3" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions">
        {welcomeBanner && !hasUserMessages && (
          <img
            src={welcomeBanner}
            alt=""
            className="w-full rounded-xl object-cover max-h-36"
            loading="lazy"
          />
        )}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.sender === "agent" && (
              <div className="flex items-center gap-1 mb-1 ml-1">
                <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                  Team
                </span>
              </div>
            )}
            {msg.sender === "system" ? (
              <div className="flex justify-center py-2">
                <p className="text-xs text-muted-foreground bg-muted rounded-full px-4 py-1.5 max-w-[90%] text-center">
                  {msg.content}
                </p>
              </div>
            ) : (
              <MessageBubble
                role={msg.role}
                content={msg.content}
                isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === "assistant"}
                messageId={msg.messageId}
                sources={msg.sources}
                cards={msg.cards}
                feedback={msg.feedback}
                isError={msg.isError}
                lowConfidence={msg.lowConfidence}
                onFeedback={handleFeedback}
                onRetry={handleRetry}
                onRegenerate={msg.id === lastMessage?.id && canRegenerateLast ? handleRegenerate : undefined}
              />
            )}
          </div>
        ))}
        {featuredCards.length > 0 && !hasUserMessages && !isStreaming && (
          <div className="flex gap-2 overflow-x-auto pb-1" role="region" aria-label="Featured items">
            {featuredCards.map((card) => (
              <div key={card.knowledgeItemId} className="shrink-0">
                <ContentCard data={card} />
              </div>
            ))}
          </div>
        )}
        {welcomeButtons.length > 0 && !hasUserMessages && !isStreaming && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick actions">
            {welcomeButtons.map((btn) => (
              <a
                key={btn.id}
                href={btn.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {btn.label}
              </a>
            ))}
          </div>
        )}
        {isWaiting && (
          <div aria-label="Assistant is typing" role="status">
            <TypingIndicator />
            <span className="sr-only">Assistant is thinking...</span>
          </div>
        )}
        {suggestedQuestions.length > 0 && !hasUserMessages && !isStreaming && (
          <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Suggested questions">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={createSuggestedQuestionHandler(q)}
                className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/10 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Streaming completion announcement for screen readers */}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {!isStreaming && messages.length > 1 && messages[messages.length - 1].role === "assistant" && !messages[messages.length - 1].isError
          ? `${assistantName} says: ${messages[messages.length - 1].content.slice(0, 200)}`
          : ""}
      </div>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
