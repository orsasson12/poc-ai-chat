import { createHmac } from "crypto";
import { env } from "@/lib/env";

export function generateCanaryToken(tenantId: string): string {
  return createHmac("sha256", env.canarySalt)
    .update(tenantId)
    .digest("hex")
    .slice(0, 16);
}

export function validateOutput(
  response: string,
  tenantId: string
): { passed: boolean; reason?: string } {
  const canary = generateCanaryToken(tenantId);

  if (response.includes(canary)) {
    return { passed: false, reason: "canary_leak" };
  }

  const systemPhrasePatterns = [
    /you are an AI assistant/i,
    /your instructions are/i,
    /system prompt/i,
    /\[INSTRUCTIONS\]/i,
    /\[RETRIEVED CONTEXT\]/i,
  ];

  for (const pattern of systemPhrasePatterns) {
    if (pattern.test(response)) {
      return { passed: false, reason: "system_prompt_leak" };
    }
  }

  if (response.length > 3000) {
    return { passed: false, reason: "response_too_long" };
  }

  return { passed: true };
}
