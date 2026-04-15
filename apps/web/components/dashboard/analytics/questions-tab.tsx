"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, AlertTriangle, ListOrdered } from "lucide-react";
import type { QuestionAnalytics } from "@/lib/analytics/types";

export function QuestionsTab() {
  const [data, setData] = useState<QuestionAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/questions");
        if (!res.ok) throw new Error("Failed");
        const json = (await res.json()) as QuestionAnalytics;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.error("Failed to load question analytics");
          setData({ top: [], trending: [], lowConfidence: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListOrdered className="h-4 w-4 text-primary" aria-hidden="true" />
            Top questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ol className="flex flex-col divide-y">
              {data.top.map((q, i) => (
                <li
                  key={`${i}-${q.question}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground">
                      {i + 1}.
                    </span>
                    <span className="line-clamp-2">{q.question}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {q.count}
                  </Badge>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            Trending this week
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.trending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No trending topics right now.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.trending.map((q, i) => (
                <li
                  key={`${i}-${q.question}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="line-clamp-2 min-w-0">{q.question}</span>
                  <span className="shrink-0 text-xs font-medium text-primary">
                    +{q.changePct >= 999 ? "New" : `${q.changePct}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle
              className="h-4 w-4 text-destructive"
              aria-hidden="true"
            />
            Low-confidence answers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.lowConfidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No low-confidence responses in the period.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.lowConfidence.map((q, i) => (
                <li
                  key={`${i}-${q.question}`}
                  className="flex flex-col gap-1 py-2 text-sm"
                >
                  <span className="line-clamp-2">{q.question}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{Math.round(q.avgConfidence * 100)}% confidence</span>
                    <span>•</span>
                    <span>{q.count} times</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
