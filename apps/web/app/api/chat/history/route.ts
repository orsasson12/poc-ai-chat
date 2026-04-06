import { NextRequest } from "next/server";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const assistantId = searchParams.get("assistantId");

  if (!sessionId || !assistantId) {
    return Response.json({ error: "Missing sessionId or assistantId" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ messages: [] });
  }

  const conversation = await queries.getConversationBySession(sessionId, assistantId);
  if (!conversation) {
    return Response.json({ messages: [] });
  }

  const messages = await queries.getMessages(conversation.id, conversation.tenantId);

  return Response.json({
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      feedback: m.feedback,
      createdAt: m.createdAt,
    })),
  });
}
