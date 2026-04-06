"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, ExternalLink } from "lucide-react";

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
  feedback?: "positive" | "negative" | null;
  isError?: boolean;
  onFeedback?: (messageId: string, feedback: "positive" | "negative") => void;
  onRetry?: () => void;
}

export function MessageBubble({
  role,
  content,
  isStreaming,
  messageId,
  sources,
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

  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          role === "user"
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md"
        }`}
      >
        <p className="whitespace-pre-wrap">
          {content}
          {isStreaming && <span className="animate-pulse">&#9647;</span>}
        </p>

        {/* Source attribution */}
        {role === "assistant" && sources && sources.length > 0 && !isStreaming && (
          <details className="mt-2 border-t border-border/40 pt-1.5">
            <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronDown className="size-3" />
              {sources.length} {sources.length === 1 ? "source" : "sources"}
            </summary>
            <ul className="mt-1 space-y-0.5">
              {sources.map((s, i) => (
                <li key={i} className="text-xs text-muted-foreground">
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

        {/* Feedback buttons */}
        {role === "assistant" && messageId && onFeedback && !isStreaming && !isError && (
          <div className="mt-1.5 flex items-center gap-1 border-t border-border/40 pt-1.5">
            <button
              type="button"
              onClick={() => handleFeedback("positive")}
              disabled={feedback !== null}
              aria-label="Good response"
              className={`rounded p-1 transition-colors ${
                feedback === "positive"
                  ? "text-green-600"
                  : feedback === null
                    ? "text-muted-foreground hover:text-green-600"
                    : "text-muted-foreground/30"
              }`}
            >
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleFeedback("negative")}
              disabled={feedback !== null}
              aria-label="Bad response"
              className={`rounded p-1 transition-colors ${
                feedback === "negative"
                  ? "text-red-600"
                  : feedback === null
                    ? "text-muted-foreground hover:text-red-600"
                    : "text-muted-foreground/30"
              }`}
            >
              <ThumbsDown className="size-3.5" />
            </button>
          </div>
        )}

        {/* Retry button */}
        {isError && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
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
        <div className="flex gap-1" role="status" aria-label="Assistant is typing">
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
          <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
