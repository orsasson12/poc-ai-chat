"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Sparkles, X, CheckCheck } from "lucide-react";
import type {
  KnowledgeGapDetail,
  KnowledgeGapSummary,
} from "@/lib/analytics/types";

interface GapsTabProps {
  assistantId: string | null;
}

export function GapsTab({ assistantId }: GapsTabProps) {
  const [gaps, setGaps] = useState<KnowledgeGapSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeGapDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadGaps = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/gaps?status=open");
      if (!res.ok) throw new Error("Failed to load gaps");
      const data = await res.json();
      setGaps(data.clusters ?? []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load knowledge gaps");
      setGaps([]);
    }
  }, []);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/analytics/gaps/${id}`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as KnowledgeGapDetail;
      setDetail(data);
      if (!data.suggestedAnswer) {
        setSuggestLoading(true);
        try {
          const sres = await fetch(`/api/analytics/gaps/${id}/suggest`, {
            method: "POST",
          });
          if (sres.ok) {
            const s = await sres.json();
            setDetail((cur) =>
              cur
                ? {
                    ...cur,
                    suggestedQuestion: s.suggestedQuestion ?? cur.suggestedQuestion,
                    suggestedAnswer: s.suggestedAnswer ?? cur.suggestedAnswer,
                  }
                : cur,
            );
          }
        } finally {
          setSuggestLoading(false);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load cluster details");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  const handleAddToKnowledge = useCallback(async () => {
    if (!detail || !selectedId) return;
    if (!assistantId) {
      toast.error("No assistant configured — cannot add knowledge");
      return;
    }
    const question = detail.suggestedQuestion ?? detail.representativeQuestion;
    const answer = detail.suggestedAnswer ?? "";
    if (!question || !answer) {
      toast.error("Suggestion not ready yet");
      return;
    }
    setActionLoading("add");
    try {
      const ingestRes = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          type: "manual_qa",
          title: question.slice(0, 200),
          content: `Q: ${question}\nA: ${answer}`,
        }),
      });
      if (!ingestRes.ok) throw new Error("Ingest failed");
      const ingestData = await ingestRes.json();

      await fetch(`/api/analytics/gaps/${selectedId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          knowledgeItemId: ingestData.id ?? null,
        }),
      });

      toast.success("Added to knowledge base");
      closeDetail();
      loadGaps();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add to knowledge base");
    } finally {
      setActionLoading(null);
    }
  }, [detail, selectedId, assistantId, closeDetail, loadGaps]);

  const handleDismiss = useCallback(async () => {
    if (!selectedId) return;
    setActionLoading("dismiss");
    try {
      await fetch(`/api/analytics/gaps/${selectedId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      toast.success("Gap dismissed");
      closeDetail();
      loadGaps();
    } catch (err) {
      console.error(err);
      toast.error("Failed to dismiss");
    } finally {
      setActionLoading(null);
    }
  }, [selectedId, closeDetail, loadGaps]);

  if (gaps === null) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (gaps.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No knowledge gaps detected — your bot is answering with confidence.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Gaps are detected from low-confidence or fallback responses and
            clustered by topic. Run the Recompute button in Settings to refresh.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {gaps.map((gap) => (
          <button
            key={gap.id}
            type="button"
            onClick={() => openDetail(gap.id)}
            className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{gap.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {gap.representativeQuestion}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {gap.questionCount}{" "}
                {gap.questionCount === 1 ? "question" : "questions"}
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              {gap.avgConfidence !== null && (
                <span>Avg confidence: {Math.round(gap.avgConfidence * 100)}%</span>
              )}
              <span>Last seen: {new Date(gap.lastSeenAt).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && closeDetail()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.label ?? "Loading…"}</SheetTitle>
            <SheetDescription>
              {detail
                ? `${detail.questionCount} questions in this cluster`
                : "Fetching cluster details"}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex flex-col gap-6">
            {detailLoading && !detail && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {detail && (
              <>
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Suggested Q&amp;A
                  </h4>
                  {suggestLoading && !detail.suggestedAnswer ? (
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <p className="text-sm font-medium">
                        {detail.suggestedQuestion ?? detail.representativeQuestion}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {detail.suggestedAnswer ??
                          "Waiting for suggestion — this may take a few seconds."}
                      </p>
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Customer questions ({detail.questions.length})
                  </h4>
                  <ul className="flex flex-col divide-y rounded-lg border bg-card">
                    {detail.questions.map((q) => (
                      <li key={q.messageId} className="px-3 py-2 text-sm">
                        <p className="line-clamp-2">{q.text}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(q.createdAt).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>

          <SheetFooter className="mt-6 flex-row gap-2 sm:justify-end">
            <Button
              variant="ghost"
              onClick={handleDismiss}
              disabled={actionLoading !== null}
            >
              <X className="mr-2 h-4 w-4" aria-hidden="true" />
              Dismiss
            </Button>
            <Button
              onClick={handleAddToKnowledge}
              disabled={
                actionLoading !== null ||
                !detail?.suggestedAnswer ||
                suggestLoading
              }
            >
              <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              {actionLoading === "add" ? "Adding…" : "Add to knowledge base"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
