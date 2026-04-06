import { NextRequest } from "next/server";
import { z } from "zod";
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

  return Response.json({ success: true });
}
