"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { SourceAnalytics } from "@/lib/analytics/types";

export function SourcesTab() {
  const [data, setData] = useState<SourceAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics/sources");
        if (!res.ok) throw new Error("Failed");
        const json = (await res.json()) as SourceAnalytics;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.error("Failed to load source analytics");
          setData({ items: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (data.items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No source usage data yet. Once customers chat, this table will rank
          your knowledge items by how often they power a successful response.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Knowledge items by effectiveness</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Uses</TableHead>
              <TableHead className="text-right">Confidence</TableHead>
              <TableHead className="text-right">Feedback</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => {
              const confidencePct =
                item.avgConfidenceWhenUsed !== null
                  ? Math.round(item.avgConfidenceWhenUsed * 100)
                  : null;
              return (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[260px] truncate font-medium">
                    {item.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {item.type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {item.usageCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {confidencePct !== null ? `${confidencePct}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-primary">{item.positiveFeedback}↑</span>
                    <span className="mx-1 text-muted-foreground">/</span>
                    <span className="text-destructive">
                      {item.negativeFeedback}↓
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
