import Link from "next/link";
import { Plus, MessageSquare, BookOpen, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

export const revalidate = 30;

export default async function CustomersPage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  const customers = useDb
    ? await queries.getAllTenantsForOwner(ctx.user.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground">
            Manage your customer chatbots
          </p>
        </div>
        <Button render={<Link href="/customers/new" />} className="gap-2">
          <Plus className="size-4" />
          New Customer
        </Button>
      </div>

      {customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
              <Globe className="size-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No customers yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first customer to set up their AI chatbot with
              custom knowledge base and branding.
            </p>
            <Button
              render={<Link href="/customers/new" />}
              className="mt-6 gap-2"
            >
              <Plus className="size-4" />
              Add Your First Customer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="transition-colors hover:border-primary/50 hover:shadow-sm h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-10 items-center justify-center rounded-lg text-white font-bold text-sm"
                        style={{
                          backgroundColor:
                            customer.assistant?.widgetColor ?? "#2563eb",
                        }}
                      >
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {customer.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {customer.slug}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        customer.status === "active" ? "default" : "secondary"
                      }
                      className="text-xs"
                    >
                      {customer.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <BookOpen className="size-3.5" />
                      <span>{customer.knowledgeCount} items</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="size-3.5" />
                      <span>{customer.conversationCount} chats</span>
                    </div>
                  </div>
                  {customer.assistant && (
                    <p className="mt-2 text-xs text-muted-foreground truncate">
                      {customer.assistant.name}
                      {customer.assistant.isActive ? "" : " (disabled)"}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
