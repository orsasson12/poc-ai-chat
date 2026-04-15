/**
 * Builds the context package sent to agents on escalation.
 * Contains: summary, transcript, knowledge sources, customer info, bot draft.
 */

import * as queries from "@/lib/db/queries";
import type { EscalationContext, EscalationTrigger } from "@bizassist/types";

export async function buildEscalationContext(opts: {
  conversationId: string;
  tenantId: string;
  assistantId: string;
  trigger: EscalationTrigger;
  confidence: number;
  botDraftAnswer: string | null;
  knowledgeSourceIds: string[];
}): Promise<EscalationContext> {
  const [messages, assistant, tenant, knowledgeItems, conversation] = await Promise.all([
    queries.getMessages(opts.conversationId, opts.tenantId),
    queries.getAssistantById(opts.assistantId),
    queries.getTenantById(opts.tenantId),
    opts.knowledgeSourceIds.length > 0
      ? queries.getKnowledgeItemsByIds(opts.knowledgeSourceIds, opts.tenantId)
      : Promise.resolve([]),
    queries.getConversationBySession("", "").then(() => null), // placeholder
  ]);

  // Build transcript
  const transcript = messages.map((m) => ({
    role: m.role,
    sender: m.sender,
    content: m.content,
    confidence: m.confidence,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
  }));

  // Auto-generate summary from last few messages
  const summary = generateSummary(messages);

  // Get conversation for customer info
  const conv = await getConversationById(opts.conversationId, opts.tenantId);

  return {
    escalationId: "", // set by caller after event creation
    trigger: opts.trigger,
    summary,
    transcript,
    knowledgeSources: knowledgeItems.map((ki) => ({
      id: ki.id,
      title: ki.title,
      type: ki.type,
    })),
    botDraftAnswer: opts.botDraftAnswer,
    customer: {
      email: conv?.customerEmail ?? null,
      name: conv?.customerName ?? null,
      language: conv?.customerLanguage ?? null,
      device: conv?.customerDevice ?? null,
      referrerUrl: conv?.referrerUrl ?? null,
    },
    confidenceAtEscalation: opts.confidence,
    conversationId: opts.conversationId,
    assistantName: assistant?.name ?? "Assistant",
    businessName: tenant?.name ?? "Business",
    createdAt: new Date().toISOString(),
  };
}

async function getConversationById(conversationId: string, tenantId: string) {
  const conversations = await queries.getConversations(tenantId);
  return conversations.find((c) => c.id === conversationId) ?? null;
}

/**
 * Generates a 2-3 sentence summary from the conversation transcript.
 * Uses a simple heuristic: first user question + last bot response + escalation reason.
 */
function generateSummary(
  messages: { role: string; content: string; isFallback: boolean }[],
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  const botMessages = messages.filter((m) => m.role === "assistant");

  const firstQuestion = userMessages[0]?.content ?? "Unknown question";
  const lastBotResponse = botMessages[botMessages.length - 1];

  let summary = `Customer asked: "${truncate(firstQuestion, 100)}".`;

  if (userMessages.length > 1) {
    const lastQuestion = userMessages[userMessages.length - 1]?.content;
    if (lastQuestion && lastQuestion !== firstQuestion) {
      summary += ` Most recent question: "${truncate(lastQuestion, 100)}".`;
    }
  }

  if (lastBotResponse?.isFallback) {
    summary += " The assistant was unable to provide a confident answer.";
  } else if (botMessages.length > 0) {
    summary += ` The conversation had ${messages.length} messages over ${userMessages.length} exchanges.`;
  }

  return summary;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}
