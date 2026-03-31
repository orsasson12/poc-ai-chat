import { hasOpenAI } from "@/lib/env";
import type { SafetyResult } from "@bizassist/types";

export async function checkModeration(message: string): Promise<SafetyResult> {
  if (!hasOpenAI()) {
    return { passed: true, blocked: false };
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const result = await openai.moderations.create({ input: message });
  const output = result.results[0];

  if (output.flagged) {
    const categories = output.categories;
    let severity: "low" | "medium" | "high" | "critical" = "medium";

    if (categories["self-harm"] || categories["self-harm/intent"]) {
      severity = "critical";
    } else if (categories.hate || categories.violence) {
      severity = "high";
    }

    return {
      passed: false,
      blocked: true,
      eventType: "content_moderation",
      severity,
      score: Math.max(...Object.values(output.category_scores)),
    };
  }

  return { passed: true, blocked: false };
}
