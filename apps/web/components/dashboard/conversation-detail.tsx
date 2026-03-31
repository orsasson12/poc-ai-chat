import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Message } from "@bizassist/types";

interface ConversationDetailProps {
  messages: Message[];
}

export function ConversationDetail({ messages }: ConversationDetailProps) {
  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a conversation to view the transcript</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {messages.map((message) => {
        const isUser = message.role === "user";

        return (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-1",
              isUser ? "items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "max-w-[75%] rounded-xl px-4 py-2.5 text-sm",
                isUser
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>

            {!isUser && (
              <div className="flex flex-wrap gap-1 px-1">
                {message.confidence !== null && (
                  <Badge variant="outline" className="text-xs h-5">
                    {Math.round(message.confidence * 100)}% confidence
                  </Badge>
                )}
                {message.latencyMs !== null && (
                  <Badge variant="outline" className="text-xs h-5">
                    {message.latencyMs}ms
                  </Badge>
                )}
                {message.isFallback && (
                  <Badge variant="destructive" className="text-xs h-5">
                    Fallback
                  </Badge>
                )}
                {message.chunksUsed.length > 0 && (
                  <Badge variant="secondary" className="text-xs h-5">
                    {message.chunksUsed.length} chunk
                    {message.chunksUsed.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            )}

            <time className="text-xs text-muted-foreground px-1">
              {message.createdAt.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        );
      })}
    </div>
  );
}
