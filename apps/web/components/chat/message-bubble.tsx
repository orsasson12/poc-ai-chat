"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, ExternalLink } from "lucide-react";
import { ContentCard } from "@/components/chat/content-card";
import type { CardData } from "@bizassist/types";

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li>{children}</li>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold mt-3 mb-1">{children}</p>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <p className="font-semibold mt-2 mb-1">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:opacity-80"
    >
      {children}
    </a>
  ),
};

interface Source {
  title: string;
  url: string | null;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  messageId?: string | null;
  sources?: Source[];
  cards?: Record<string, CardData>;
  feedback?: "positive" | "negative" | null;
  isError?: boolean;
  onFeedback?: (messageId: string, feedback: "positive" | "negative") => void;
  onRetry?: () => void;
}

type ContentSegment =
  | { type: "text"; key: string; text: string }
  | { type: "card"; key: string; data: CardData };

function parseContentWithCards(
  content: string,
  cards: Record<string, CardData>,
): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /\[CARD:([\w-]+)\]/g;
  let lastIndex = 0;
  let match;
  let textIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", key: `text-${textIndex++}`, text: content.slice(lastIndex, match.index) });
    }
    const cardId = match[1];
    if (cards[cardId]) {
      segments.push({ type: "card", key: `card-${cardId}`, data: cards[cardId] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", key: `text-${textIndex}`, text: content.slice(lastIndex) });
  }

  return segments;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  messageId,
  sources,
  cards,
  feedback: initialFeedback,
  isError,
  onFeedback,
  onRetry,
}: MessageBubbleProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(initialFeedback ?? null);

  const handleFeedback = (type: "positive" | "negative") => {
    if (feedback || !messageId || !onFeedback) return;
    setFeedback(type);
    onFeedback(messageId, type);
  };

  const handlePositiveFeedback = () => handleFeedback("positive");
  const handleNegativeFeedback = () => handleFeedback("negative");

  return (
    <div
      className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}
      role="group"
      aria-label={`${role === "user" ? "You" : "Assistant"} message`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          role === "user"
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        }`}
      >
        {isStreaming ? (
          <p className="whitespace-pre-wrap" aria-label="Assistant is responding">
            {content}
            <span className="animate-pulse motion-reduce:animate-none" aria-hidden="true">&#9647;</span>
          </p>
        ) : cards && Object.keys(cards).length > 0 ? (
          <div>
            {parseContentWithCards(content, cards).map((seg) =>
              seg.type === "text" ? (
                <div key={seg.key}>
                  <ReactMarkdown components={markdownComponents}>{seg.text}</ReactMarkdown>
                </div>
              ) : (
                <ContentCard key={seg.key} data={seg.data} />
              ),
            )}
          </div>
        ) : role === "assistant" ? (
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
        ) : (
          <p className="whitespace-pre-wrap">{content}</p>
        )}

        {/* Source attribution */}
        {role === "assistant" && sources && sources.length > 0 && !isStreaming && (
          <details className="mt-2 border-t border-border/40 pt-1.5">
            <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-3" />
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </summary>
            <ul className="mt-1 space-y-0.5">
              {sources.map((s) => (
                <li key={s.url ?? s.title} className="text-xs text-muted-foreground">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                    >
                      {s.title}
                      <ExternalLink className="size-2.5" />
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Feedback buttons (WCAG: 44px targets, ARIA pressed state) */}
        {role === "assistant" && messageId && onFeedback && !isStreaming && !isError && (
          <div className="mt-1.5 flex items-center gap-1 border-t border-border/40 pt-1.5" role="group" aria-label="Rate this response">
            <button
              type="button"
              onClick={handlePositiveFeedback}
              disabled={feedback !== null}
              aria-label="Good response"
              aria-pressed={feedback === "positive"}
              className={`rounded p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                feedback === "positive"
                  ? "text-green-600"
                  : feedback === null
                    ? "text-muted-foreground hover:text-green-600"
                    : "text-muted-foreground/30"
              }`}
            >
              <ThumbsUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleNegativeFeedback}
              disabled={feedback !== null}
              aria-label="Bad response"
              aria-pressed={feedback === "negative"}
              className={`rounded p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                feedback === "negative"
                  ? "text-red-600"
                  : feedback === null
                    ? "text-muted-foreground hover:text-red-600"
                    : "text-muted-foreground/30"
              }`}
            >
              <ThumbsDown className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Retry button */}
        {isError && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Retry sending message"
            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground min-h-[44px] px-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/** Typing indicator with animated dots. */
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
        <div className="flex gap-1" aria-hidden="true">
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce motion-reduce:animate-none rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
