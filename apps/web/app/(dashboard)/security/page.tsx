import { Eye, ShieldAlert, ShieldX, ShieldCheck } from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SecurityEventLog } from "@/components/dashboard/security-event-log";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockSecurityEvents } from "@/lib/mock/data";

export default async function SecurityPage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  const securityEvents = useDb
    ? await queries.getSecurityEvents(ctx.tenant.id)
    : mockSecurityEvents;

  const totalEvents = securityEvents.length;
  const injectionAttempts = securityEvents.filter(
    (e) => e.eventType === "prompt_injection",
  ).length;
  const moderationFlags = securityEvents.filter(
    (e) => e.eventType === "content_moderation",
  ).length;
  const blockedCount = securityEvents.filter((e) => e.blocked).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground">
          Monitor and review security events for your assistant
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Events"
          value={totalEvents}
          description="All security events recorded"
          icon={Eye}
        />
        <MetricCard
          title="Injection Attempts"
          value={injectionAttempts}
          description="Prompt injection attempts detected"
          icon={ShieldAlert}
        />
        <MetricCard
          title="Moderation Flags"
          value={moderationFlags}
          description="Content moderation triggers"
          icon={ShieldX}
        />
        <MetricCard
          title="Blocked"
          value={blockedCount}
          description="Requests blocked by safety filters"
          icon={ShieldCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <SecurityEventLog events={securityEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
