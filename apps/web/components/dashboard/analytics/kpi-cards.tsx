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

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Kpi
        label="Total conversations"
        value={kpis.totalConversations.toLocaleString()}
        icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Resolution rate"
        value={formatPct(kpis.resolutionRate)}
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
        hint="Rated responses"
        icon={<Smile className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Avg response"
        value={`${(kpis.avgResponseMs / 1000).toFixed(1)}s`}
        icon={<Clock className="h-4 w-4" aria-hidden="true" />}
      />
      <Kpi
        label="Deflected"
        value={kpis.deflectedCount.toLocaleString()}
        hint={`${formatPct(1 - kpis.fallbackRate)} answered`}
        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
      />
    </div>
  );
}
