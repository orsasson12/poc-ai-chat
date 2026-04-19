import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { logger } from "@/lib/observability";

type Severity = "low" | "medium" | "high" | "critical";
type EventType =
  | "prompt_injection"
  | "content_moderation"
  | "pii_detected"
  | "canary_leak"
  | "scope_violation";

export interface LogSecurityEventArgs {
  tenantId: string;
  conversationId: string | null;
  eventType: EventType;
  severity: Severity;
  score: number | null;
  inputText: string;
  blocked: boolean;
  stage: "input" | "output";
}

export async function logSecurityEvent(args: LogSecurityEventArgs): Promise<void> {
  const { tenantId, conversationId, eventType, severity, score, inputText, blocked, stage } = args;
  const truncated = inputText.slice(0, 500);

  if (hasDatabase()) {
    try {
      await queries.createSecurityEvent({
        tenantId,
        conversationId: conversationId ?? undefined,
        eventType,
        severity,
        inputText: truncated,
        classificationScore: (score ?? 0).toFixed(3),
        blocked,
      });
    } catch (err) {
      logger.error(err, { tenantId, conversationId, stage: "persist_security_event", eventType });
    }
  }

  logger.event("safety.blocked", {
    tenantId,
    conversationId,
    eventType,
    severity,
    score,
    stage,
  });

  if (eventType === "pii_detected") {
    logger.event("safety.pii_detected", { tenantId, conversationId, score });
  }
  if (eventType === "canary_leak") {
    logger.event("safety.canary_leak", {
      tenantId,
      conversationId,
      responseLen: inputText.length,
    });
  }
  if (eventType === "scope_violation") {
    logger.event("safety.scope_violation", {
      tenantId,
      conversationId,
      reason: "output_validation_failed",
      responseLen: inputText.length,
    });
  }

  if (severity === "high" || severity === "critical") {
    logger.error(new Error(`security_event:${eventType}`), {
      tenantId,
      conversationId,
      eventType,
      severity,
      score,
    });
  }
}
