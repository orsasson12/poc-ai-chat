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
  "safety.blocked": {
    tenantId: string;
    conversationId: string | null;
    eventType: "prompt_injection" | "content_moderation" | "pii_detected" | "canary_leak" | "scope_violation";
    severity: "low" | "medium" | "high" | "critical";
    score: number | null;
    stage: "input" | "output";
  };
  "safety.pii_detected": {
    tenantId: string;
    conversationId: string | null;
    score: number | null;
  };
  "safety.canary_leak": {
    tenantId: string;
    conversationId: string | null;
    responseLen: number;
  };
  "safety.scope_violation": {
    tenantId: string;
    conversationId: string | null;
    reason: string;
    responseLen: number;
  };
  "safety.moderation_unavailable": {
    tenantId: string | null;
    errKind: string;
  };
  "chat.request.blocked": {
    tenantId: string;
    conversationId: string | null;
    reason: string;
    durationMs: number;
  };
  "rag.rewrite.completed": {
    tenantId: string;
    conversationId: string | null;
    originalLen: number;
    rewrittenLen: number;
    changed: boolean;
    durationMs: number;
  };
  "rag.rewrite.skipped": {
    tenantId: string;
    conversationId: string | null;
    reason: "disabled" | "no_anthropic" | "timeout" | "error" | "empty_result" | "too_long";
    durationMs: number;
  };
  "rag.rerank.applied": {
    tenantId: string;
    conversationId: string | null;
    candidateCount: number;
    keptCount: number;
    freshnessAppliedCount: number;
    topScoreBefore: number;
    topScoreAfter: number;
  };
  "chat.response.cards_stripped": {
    tenantId: string | null;
    conversationId: string | null;
    strippedCount: number;
    responseLen: number;
  };
  "chat.rate_limited": {
    assistantId: string;
    key: string;
  };
  "chat.stream.aborted": {
    tenantId: string | null;
    conversationId: string | null;
    charsEmitted: number;
    durationMs: number;
  };
  "ingest.rate_limited": {
    assistantId: string;
    key: string;
  };
};

export type EventName = keyof EventFields;
