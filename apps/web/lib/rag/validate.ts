import { validateOutput } from "@/lib/safety/canary";

interface ValidationResult {
  passed: boolean;
  reason?: string;
}

export function validateResponse(
  response: string,
  tenantId: string,
  chunksWereEmpty: boolean,
  fallbackMsg: string
): ValidationResult {
  const canaryCheck = validateOutput(response, tenantId);
  if (!canaryCheck.passed) {
    return canaryCheck;
  }

  if (chunksWereEmpty && response !== fallbackMsg && !response.includes(fallbackMsg)) {
    return { passed: false, reason: "ungrounded_response" };
  }

  return { passed: true };
}
