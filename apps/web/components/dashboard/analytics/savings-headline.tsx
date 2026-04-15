import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface SavingsHeadlineProps {
  deflectedCount: number;
  totalSavedCents: number;
  costPerTicketCents: number;
  rangeLabel: string;
}

function formatCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(1)}k`;
  }
  return `$${dollars.toFixed(0)}`;
}

export function SavingsHeadline({
  deflectedCount,
  totalSavedCents,
  costPerTicketCents,
  rangeLabel,
}: SavingsHeadlineProps) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="flex flex-col gap-2 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {rangeLabel}
            </p>
            <h2 className="text-3xl font-semibold leading-tight md:text-4xl">
              BizAssist saved you{" "}
              <span className="text-primary">{formatCurrency(totalSavedCents)}</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {deflectedCount.toLocaleString()} conversations handled without a human agent.
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground md:max-w-[180px]">
          <p>
            Based on{" "}
            <span className="font-medium text-foreground">
              ${(costPerTicketCents / 100).toFixed(2)}
            </span>{" "}
            per support ticket.
          </p>
          <p className="mt-1">Adjust in Settings.</p>
        </div>
      </CardContent>
    </Card>
  );
}
