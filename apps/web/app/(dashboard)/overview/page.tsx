import {
  MessageSquare,
  CheckCircle,
  ThumbsUp,
  HelpCircle,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { StatusBadge, SeverityBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionContext } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { mockMetrics, mockKnowledgeItems, mockSecurityEvents } from "@/lib/mock/data";
import { formatPercentage } from "@/lib/utils";

export default async function OverviewPage() {
  const ctx = await getSessionContext();
  const useDb = hasDatabase() && !!ctx;

  const [metrics, knowledgeItems, securityEvents] = await Promise.all([
    useDb ? queries.getDashboardMetrics(ctx.tenant.id) : mockMetrics,
    useDb ? queries.getKnowledgeItems(ctx.tenant.id) : mockKnowledgeItems,
    useDb ? queries.getSecurityEvents(ctx.tenant.id) : mockSecurityEvents,
  ]);

  const erroredItems = knowledgeItems.filter((item) => item.status === "error");
  const recentAlerts = securityEvents.slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground">
          Your assistant performance at a glance
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Conversations Today"
          value={metrics.conversationsToday}
          description={`${metrics.conversationsWeek} this week`}
          icon={MessageSquare}
        />
        <MetricCard
          title="Resolution Rate"
          value={formatPercentage(metrics.resolutionRate)}
          description="Questions answered without escalation"
          icon={CheckCircle}
        />
        <MetricCard
          title="CSAT Score"
          value={formatPercentage(metrics.csatScore)}
          description="Customer satisfaction"
          icon={ThumbsUp}
        />
        <MetricCard
          title="Unanswered"
          value={metrics.unansweredCount}
          description="Questions needing attention"
          icon={HelpCircle}
        />
      </div>

      {/* Health Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle>System Health Score</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">
              {metrics.healthScore}
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <div className="flex-1">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${metrics.healthScore}%` }}
                  role="progressbar"
                  aria-valuenow={metrics.healthScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Health score: ${metrics.healthScore} out of 100`}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your assistant is performing well. Keep your knowledge base
                up to date to maintain a high score.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Errored Knowledge Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <CardTitle>Knowledge Base Alerts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {erroredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No errors in your knowledge base.
              </p>
            ) : (
              <ul className="space-y-2">
                {erroredItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <span className="text-sm font-medium truncate">
                      {item.title}
                    </span>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent Security Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <CardTitle>Recent Security Events</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent security events.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentAlerts.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-xs">
                        {event.eventType}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.inputText.slice(0, 50)}
                        {event.inputText.length > 50 ? "..." : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <SeverityBadge severity={event.severity} />
                      {event.blocked && (
                        <Badge variant="destructive" className="text-xs">
                          Blocked
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
