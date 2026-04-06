import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasDatabase } from "@/lib/env";
import { getSessionContext } from "@/lib/auth/session";
import * as queries from "@/lib/db/queries";
import { CustomerDetail } from "@/components/dashboard/customer-detail";

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

  const [assistant, knowledgeItems, conversations] = await Promise.all([
    queries.getAssistantForTenant(id),
    queries.getKnowledgeItems(id),
    queries.getConversations(id),
  ]);

  if (!assistant) return notFound();

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
          <div
            className="flex size-10 items-center justify-center rounded-lg text-white font-bold text-sm"
            style={{ backgroundColor: assistant.widgetColor }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
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
        conversationCount={conversations.length}
      />
    </div>
  );
}
