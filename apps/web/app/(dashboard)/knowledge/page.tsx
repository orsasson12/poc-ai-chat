import Link from "next/link";
import { FileText, Globe, MessageSquareText, Database, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockKnowledgeItems } from "@/lib/mock/data";
import type { KnowledgeItemType } from "@bizassist/types";

const typeIcons: Record<KnowledgeItemType, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  url: Globe,
  manual_qa: MessageSquareText,
  structured: Database,
};

export default async function KnowledgePage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  if (!useDb) {
    // Mock mode — show mock items
    const totalChunks = mockKnowledgeItems.reduce((s, i) => s + i.chunkCount, 0);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-muted-foreground">All knowledge items across your customers</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {mockKnowledgeItems.length} items &middot; {totalChunks} chunks (mock data)
        </p>
      </div>
    );
  }

  // Get all customers with their knowledge items
  const customers = await queries.getAllTenantsForOwner(ctx.user.id);

  const customersWithKnowledge = await Promise.all(
    customers.map(async (customer) => {
      const items = await queries.getKnowledgeItems(customer.id);
      return { customer, items };
    }),
  );

  const totalItems = customersWithKnowledge.reduce((s, c) => s + c.items.length, 0);
  const totalChunks = customersWithKnowledge.reduce(
    (s, c) => s + c.items.reduce((s2, i) => s2 + i.chunkCount, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Knowledge Base</h1>
        <p className="text-muted-foreground">
          All knowledge items across your customers &middot; {totalItems} items &middot; {totalChunks} chunks
        </p>
      </div>

      {customersWithKnowledge.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No customers yet.{" "}
              <Link href="/customers/new" className="text-primary underline underline-offset-4">
                Create a customer
              </Link>{" "}
              to start adding knowledge.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {customersWithKnowledge.map(({ customer, items }) => (
            <Card key={customer.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-8 items-center justify-center rounded-lg text-white font-bold text-xs"
                      style={{ backgroundColor: customer.assistant?.widgetColor ?? "#2563eb" }}
                    >
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-base">{customer.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {items.length} items
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link href={`/customers/${customer.id}`} />}
                    className="gap-1.5 text-xs"
                  >
                    Manage
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              {items.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {items.map((item) => {
                      const Icon = typeIcons[item.type];
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
