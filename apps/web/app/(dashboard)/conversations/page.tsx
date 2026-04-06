import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockConversations, mockMessages } from "@/lib/mock/data";
import { ConversationsClient } from "@/components/dashboard/conversations-client";
import { UnansweredQuestions } from "@/components/dashboard/unanswered-questions";
import type { SatisfactionScore } from "@bizassist/types";

export default async function ConversationsPage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  const conversations = useDb
    ? await queries.getConversations(ctx.tenant.id)
    : mockConversations;

  // Pre-serialize dates for client component
  const serialized = conversations.map((c) => ({
    ...c,
    satisfaction: c.satisfaction as SatisfactionScore,
    startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
    endedAt: c.endedAt instanceof Date ? c.endedAt.toISOString() : c.endedAt ? String(c.endedAt) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Conversations</h1>
        <p className="text-muted-foreground">
          Browse and review chat transcripts
        </p>
      </div>

      <UnansweredQuestions />

      <ConversationsClient
        conversations={serialized}
        initialMessages={mockMessages}
        useApi={useDb}
      />
    </div>
  );
}
