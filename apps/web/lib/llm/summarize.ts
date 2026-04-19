/**
 * Summarizes older conversation messages to keep the context window manageable.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/llm/models";

const RECENT_WINDOW = 6;
const SUMMARIZE_THRESHOLD = 10;

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * If history is long, replaces older messages with a summary prefix.
 * Returns the optimized message array ready for the LLM.
 */
export async function optimizeHistory(
  messages: HistoryMessage[],
  anthropic: Anthropic | null,
): Promise<HistoryMessage[]> {
  if (messages.length <= SUMMARIZE_THRESHOLD) {
    return messages;
  }

  const older = messages.slice(0, messages.length - RECENT_WINDOW);
  const recent = messages.slice(-RECENT_WINDOW);

  const summary = await summarizeMessages(older, anthropic);

  return [
    { role: "user" as const, content: `[Previous conversation summary: ${summary}]` },
    { role: "assistant" as const, content: "Understood, I have the context from our earlier conversation." },
    ...recent,
  ];
}

async function summarizeMessages(
  messages: HistoryMessage[],
  anthropic: Anthropic | null,
): Promise<string> {
  // Try LLM-based summarization
  if (anthropic) {
    try {
      const transcript = messages
        .map((m) => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.content}`)
        .join("\n");

      const response = await anthropic.messages.create({
        model: MODELS.summarize,
        max_tokens: 200,
        system: "Summarize this conversation excerpt in 2-3 sentences. Capture the key topics discussed and any established context. Be concise.",
        messages: [{ role: "user", content: transcript }],
      });

      const block = response.content[0];
      if (block.type === "text" && block.text) {
        return block.text;
      }
    } catch (err) {
      console.error("Summarization failed, using truncation fallback:", err);
    }
  }

  // Fallback: take the last few user messages
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .slice(-3);

  return `The customer previously asked about: ${userMessages.join("; ")}`.slice(0, 500);
}
