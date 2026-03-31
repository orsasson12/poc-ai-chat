"use client";

import { ThumbsUp, ThumbsDown, Minus, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@bizassist/types";

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  return (
    <nav aria-label="Conversations" className="flex flex-col gap-1 overflow-y-auto">
      {conversations.map((conv) => {
        const isSelected = conv.id === selectedId;
        return (
          <button
            key={conv.id}
            type="button"
            onClick={() => onSelect(conv.id)}
            className={cn(
              "flex w-full flex-col gap-1 rounded-lg p-3 text-left text-sm transition-colors hover:bg-muted",
              isSelected && "bg-accent text-accent-foreground"
            )}
            aria-current={isSelected ? "true" : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs truncate text-muted-foreground">
                {conv.sessionId}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {conv.escalated && (
                  <ArrowUpRight
                    className="size-3.5 text-orange-500"
                    aria-label="Escalated"
                  />
                )}
                {conv.satisfaction === 1 && (
                  <ThumbsUp className="size-3.5 text-green-500" aria-label="Positive" />
                )}
                {conv.satisfaction === -1 && (
                  <ThumbsDown className="size-3.5 text-red-500" aria-label="Negative" />
                )}
                {conv.satisfaction === 0 && (
                  <Minus className="size-3.5 text-muted-foreground" aria-label="Neutral" />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{conv.messageCount} messages</span>
              <span>{conv.startedAt.toLocaleDateString()}</span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
