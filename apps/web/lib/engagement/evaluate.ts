/**
 * Engagement rule evaluation engine.
 *
 * Given a set of behavior signals from the widget, determines which
 * engagement rule (if any) should fire. Rules are evaluated in priority
 * order; the first match wins.
 */

import type {
  WidgetBehaviorSignals,
  EngagementRule,
  MessageCta,
  MessageButton,
} from "@bizassist/types";

export interface EvaluationResult {
  engage: boolean;
  ruleId: string | null;
  message: string | null;
  // Rich presentation fields — widget uses these to render a card instead
  // of a plain text bubble. All nullable for plain-text rules.
  messageImage?: string | null;
  messageCta?: MessageCta | null;
  messageButtons?: MessageButton[];
  // Cap values echoed back so the widget can manage session-local suppression.
  maxPerSession?: number;
  cooldownSeconds?: number;
}

export interface EvaluationContext {
  /** Rule IDs the widget currently considers suppressed (per-session cap or cool-down). */
  suppressedRuleIds?: string[];
  /** Map of ruleId → lifetime fire count for this visitor, used to enforce `maxPerVisitor`. */
  visitorFireCounts?: Record<string, number>;
}

/**
 * Evaluates all enabled rules against the visitor's current signals.
 * Returns the highest-priority matching rule, or { engage: false }.
 *
 * The evaluator is pure — it does NOT hit the database. Caller is responsible
 * for producing the `EvaluationContext` (suppression list from the widget,
 * lifetime counts from `lead_events`).
 */
export function evaluateEngagementRules(
  rules: EngagementRule[],
  signals: WidgetBehaviorSignals,
  context: EvaluationContext = {},
): EvaluationResult {
  const noEngage: EvaluationResult = { engage: false, ruleId: null, message: null };

  const suppressed = new Set(context.suppressedRuleIds ?? []);
  const lifetimeCounts = context.visitorFireCounts ?? {};

  // Sort by priority (lower = higher priority)
  const sorted = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    // Widget-side suppression: per-session max or active cool-down timer.
    if (suppressed.has(rule.id)) continue;

    // Server-side lifetime cap.
    if (rule.maxPerVisitor > 0) {
      const fired = lifetimeCounts[rule.id] ?? 0;
      if (fired >= rule.maxPerVisitor) continue;
    }

    if (matchesRule(rule, signals)) {
      return {
        engage: true,
        ruleId: rule.id,
        message: rule.proactiveMessage,
        messageImage: rule.messageImage ?? null,
        messageCta: rule.messageCta ?? null,
        messageButtons: rule.messageButtons ?? [],
        maxPerSession: rule.maxPerSession ?? 0,
        cooldownSeconds: rule.cooldownSeconds ?? 0,
      };
    }
  }

  return noEngage;
}

function matchesRule(rule: EngagementRule, signals: WidgetBehaviorSignals): boolean {
  // First check URL pattern if it's set — the rule only applies to matching pages
  if (rule.urlPattern && !matchUrlPattern(rule.urlPattern, signals.pageUrl)) {
    return false;
  }

  switch (rule.trigger) {
    case "time_on_page":
      return signals.timeOnPageSeconds >= rule.delaySeconds;

    case "scroll_depth":
      return signals.scrollDepthPercent >= rule.scrollPercent;

    case "exit_intent":
      return signals.isExitIntent;

    case "return_visitor":
      return signals.isReturnVisitor;

    case "url_pattern":
      // URL-only trigger — fires as soon as the visitor is on a matching page
      // (after minimum 3s to avoid flash)
      return signals.timeOnPageSeconds >= 3;

    default:
      return false;
  }
}

/**
 * Matches a URL against a glob-like pattern.
 * Supports: * (any segment), ** (any path), exact match.
 * Examples: /pricing/*, /products/**, /blog/2024/*
 */
function matchUrlPattern(pattern: string, url: string): boolean {
  try {
    const pathname = new URL(url).pathname;

    // Convert glob to regex
    const regexStr = pattern
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/\{\{GLOBSTAR\}\}/g, ".*");

    const regex = new RegExp("^" + regexStr + "$");
    return regex.test(pathname);
  } catch {
    // If URL parsing fails, try simple includes check
    return url.includes(pattern);
  }
}
