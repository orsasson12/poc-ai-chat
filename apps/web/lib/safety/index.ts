import { checkInjection } from "./injection";
import { checkModeration } from "./moderation";
import { stripPii } from "./pii";
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

  const moderationResult = await checkModeration(message);
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
