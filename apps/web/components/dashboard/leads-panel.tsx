"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  Globe,
  Clock,
  Download,
  Eye,
  ArrowLeft,
  Tag,
  User,
  MessageSquare,
  FileText,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeadIntent, LeadStatus } from "@bizassist/types";

// ---- Types ----

interface LeadRow {
  id: string;
  visitorId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  intent: LeadIntent;
  status: LeadStatus;
  tags: string[];
  sourceUrl: string | null;
  sourceTrigger: string | null;
  totalPageViews: number;
  totalConversations: number;
  totalMessages: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
}

interface LeadEventRow {
  id: string;
  eventType: string;
  data: Record<string, string | number | boolean | null>;
  pageUrl: string | null;
  createdAt: string;
}

interface LeadsPanelProps {
  tenantId: string;
}

// ---- Hook ----

function useLeadsPanel(tenantId: string) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [events, setEvents] = useState<LeadEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads?tenantId=${tenantId}`);
      if (res.ok) {
        setLeads(await res.json());
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  function handleSelectLead(lead: LeadRow) {
    setSelectedLead(lead);
    setEventsLoading(true);
    fetch(`/api/leads/${lead.id}`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events ?? []);
      })
      .finally(() => setEventsLoading(false));
  }

  function handleBackToList() {
    setSelectedLead(null);
    setEvents([]);
  }

  async function handleStatusChange(leadId: string, status: string) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      toast.success("Lead status updated");
      fetchLeads();
      if (selectedLead?.id === leadId) {
        setSelectedLead({ ...selectedLead, status: status as LeadStatus });
      }
    }
  }

  function handleFilterChange(value: string | null) {
    if (value) setFilter(value);
  }

  function handleExportCsv() {
    const filtered = getFilteredLeads();
    const headers = ["Name", "Email", "Phone", "Intent", "Status", "Source", "Page Views", "Conversations", "First Seen", "Last Seen"];
    const rows = filtered.map((l) => [
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      l.intent,
      l.status,
      l.sourceUrl ?? "",
      l.totalPageViews,
      l.totalConversations,
      new Date(l.firstSeenAt).toLocaleDateString(),
      new Date(l.lastSeenAt).toLocaleDateString(),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }

  function getFilteredLeads() {
    if (filter === "all") return leads;
    if (filter === "high" || filter === "medium" || filter === "low") {
      return leads.filter((l) => l.intent === filter);
    }
    return leads.filter((l) => l.status === filter);
  }

  return {
    leads, loading, selectedLead, events, eventsLoading, filter,
    getFilteredLeads, handleSelectLead, handleBackToList,
    handleStatusChange, handleFilterChange, handleExportCsv,
  };
}

// ---- Component ----

export function LeadsPanel({ tenantId }: LeadsPanelProps) {
  const p = useLeadsPanel(tenantId);

  if (p.selectedLead) {
    return (
      <LeadDetail
        lead={p.selectedLead}
        events={p.events}
        eventsLoading={p.eventsLoading}
        onBack={p.handleBackToList}
        onStatusChange={p.handleStatusChange}
      />
    );
  }

  const filtered = p.getFilteredLeads();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={p.filter} onValueChange={p.handleFilterChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="high">High Intent</SelectItem>
              <SelectItem value="medium">Medium Intent</SelectItem>
              <SelectItem value="low">Low Intent</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="qualified">Qualified</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={p.handleExportCsv} disabled={filtered.length === 0} className="gap-1.5">
          <Download className="size-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Lead list */}
      {p.loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <User className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {p.leads.length === 0
                ? "No leads captured yet. Configure engagement rules to start capturing leads."
                : "No leads match the current filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => p.handleSelectLead(lead)}
              className="w-full text-left rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">
                      {lead.name ?? lead.email ?? `Visitor ${lead.visitorId.slice(0, 8)}`}
                    </span>
                    <IntentBadge intent={lead.intent} />
                    <StatusBadge status={lead.status} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {lead.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" /> {lead.email}
                      </span>
                    )}
                    {lead.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {lead.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="size-3" /> {lead.totalPageViews} views
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-3" /> {lead.totalConversations} chats
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatTimeAgo(lead.lastSeenAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Lead Detail ----

function LeadDetail({
  lead,
  events,
  eventsLoading,
  onBack,
  onStatusChange,
}: {
  lead: LeadRow;
  events: LeadEventRow[];
  eventsLoading: boolean;
  onBack: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  function handleStatusChange(value: string | null) {
    if (value) onStatusChange(lead.id, value);
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="size-3.5" />
        Back to leads
      </Button>

      {/* Lead info card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" />
              {lead.name ?? lead.email ?? `Visitor ${lead.visitorId.slice(0, 8)}`}
            </CardTitle>
            <div className="flex items-center gap-2">
              <IntentBadge intent={lead.intent} />
              <Select value={lead.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {lead.email && (
              <div className="flex items-center gap-2">
                <Mail className="size-3.5 text-muted-foreground" />
                {lead.email}
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 text-muted-foreground" />
                {lead.phone}
              </div>
            )}
            {lead.sourceUrl && (
              <div className="flex items-center gap-2 truncate">
                <Globe className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{lead.sourceUrl}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 text-muted-foreground" />
              First seen: {new Date(lead.firstSeenAt).toLocaleDateString()}
            </div>
          </div>

          {lead.tags.length > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              <Tag className="size-3 text-muted-foreground" />
              {lead.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3 mt-4 pt-4 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold">{lead.totalPageViews}</p>
              <p className="text-xs text-muted-foreground">Page Views</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{lead.totalConversations}</p>
              <p className="text-xs text-muted-foreground">Conversations</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{lead.totalMessages}</p>
              <p className="text-xs text-muted-foreground">Messages</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4" />
            Timeline ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center p-4">No events recorded.</p>
          ) : (
            <ol className="relative border-l border-muted ml-3 space-y-4">
              {events.map((event) => (
                <li key={event.id} className="ml-6">
                  <div className="absolute -left-2 mt-1.5 size-4 rounded-full border-2 border-background bg-muted" />
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium">{eventLabel(event.eventType)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {event.pageUrl && (
                    <p className="text-xs text-muted-foreground truncate">{event.pageUrl}</p>
                  )}
                  {event.data && Object.keys(event.data).length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {Object.entries(event.data).map(([k, v]) => (
                        <span key={k} className="mr-2">
                          {k}: <span className="font-medium">{String(v)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Helpers ----

function IntentBadge({ intent }: { intent: LeadIntent }) {
  const config: Record<LeadIntent, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    high: { label: "High Intent", variant: "default" },
    medium: { label: "Medium", variant: "secondary" },
    low: { label: "Low", variant: "outline" },
    unknown: { label: "Unknown", variant: "outline" },
  };
  const { label, variant } = config[intent];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const config: Record<LeadStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    new: { label: "New", variant: "default" },
    contacted: { label: "Contacted", variant: "secondary" },
    qualified: { label: "Qualified", variant: "secondary" },
    converted: { label: "Converted", variant: "default" },
    lost: { label: "Lost", variant: "outline" },
  };
  const { label, variant } = config[status];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    page_view: "Viewed page",
    chat_started: "Started chat",
    message_sent: "Sent message",
    email_collected: "Email collected",
    phone_collected: "Phone collected",
    lead_created: "Lead created",
    qualified: "Qualified",
    trigger_fired: "Trigger fired",
    dismissed: "Dismissed",
  };
  return labels[type] ?? type;
}

function formatTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
