export type EventFields = {
  "chat.request.started": {
    tenantId: string | null;
    assistantId: string;
    sessionId: string;
    conversationId: string | null;
    messageLen: number;
    hasHistory: boolean;
  };
  "chat.request.completed": {
    tenantId: string | null;
    conversationId: string | null;
    durationMs: number;
    firstTokenMs: number | null;
    totalChars: number;
    confidence: number;
    isFallback: boolean;
    chunksCount: number;
  };
  "chat.request.failed": {
    tenantId: string | null;
    conversationId: string | null;
    stage: string;
    errKind: string;
    durationMs: number;
  };
  "chat.stream.token_latency": {
    tenantId: string | null;
    conversationId: string | null;
    firstTokenMs: number;
  };
  "rag.retrieve.skipped": {
    tenantId: string;
    reason: "no_pinecone" | "no_openai" | "threshold_not_met";
  };
  "rag.retrieve.failed": {
    tenantId: string;
    stage: "embed" | "query";
    errKind: string;
  };
  "widget.error.received": {
    assistantId: string | null;
    tenantId: string | null;
    url: string;
    errKind: string;
    ua: string;
  };
};

export type EventName = keyof EventFields;
