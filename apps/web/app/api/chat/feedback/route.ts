import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

const feedbackSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().min(8),
  assistantId: z.string().uuid(),
  feedback: z.enum(["positive", "negative"]),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = feedbackSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const { messageId, sessionId, assistantId, feedback } = parsed.data;

  // Verify the session owns this conversation
  const conversation = await queries.getConversationBySession(sessionId, assistantId);
  if (!conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const message = await queries.getMessageById(messageId);
  if (!message || message.conversationId !== conversation.id || message.role !== "assistant") {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  await queries.updateMessageFeedback(messageId, conversation.tenantId, feedback);

  // Roll the per-message feedback up to the conversation-level satisfaction
  // (-1 / 0 / 1) so the analytics Overview CSAT KPI reflects it immediately.
  const d = getDb();
  if (d) {
    await d.execute(sql`
      UPDATE conversations
      SET satisfaction = COALESCE((
        SELECT ROUND(AVG(
          CASE
            WHEN m.feedback = 'positive' THEN 1
            WHEN m.feedback = 'negative' THEN -1
            ELSE 0
          END
        ))::int
        FROM messages m
        WHERE m.conversation_id = conversations.id
          AND m.feedback IN ('positive', 'negative')
      ), 0)
      WHERE id = ${conversation.id}
    `);
  }

  return Response.json({ success: true });
}
