import { Download } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { AnalyticsTabs } from "@/components/dashboard/analytics/analytics-tabs";
import { TenantPicker } from "@/components/dashboard/analytics/tenant-picker";
import { buttonVariants } from "@/components/ui/button";
import { logger } from "@/lib/observability";
import { getMockAnalyticsOverview } from "@/lib/mock/analytics";

export const dynamic = "force-dynamic";

interface AnalyticsPageProps {
  searchParams: Promise<{ tenantId?: string }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await getSessionContext();
  const params = await searchParams;

  // Owners frequently have multiple customer tenants. Without a picker the
  // page used getTenantForUser() which does LIMIT 1 with no ORDER BY — i.e.
  // a non-deterministic tenant — so the analytics could randomly land on an
  // empty customer and look broken. Now we list all owned tenants and let
  // the user pick; default to the customer with the most conversations.
  let ownedTenants: Awaited<ReturnType<typeof queries.getAllTenantsForOwner>> = [];
  if (hasDatabase() && session) {
    try {
      ownedTenants = await queries.getAllTenantsForOwner(session.user.id);
    } catch (err) {
      // Don't blow up the whole page on a tenant-list query failure — fall
      // back to whatever tenant the session already resolved.
      logger.error(err, { stage: "analytics.getAllTenantsForOwner", userId: session.user.id });
    }
  }

  const tenantOptions = ownedTenants.map((t) => ({
    id: t.id,
    name: t.name,
    conversationCount: t.conversationCount,
  }));

  const requestedId = params.tenantId;
  const requestedExists = requestedId && tenantOptions.some((t) => t.id === requestedId);
  const defaultTenant =
    [...tenantOptions].sort((a, b) => b.conversationCount - a.conversationCount)[0] ?? null;

  // Resolve tenantId. Never pass the placeholder "mock" string into the real
  // DB query — its tenant_id columns are uuid type and the cast throws.
  const resolvedTenantId =
    (requestedExists ? requestedId : defaultTenant?.id) ?? session?.tenant.id ?? null;
  const selectedTenantId = resolvedTenantId ?? "mock";

  const selectedAssistant = ownedTenants.find((t) => t.id === selectedTenantId)?.assistant ?? null;
  const assistantId = selectedAssistant?.id ?? session?.assistant?.id ?? null;

  const overview =
    resolvedTenantId && hasDatabase()
      ? await getAnalyticsOverview(resolvedTenantId, 30).catch((err) => {
          logger.error(err, { stage: "analytics.getOverview", tenantId: resolvedTenantId });
          return getMockAnalyticsOverview(30);
        })
      : await getAnalyticsOverview(selectedTenantId, 30);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Understand where your bot delivers value and where to improve it next.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tenantOptions.length > 0 && (
            <TenantPicker tenants={tenantOptions} selectedId={selectedTenantId} />
          )}
          <a
            href={`/api/analytics/export?range=30&tenantId=${encodeURIComponent(selectedTenantId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export PDF
          </a>
        </div>
      </header>

      <AnalyticsTabs overview={overview} assistantId={assistantId} />
    </main>
  );
}
