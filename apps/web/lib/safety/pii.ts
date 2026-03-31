import type { SafetyResult } from "@bizassist/types";

const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: "[EMAIL]" },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: "[PHONE]" },
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[CREDIT_CARD]" },
  { pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[SSN]" },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: "[IP_ADDRESS]" },
];

export function stripPii(message: string): SafetyResult & { cleanedMessage: string } {
  let cleaned = message;
  let detected = false;

  for (const { pattern, replacement } of PII_PATTERNS) {
    if (pattern.test(cleaned)) {
      detected = true;
      // Reset lastIndex since we're reusing regex with /g flag
      pattern.lastIndex = 0;
      cleaned = cleaned.replace(pattern, replacement);
    }
  }

  return {
    passed: true,
    blocked: false,
    cleanedMessage: cleaned,
    ...(detected && {
      eventType: "pii_detected" as const,
      severity: "medium" as const,
      score: 0.99,
    }),
  };
}
