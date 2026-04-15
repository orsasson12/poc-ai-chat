import { Download } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { AnalyticsTabs } from "@/components/dashboard/analytics/analytics-tabs";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getSessionContext();
  const tenantId = session?.tenant.id ?? "mock";
  const assistantId = session?.assistant?.id ?? null;
  const overview = await getAnalyticsOverview(tenantId, 30);

  return (
    <main className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Understand where your bot delivers value and where to improve it next.
          </p>
        </div>
        <a
          href="/api/analytics/export?range=30"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Export PDF
        </a>
      </header>

      <AnalyticsTabs overview={overview} assistantId={assistantId} />
    </main>
  );
}
