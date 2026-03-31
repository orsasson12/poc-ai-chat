import type { SafetyResult } from "@bizassist/types";

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?(your|previous)\s+instructions/i,
  /you\s+are\s+now\s+(DAN|unrestricted|jailbroken)/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/i,
  /show\s+me\s+your\s+(system|initial)\s+prompt/i,
  /what\s+(are|is)\s+your\s+(system\s+)?instructions/i,
  /repeat\s+(the\s+)?above\s+text/i,
  /output\s+(your|the)\s+(system|initial)\s+prompt/i,
  /pretend\s+you\s+(are|can|have)/i,
  /bypass\s+(your|the|all)\s+(safety|content|moderation)/i,
  /override\s+(your|the)\s+(rules|restrictions|programming)/i,
  /new\s+instructions?\s*:/i,
  /\[system\]/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /do\s+anything\s+now/i,
  /no\s+restrictions?\s+mode/i,
  /developer\s+mode\s+(enabled|activated|on)/i,
  /I\s+am\s+(the|your)\s+(owner|creator|developer|admin)/i,
];

const SOFT_SIGNALS = [
  { pattern: /ignore/i, weight: 0.2 },
  { pattern: /override/i, weight: 0.25 },
  { pattern: /bypass/i, weight: 0.3 },
  { pattern: /unrestricted/i, weight: 0.3 },
  { pattern: /jailbreak/i, weight: 0.4 },
  { pattern: /system\s*prompt/i, weight: 0.35 },
  { pattern: /instructions/i, weight: 0.15 },
];

function normalizeInput(text: string): string {
  let normalized = text.replace(/(\w)\s+(?=\w\s+\w)/g, (match) =>
    match.replace(/\s/g, "")
  );

  try {
    const decoded = atob(text.trim());
    if (/[a-zA-Z\s]{5,}/.test(decoded)) {
      normalized += " " + decoded;
    }
  } catch {
    // not base64
  }

  return normalized;
}

export function checkInjection(message: string, threshold = 0.8): SafetyResult {
  const normalized = normalizeInput(message);

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        passed: false,
        blocked: true,
        eventType: "prompt_injection",
        severity: "high",
        score: 0.95,
      };
    }
  }

  let score = 0;
  for (const signal of SOFT_SIGNALS) {
    if (signal.pattern.test(normalized)) {
      score += signal.weight;
    }
  }

  if (score >= threshold) {
    return {
      passed: false,
      blocked: true,
      eventType: "prompt_injection",
      severity: "medium",
      score,
    };
  }

  return { passed: true, blocked: false };
}
