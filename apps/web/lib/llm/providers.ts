import { hasOpenAI, hasAnthropic, env } from "@/lib/env";

export function getOpenAIClient() {
  if (!hasOpenAI()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OpenAI = require("openai").default;
  return new OpenAI({ apiKey: env.openaiApiKey });
}

export function getAnthropicClient() {
  if (!hasAnthropic()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require("@anthropic-ai/sdk").default;
  return new Anthropic({ apiKey: env.anthropicApiKey });
}

export function chooseModel(messageLength: number, chunkCount: number): string {
  const isComplex = messageLength > 120 || chunkCount === 0;
  return isComplex ? "gpt-4o" : "gpt-4o-mini";
}
