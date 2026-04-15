/**
 * Escalation detection engine.
 *
 * Runs after each bot response to decide whether the conversation
 * should be escalated to a human agent. Each trigger is independently
 * evaluated; the first match wins.
 */

import type { EscalationTrigger, EscalationMode } from "@bizassist/types";

// ---- Types ----

export interface EscalationRule {
  trigger: EscalationTrigger;
  enabled: boolean;
  confidenceThreshold: number;
  consecutiveCount: number;
  phrases: string[] | null;
  mode: EscalationMode;
}

export interface ConversationSignals {
  /** Current response confidence (0-1) */
  confidence: number;
  /** Whether the current response is a fallback */
  isFallback: boolean;
  /** Recent message history for this conversation (newest last) */
  recentMessages: {
    role: "user" | "assistant";
    confidence: number | null;
    isFallback: boolean;
    content: string;
  }[];
  /** The user's latest message text */
  userMessage: string;
  /** Whether a safety event was triggered on this turn */
  safetyTriggered: boolean;
}

export interface DetectionResult {
  shouldEscalate: boolean;
  trigger: EscalationTrigger | null;
  mode: EscalationMode | null;
  reason: string | null;
}

// ---- Default phrases for explicit-request detection ----

const DEFAULT_HUMAN_PHRASES = [
  "talk to a person",
  "talk to a human",
  "talk to someone",
  "speak to a person",
  "speak to a human",
  "speak to someone",
  "human agent",
  "real person",
  "real human",
  "representative",
  "speak to an agent",
  "talk to an agent",
  "connect me with",
  "transfer me",
  "customer service",
  "customer support",
  "live chat",
  "live agent",
  "i want a person",
  "i need a person",
  "i want a human",
  "i need a human",
  // Hebrew
  "נציג אנושי",
  "לדבר עם נציג",
  "לדבר עם בנאדם",
  "שירות לקוחות",
  "נציג שירות",
];

// ---- Detection logic ----

export function detectEscalation(
  rules: EscalationRule[],
  signals: ConversationSignals,
): DetectionResult {
  const noEscalation: DetectionResult = {
    shouldEscalate: false,
    trigger: null,
    mode: null,
    reason: null,
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.trigger) {
      case "explicit_request": {
        if (checkExplicitRequest(rule, signals)) {
          return {
            shouldEscalate: true,
            trigger: "explicit_request",
            mode: rule.mode,
            reason: "Customer explicitly requested a human agent",
          };
        }
        break;
      }

      case "safety": {
        if (signals.safetyTriggered) {
          return {
            shouldEscalate: true,
            trigger: "safety",
            mode: rule.mode,
            reason: "Safety event detected (PII or security flag)",
          };
        }
        break;
      }

      case "low_confidence": {
        if (checkLowConfidence(rule, signals)) {
          return {
            shouldEscalate: true,
            trigger: "low_confidence",
            mode: rule.mode,
            reason: `Confidence below ${Math.round(rule.confidenceThreshold * 100)}% for ${rule.consecutiveCount}+ consecutive responses`,
          };
        }
        break;
      }

      case "repeat_failure": {
        if (checkRepeatFailure(rule, signals)) {
          return {
            shouldEscalate: true,
            trigger: "repeat_failure",
            mode: rule.mode,
            reason: `Fallback response returned ${rule.consecutiveCount}+ times in this conversation`,
          };
        }
        break;
      }

      case "sentiment": {
        // Future: sentiment analysis integration
        break;
      }
    }
  }

  return noEscalation;
}

// ---- Individual trigger checks ----

function checkExplicitRequest(
  rule: EscalationRule,
  signals: ConversationSignals,
): boolean {
  const phrases = rule.phrases?.length ? rule.phrases : DEFAULT_HUMAN_PHRASES;
  const normalized = signals.userMessage.toLowerCase().trim();

  return phrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function checkLowConfidence(
  rule: EscalationRule,
  signals: ConversationSignals,
): boolean {
  const threshold = rule.confidenceThreshold;
  const required = rule.consecutiveCount;

  // Count consecutive low-confidence bot responses from the end
  // Include the current response
  const botResponses = [
    ...signals.recentMessages.filter((m) => m.role === "assistant"),
    { confidence: signals.confidence, isFallback: signals.isFallback },
  ];

  let consecutiveLow = 0;
  for (let i = botResponses.length - 1; i >= 0; i--) {
    const conf = botResponses[i].confidence;
    if (conf !== null && conf < threshold) {
      consecutiveLow++;
    } else {
      break;
    }
  }

  return consecutiveLow >= required;
}

function checkRepeatFailure(
  rule: EscalationRule,
  signals: ConversationSignals,
): boolean {
  const required = rule.consecutiveCount;

  // Count consecutive fallback bot responses from the end
  const botResponses = [
    ...signals.recentMessages.filter((m) => m.role === "assistant"),
    { isFallback: signals.isFallback },
  ];

  let consecutiveFallbacks = 0;
  for (let i = botResponses.length - 1; i >= 0; i--) {
    if (botResponses[i].isFallback) {
      consecutiveFallbacks++;
    } else {
      break;
    }
  }

  return consecutiveFallbacks >= required;
}

// ---- Default rules factory ----

/** Returns default escalation rules for a new assistant */
export function getDefaultEscalationRules(): Omit<EscalationRule, "mode">[] {
  return [
    {
      trigger: "explicit_request",
      enabled: true,
      confidenceThreshold: 0,
      consecutiveCount: 1,
      phrases: null, // uses DEFAULT_HUMAN_PHRASES
    },
    {
      trigger: "low_confidence",
      enabled: true,
      confidenceThreshold: 0.40,
      consecutiveCount: 2,
      phrases: null,
    },
    {
      trigger: "repeat_failure",
      enabled: true,
      confidenceThreshold: 0,
      consecutiveCount: 2,
      phrases: null,
    },
    {
      trigger: "safety",
      enabled: true,
      confidenceThreshold: 0,
      consecutiveCount: 1,
      phrases: null,
    },
    {
      trigger: "sentiment",
      enabled: false, // future feature
      confidenceThreshold: 0,
      consecutiveCount: 2,
      phrases: null,
    },
  ];
}
