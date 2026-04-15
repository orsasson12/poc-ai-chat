/**
 * Integration result sanitizer.
 *
 * Applies PII stripping and data minimization to integration responses
 * before they reach the LLM. Uses the same PII patterns as the safety
 * pipeline (lib/safety/pii.ts).
 */

import type { IntegrationActionResult } from "@bizassist/types";

// PII patterns — same as safety pipeline
const PII_PATTERNS: { name: string; pattern: RegExp; replacement: string }[] = [
  { name: "email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: "[EMAIL]" },
  { name: "phone", pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, replacement: "[PHONE]" },
  { name: "credit_card", pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[CARD]" },
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: "[SSN]" },
  { name: "ip_address", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: "[IP]" },
];

// Fields that should never be passed to the LLM
const SENSITIVE_FIELDS = new Set([
  "password", "secret", "token", "access_token", "refresh_token",
  "api_key", "apikey", "private_key", "credit_card", "card_number",
  "cvv", "ssn", "social_security", "bank_account", "routing_number",
]);

/**
 * Sanitizes integration results:
 * 1. Removes sensitive fields entirely
 * 2. Strips PII from string values
 * 3. Applies field whitelist if provided (data minimization)
 */
export function sanitizeResult(
  result: IntegrationActionResult,
  allowedFields?: string[],
): IntegrationActionResult {
  if (!result.success) return result;

  const strippedFields: string[] = [...result.strippedFields];
  let sanitized = { ...result.data };

  // Step 1: Remove sensitive fields
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      delete sanitized[key];
      strippedFields.push(key);
    }
  }

  // Step 2: Apply field whitelist (data minimization)
  if (allowedFields && allowedFields.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in sanitized) {
        filtered[field] = sanitized[field];
      }
    }
    const removedFields = Object.keys(sanitized).filter((k) => !allowedFields.includes(k));
    strippedFields.push(...removedFields);
    sanitized = filtered;
  }

  // Step 3: Strip PII from string values
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string") {
      let cleaned = value;
      for (const { name, pattern, replacement } of PII_PATTERNS) {
        if (pattern.test(cleaned)) {
          cleaned = cleaned.replace(pattern, replacement);
          if (!strippedFields.includes(`${key}:${name}`)) {
            strippedFields.push(`${key}:${name}`);
          }
        }
        // Reset regex lastIndex since we use global flag
        pattern.lastIndex = 0;
      }
      sanitized[key] = cleaned;
    }
  }

  return {
    ...result,
    data: sanitized,
    strippedFields,
  };
}

/**
 * Formats sanitized integration results as context for the LLM.
 * Injected alongside RAG chunks in the system prompt.
 */
export function formatResultForLLM(
  actionName: string,
  providerLabel: string,
  result: IntegrationActionResult,
): string {
  if (!result.success) {
    return `[${providerLabel}] ${actionName} failed: ${result.error ?? "Unknown error"}. Let the customer know you couldn't retrieve the information and suggest they contact support directly.`;
  }

  const lines = Object.entries(result.data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([key, value]) => {
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return `${label}: ${formatValue(value)}`;
    });

  if (lines.length === 0) {
    return `[${providerLabel}] ${actionName}: No data found.`;
  }

  return `[${providerLabel}] ${actionName} result:\n${lines.join("\n")}`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
