import type { AnalyticsOverview } from "@/lib/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SavingsHeadline } from "./savings-headline";
import { KpiCards } from "./kpi-cards";
import {
  VolumeTrendChart,
  ConfidenceTrendChart,
  CsatTrendChart,
  ConversationLengthHistogram,
} from "./trend-charts";

interface OverviewTabProps {
  overview: AnalyticsOverview;
}

export function OverviewTab({ overview }: OverviewTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <SavingsHeadline
        deflectedCount={overview.savings.deflectedCount}
        totalSavedCents={overview.savings.totalSavedCents}
        costPerTicketCents={overview.savings.costPerTicketCents}
        rangeLabel={overview.savings.rangeLabel}
      />

      <KpiCards kpis={overview.kpis} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VolumeTrendChart data={overview.trends.volume} />
        <ConfidenceTrendChart data={overview.trends.confidence} />
        <CsatTrendChart data={overview.trends.csat} />
        <ConversationLengthHistogram data={overview.trends.lengthHistogram} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Top questions this period</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.topQuestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No questions yet in this range.
            </p>
          ) : (
            <ol className="flex flex-col divide-y">
              {overview.topQuestions.map((q, i) => (
                <li
                  key={`${i}-${q.question}`}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="truncate">{q.question}</span>
                  </span>
                  <span className="ml-4 shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                    {q.count}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
