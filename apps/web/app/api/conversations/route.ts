import { NextRequest } from "next/server";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockConversations, mockMessages } from "@/lib/mock/data";

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const tenantIdParam = request.nextUrl.searchParams.get("tenantId");

  if (!hasDatabase()) {
    if (conversationId) {
      return Response.json(mockMessages[conversationId] ?? []);
    }
    return Response.json(mockConversations);
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use explicit tenantId param (for per-customer views) or fall back to session tenant
  let tenantId = session.tenantId;
  if (tenantIdParam) {
    const tenant = await queries.getTenantById(tenantIdParam);
    if (!tenant || tenant.ownerId !== session.user.id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    tenantId = tenantIdParam;
  }

  if (!tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (conversationId) {
    const messages = await queries.getMessages(conversationId, tenantId);
    return Response.json(messages);
  }

  const conversations = await queries.getConversations(tenantId);
  return Response.json(conversations);
}
