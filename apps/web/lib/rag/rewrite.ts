import { hasAnthropic, env } from "@/lib/env";
import { getAnthropicClient } from "@/lib/llm/providers";
import { logger } from "@/lib/observability";
import { classifyError } from "@/lib/observability/scrub";

const REWRITE_MODEL = "claude-haiku-4-5-20251001";
const REWRITE_TIMEOUT_MS = 600;
const MAX_OUTPUT_CHARS = 400;
const MAX_HISTORY_TURNS = 4;
const HISTORY_TURN_CHAR_CAP = 200;

const SYSTEM_PROMPT = [
  "You rewrite customer chat messages into short retrieval queries for a knowledge base search.",
  "Rules:",
  '- Resolve pronouns ("it", "that", "they") using the provided history.',
  '- Expand vague terms into the specific topic they refer to (e.g. "returns" → "return policy refund window").',
  "- Keep the user's intent and domain vocabulary. Do not invent facts.",
  "- Output the rewritten query only. No explanation, no quotes, no prefix.",
  "- If the message is already specific, return it unchanged.",
  "- Never exceed 20 words.",
].join("\n");

export type RewriteSkipReason =
  | "disabled"
  | "no_anthropic"
  | "timeout"
  | "error"
  | "empty_result"
  | "too_long";

export interface RewriteResult {
  rewritten: string;
  usedRewriter: boolean;
  durationMs: number;
  changed: boolean;
  skippedReason?: RewriteSkipReason;
}

export interface RewriteOptions {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  tenantId: string;
}

function buildUserPrompt(message: string, history: RewriteOptions["history"]): string {
  const recent = history.slice(-MAX_HISTORY_TURNS).map((h) => {
    const prefix = h.role === "user" ? "user" : "assistant";
    const body = (h.content ?? "").slice(0, HISTORY_TURN_CHAR_CAP);
    return `${prefix}: ${body}`;
  });

  const historyBlock = recent.length > 0 ? recent.join("\n") : "(no prior turns)";
  return [
    "Recent conversation:",
    historyBlock,
    "",
    `Current message: ${message}`,
    "",
    "Rewritten query:",
  ].join("\n");
}

function extractText(response: unknown): string {
  const msg = response as { content?: Array<{ type: string; text?: string }> };
  const block = msg.content?.find((b) => b.type === "text");
  return (block?.text ?? "").trim();
}

function sanitize(raw: string): string {
  return raw.replace(/^["'`]+|["'`]+$/g, "").trim();
}

export async function rewriteQuery(opts: RewriteOptions): Promise<RewriteResult> {
  const { message, history } = opts;
  const started = Date.now();

  if (!env.ragQueryRewriteEnabled) {
    return { rewritten: message, usedRewriter: false, durationMs: 0, changed: false, skippedReason: "disabled" };
  }
  if (!hasAnthropic()) {
    return { rewritten: message, usedRewriter: false, durationMs: 0, changed: false, skippedReason: "no_anthropic" };
  }

  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return { rewritten: message, usedRewriter: false, durationMs: 0, changed: false, skippedReason: "no_anthropic" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REWRITE_TIMEOUT_MS);

  try {
    const response = await anthropic.messages.create(
      {
        model: REWRITE_MODEL,
        max_tokens: 80,
        temperature: 0.0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(message, history) }],
      },
      { signal: controller.signal },
    );

    const durationMs = Date.now() - started;
    const text = sanitize(extractText(response));

    if (!text) {
      return { rewritten: message, usedRewriter: false, durationMs, changed: false, skippedReason: "empty_result" };
    }
    if (text.length > MAX_OUTPUT_CHARS || text.length > message.length * 2 + 40) {
      return { rewritten: message, usedRewriter: false, durationMs, changed: false, skippedReason: "too_long" };
    }

    const changed = text.trim() !== message.trim();
    return { rewritten: text, usedRewriter: true, durationMs, changed };
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - started;
    const isAbort = (err as { name?: string } | null)?.name === "AbortError";
    const reason: RewriteSkipReason = isAbort ? "timeout" : "error";
    if (!isAbort) {
      logger.error(err, { stage: "rag_rewrite", tenantId: opts.tenantId, errKind: classifyError(err) });
    }
    return { rewritten: message, usedRewriter: false, durationMs, changed: false, skippedReason: reason };
  } finally {
    clearTimeout(timer);
  }
}
