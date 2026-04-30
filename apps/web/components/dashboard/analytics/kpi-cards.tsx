import { Card, CardContent } from "@/components/ui/card";
import {
  MessageSquare,
  CheckCircle2,
  Gauge,
  Smile,
  Clock,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import type { AnalyticsOverview } from "@/lib/analytics/types";

interface KpiCardsProps {
  kpis: AnalyticsOverview["kpis"];
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}

function Kpi({ label, value, hint, icon }: KpiProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-2xl font-semibold leading-tight">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  // With zero conversations, resolution rate has no signal either — show "—"
  // rather than a flat 0% that looks like all conversations failed to resolve.
  const hasConversations = kpis.totalConversations > 0;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Total conversations"
        value={kpis.totalConversations.toLocaleString()}
        icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Resolution rate"
        value={hasConversations ? formatPct(kpis.resolutionRate) : "—"}
        hint="Without escalation"
        icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Avg confidence"
        value={formatPct(kpis.avgConfidence)}
        icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="CSAT score"
        value={formatPct(kpis.csatScore)}
        hint={kpis.csatScore === null ? "No ratings yet" : "Rated responses"}
        icon={<Smile className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Avg response"
        value={formatSeconds(kpis.avgResponseMs)}
        icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Deflected"
        value={kpis.deflectedCount.toLocaleString()}
        hint={hasConversations ? `${formatPct(1 - kpis.fallbackRate)} answered` : undefined}
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
      />
    </div>
  );
}
