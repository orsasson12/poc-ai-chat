import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockConversations, mockMessages } from "@/lib/mock/data";

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId");

  if (!hasDatabase()) {
    if (conversationId) {
      return Response.json(mockMessages[conversationId] ?? []);
    }
    return Response.json(mockConversations);
  }

  const session = await getApiSession();
  if (!session?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (conversationId) {
    const messages = await queries.getMessages(conversationId, session.tenantId);
    return Response.json(messages);
  }

  const conversations = await queries.getConversations(session.tenantId);
  return Response.json(conversations);
}
