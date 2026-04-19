import { checkInjection } from "./injection";
import { checkModeration } from "./moderation";
import { stripPii } from "./pii";
import { logger } from "@/lib/observability";
import { classifyError } from "@/lib/observability/scrub";
import type { SafetyResult } from "@bizassist/types";

export interface SafetyPipelineResult {
  passed: boolean;
  cleanedMessage: string;
  events: SafetyResult[];
}

export async function runSafetyPipeline(message: string): Promise<SafetyPipelineResult> {
  const events: SafetyResult[] = [];

  const injectionResult = checkInjection(message);
  if (injectionResult.blocked) {
    events.push(injectionResult);
    return { passed: false, cleanedMessage: message, events };
  }

  // Fail-open: if the moderation service is unavailable, allow the message
  // through but log it. Rationale: OpenAI outage shouldn't take down chat.
  let moderationResult: SafetyResult;
  try {
    moderationResult = await checkModeration(message);
  } catch (err) {
    logger.event("safety.moderation_unavailable", {
      tenantId: null,
      errKind: classifyError(err),
    });
    logger.error(err, { stage: "moderation_check" });
    moderationResult = { passed: true, blocked: false };
  }

  if (moderationResult.blocked) {
    events.push(moderationResult);
    return { passed: false, cleanedMessage: message, events };
  }

  const piiResult = stripPii(message);
  if (piiResult.eventType) {
    events.push(piiResult);
  }

  return { passed: true, cleanedMessage: piiResult.cleanedMessage, events };
}
