import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasDatabase } from "@/lib/env";
import { getSessionContext } from "@/lib/auth/session";
import * as queries from "@/lib/db/queries";
import { mockMessages } from "@/lib/mock/data";
import { CustomerDetail } from "@/components/dashboard/customer-detail";
import type { CardData } from "@bizassist/types";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  if (!hasDatabase()) return notFound();

  const ctx = await getSessionContext();
  if (!ctx) return notFound();

  const tenant = await queries.getTenantById(id);
  if (!tenant || tenant.ownerId !== ctx.user.id) return notFound();

  const [assistant, knowledgeItems, conversations, metrics, volume, topQuestions, securityEvents, customerStats, featuredItems] = await Promise.all([
    queries.getAssistantForTenant(id),
    queries.getKnowledgeItems(id),
    queries.getConversations(id),
    queries.getDashboardMetrics(id),
    queries.getConversationVolume(id),
    queries.getTopQuestions(id),
    queries.getSecurityEvents(id),
    queries.getCustomerStats(id),
    queries.getFeaturedItems(id),
  ]);

  if (!assistant) return notFound();

  // Build featured cards for the Welcome tab
  const featuredCards: CardData[] = featuredItems
    .filter((item) => item.type === "structured" && item.metadata && typeof item.metadata === "object")
    .map((item) => {
      const meta = item.metadata as { imageUrl?: string | null; cardType: string; fields: Record<string, string | number | boolean | null> };
      return {
        knowledgeItemId: item.id,
        title: item.title,
        imageUrl: meta.imageUrl ?? null,
        cardType: meta.cardType,
        fields: meta.fields,
        sourceUrl: item.sourceUrl,
      };
    });

  // Serialize conversations for the client component
  const serializedConversations = conversations.map((c) => ({
    ...c,
    satisfaction: c.satisfaction as -1 | 0 | 1,
    startedAt: c.startedAt instanceof Date ? c.startedAt.toISOString() : String(c.startedAt),
    endedAt: c.endedAt instanceof Date ? c.endedAt.toISOString() : c.endedAt ? String(c.endedAt) : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/customers" />}
          aria-label="Back to customers"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-3">
          {assistant.avatarUrl ? (
            <img
              src={assistant.avatarUrl}
              alt={tenant.name}
              className="size-10 rounded-lg object-cover"
            />
          ) : (
            <div
              className="flex size-10 items-center justify-center rounded-lg text-white font-bold text-sm"
              style={{ backgroundColor: assistant.widgetColor }}
            >
              {tenant.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground">
              {assistant.name} &middot; {tenant.plan} plan
            </p>
          </div>
        </div>
      </div>

      <CustomerDetail
        tenant={JSON.parse(JSON.stringify(tenant))}
        assistant={JSON.parse(JSON.stringify(assistant))}
        knowledgeItems={JSON.parse(JSON.stringify(knowledgeItems))}
        conversations={serializedConversations}
        useApi={true}
        initialMessages={mockMessages}
        featuredCards={featuredCards}
        metrics={JSON.parse(JSON.stringify(metrics))}
        volume={JSON.parse(JSON.stringify(volume))}
        topQuestions={JSON.parse(JSON.stringify(topQuestions))}
        securityEvents={JSON.parse(JSON.stringify(securityEvents))}
        customerStats={JSON.parse(JSON.stringify(customerStats))}
      />
    </div>
  );
}
