"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Check,
  X,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RefreshSchedule, ChangeSeverity, ChangeApproval, KnowledgeItem, SectionDiff } from "@bizassist/types";

// ---- Types ----

interface ChangeEntry {
  id: string;
  knowledgeItemId: string;
  severity: ChangeSeverity;
  approval: ChangeApproval;
  newContent: string;
  newTitle: string | null;
  diffSummary: string | null;
  sectionsAdded: number;
  sectionsRemoved: number;
  sectionsModified: number;
  diffDetails: SectionDiff[];
  createdAt: string;
}

interface FreshnessPanelProps {
  tenantId: string;
  knowledgeItems: KnowledgeItem[];
}

// ---- Staleness helpers ----

function getStalenessLevel(item: KnowledgeItem): "fresh" | "aging" | "stale" | "unavailable" | "none" {
  if (item.refreshStatus === "source_unavailable") return "unavailable";
  if (item.type !== "url" || item.refreshSchedule === "manual") return "none";
  if (!item.lastRefreshedAt) return "stale";

  const daysSince = Math.floor((Date.now() - new Date(item.lastRefreshedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (daysSince <= 3) return "fresh";
  if (daysSince <= 14) return "aging";
  return "stale";
}

function getStalenessConfig(level: string) {
  switch (level) {
    case "fresh": return { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/30", label: "Fresh" };
    case "aging": return { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100 dark:bg-yellow-900/30", label: "Aging" };
    case "stale": return { icon: AlertTriangle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", label: "Stale" };
    case "unavailable": return { icon: XCircle, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30", label: "Unavailable" };
    default: return { icon: Clock, color: "text-muted-foreground", bg: "bg-muted", label: "Manual" };
  }
}

// ---- Hook ----

function useFreshnessPanel(tenantId: string) {
  const [pendingChanges, setPendingChanges] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingDiff, setViewingDiff] = useState<ChangeEntry | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const fetchPendingChanges = useCallback(async () => {
    try {
      const res = await fetch(`/api/knowledge/changes?tenantId=${tenantId}`);
      if (res.ok) setPendingChanges(await res.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchPendingChanges(); }, [fetchPendingChanges]);

  async function handleApprove(changeId: string) {
    const res = await fetch("/api/knowledge/changes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId, tenantId, action: "approve" }),
    });
    if (res.ok) {
      toast.success("Change approved and applied");
      setViewingDiff(null);
      fetchPendingChanges();
    }
  }

  async function handleReject(changeId: string) {
    const res = await fetch("/api/knowledge/changes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId, tenantId, action: "reject" }),
    });
    if (res.ok) {
      toast.success("Change rejected");
      setViewingDiff(null);
      fetchPendingChanges();
    }
  }

  async function handleManualRefresh(itemId: string) {
    setRefreshing(itemId);
    try {
      const res = await fetch("/api/knowledge/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeItemId: itemId }),
      });
      const data = await res.json();
      if (data.status === "unchanged") toast.success("Content is up to date");
      else if (data.status === "auto_approved") toast.success("Minor changes applied automatically");
      else if (data.status === "pending_review") toast.info("Major changes detected — review required");
      else if (data.status === "error") toast.error(data.error ?? "Refresh failed");
      fetchPendingChanges();
    } finally {
      setRefreshing(null);
    }
  }

  async function handleScheduleChange(itemId: string, schedule: string) {
    const res = await fetch("/api/knowledge/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeItemId: itemId, tenantId, schedule }),
    });
    if (res.ok) toast.success("Schedule updated");
  }

  return {
    pendingChanges, loading, viewingDiff, refreshing,
    setViewingDiff, handleApprove, handleReject,
    handleManualRefresh, handleScheduleChange,
  };
}

// ---- Component ----

export function FreshnessPanel({ tenantId, knowledgeItems }: FreshnessPanelProps) {
  const p = useFreshnessPanel(tenantId);

  // Diff viewer
  if (p.viewingDiff) {
    return <DiffViewer change={p.viewingDiff} onApprove={p.handleApprove} onReject={p.handleReject} onBack={() => p.setViewingDiff(null)} />;
  }

  // Calculate health score
  const urlItems = knowledgeItems.filter((i) => i.type === "url" && i.refreshSchedule !== "manual");
  const freshCount = urlItems.filter((i) => getStalenessLevel(i) === "fresh").length;
  const healthScore = urlItems.length > 0 ? Math.round((freshCount / urlItems.length) * 100) : 100;

  return (
    <div className="space-y-4">
      {/* Health score + pending count */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{healthScore}%</p>
            <p className="text-xs text-muted-foreground">Knowledge Freshness</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{p.pendingChanges.length}</p>
            <p className="text-xs text-muted-foreground">Pending Reviews</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{urlItems.filter((i) => getStalenessLevel(i) === "stale").length}</p>
            <p className="text-xs text-muted-foreground">Stale Items</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending changes queue */}
      {p.pendingChanges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="size-4 text-yellow-600" />
              Pending Reviews ({p.pendingChanges.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.pendingChanges.map((change) => {
              const item = knowledgeItems.find((i) => i.id === change.knowledgeItemId);
              return (
                <div key={change.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item?.title ?? "Unknown item"}</p>
                    <p className="text-xs text-muted-foreground">{change.diffSummary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <SeverityBadge severity={change.severity} />
                      <span className="text-[10px] text-muted-foreground">
                        +{change.sectionsAdded} -{change.sectionsRemoved} ~{change.sectionsModified}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => p.setViewingDiff(change)} aria-label="View diff">
                      <Eye className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => p.handleApprove(change.id)} className="text-green-600" aria-label="Approve">
                      <Check className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => p.handleReject(change.id)} className="text-red-600" aria-label="Reject">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Knowledge items freshness list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Knowledge Freshness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {knowledgeItems.filter((i) => i.type === "url").map((item) => {
            const level = getStalenessLevel(item);
            const cfg = getStalenessConfig(level);
            const Icon = cfg.icon;
            const daysSince = item.lastRefreshedAt
              ? Math.floor((Date.now() - new Date(item.lastRefreshedAt).getTime()) / (24 * 60 * 60 * 1000))
              : null;

            return (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Icon className={`size-4 ${cfg.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{daysSince !== null ? `Refreshed ${daysSince}d ago` : "Never refreshed"}</span>
                    {item.lastRefreshError && (
                      <span className="text-destructive truncate">{item.lastRefreshError}</span>
                    )}
                  </div>
                </div>
                <Select
                  value={item.refreshSchedule}
                  onValueChange={(v: string | null) => { if (v) p.handleScheduleChange(item.id, v); }}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => p.handleManualRefresh(item.id)}
                  disabled={p.refreshing === item.id}
                  aria-label="Refresh now"
                >
                  {p.refreshing === item.id
                    ? <Loader2 className="size-3.5 animate-spin" />
                    : <RefreshCw className="size-3.5" />}
                </Button>
              </div>
            );
          })}
          {knowledgeItems.filter((i) => i.type === "url").length === 0 && (
            <p className="text-sm text-muted-foreground text-center p-4">
              No URL-based knowledge items. Add URLs to enable automatic freshness monitoring.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Diff Viewer ----

function DiffViewer({
  change,
  onApprove,
  onReject,
  onBack,
}: {
  change: ChangeEntry;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="size-3.5" /> Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Change Review</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onApprove(change.id)} className="gap-1 bg-green-600 hover:bg-green-700">
                <Check className="size-3.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onReject(change.id)} className="gap-1">
                <X className="size-3.5" /> Reject
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <SeverityBadge severity={change.severity} />
            <span className="text-sm text-muted-foreground">{change.diffSummary}</span>
          </div>

          <div className="space-y-3">
            {change.diffDetails.map((section, i) => (
              <div key={i} className="rounded-lg border overflow-hidden">
                <div className={`px-3 py-1.5 text-xs font-medium ${
                  section.type === "added" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" :
                  section.type === "removed" ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" :
                  "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                }`}>
                  {section.type === "added" ? "Added" : section.type === "removed" ? "Removed" : "Modified"}
                  {section.heading && ` — ${section.heading}`}
                  {section.similarity !== null && ` (${Math.round(section.similarity * 100)}% similar)`}
                </div>
                <div className="grid grid-cols-2 divide-x text-xs">
                  <div className="p-3">
                    <p className="font-medium text-muted-foreground mb-1">Old</p>
                    <pre className="whitespace-pre-wrap text-[11px]">{section.oldText ?? "(none)"}</pre>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-muted-foreground mb-1">New</p>
                    <pre className="whitespace-pre-wrap text-[11px]">{section.newText ?? "(none)"}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Helpers ----

function SeverityBadge({ severity }: { severity: ChangeSeverity }) {
  const config: Record<ChangeSeverity, { label: string; variant: "default" | "secondary" | "destructive" }> = {
    none: { label: "None", variant: "secondary" },
    minor: { label: "Minor", variant: "secondary" },
    major: { label: "Major", variant: "destructive" },
  };
  const { label, variant } = config[severity];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}
