"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Clock,
  User,
  Shield,
  MessageSquare,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { EscalationTrigger, EscalationStatus, Message } from "@bizassist/types";

// ---- Types ----

interface EscalationItem {
  id: string;
  tenantId: string;
  conversationId: string;
  assistantId: string;
  trigger: EscalationTrigger;
  mode: string;
  status: EscalationStatus;
  summary: string | null;
  customerEmail: string | null;
  customerName: string | null;
  confidenceAtEscalation: string | null;
  createdAt: string;
  assignedAt: string | null;
}

interface AgentQueueProps {
  tenantId: string;
}

// ---- Hook ----

function useAgentQueue(tenantId: string) {
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchEscalations = useCallback(async () => {
    try {
      const res = await fetch(`/api/escalations?tenantId=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setEscalations(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchEscalations();
    const interval = setInterval(fetchEscalations, 10000);
    return () => clearInterval(interval);
  }, [fetchEscalations]);

  // Load messages when an escalation is selected
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    fetch(`/api/escalations/${selectedId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) {
          setMessages(data.messages.map((m: Message & { createdAt: string }) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })));
        }
      })
      .finally(() => setMessagesLoading(false));
  }, [selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setReplyText("");
  }

  async function handleAccept(id: string) {
    const res = await fetch(`/api/escalations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      toast.success("Escalation accepted");
      fetchEscalations();
    } else {
      toast.error("Failed to accept");
    }
  }

  async function handleResolve(id: string) {
    const res = await fetch(`/api/escalations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resolve" }),
    });
    if (res.ok) {
      toast.success("Escalation resolved");
      setSelectedId(null);
      fetchEscalations();
    } else {
      toast.error("Failed to resolve");
    }
  }

  async function handleSendReply() {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/escalations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim(), sender: "agent" }),
      });
      if (res.ok) {
        setReplyText("");
        // Refresh messages
        const detailRes = await fetch(`/api/escalations/${selectedId}`);
        const data = await detailRes.json();
        if (data.messages) {
          setMessages(data.messages.map((m: Message & { createdAt: string }) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })));
        }
      } else {
        toast.error("Failed to send message");
      }
    } finally {
      setSending(false);
    }
  }

  function handleReplyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setReplyText(e.target.value);
  }

  function handleReplyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  return {
    escalations, loading, selectedId, messages, messagesLoading,
    replyText, sending,
    handleSelect, handleAccept, handleResolve,
    handleSendReply, handleReplyChange, handleReplyKeyDown,
  };
}

// ---- Component ----

export function AgentQueue({ tenantId }: AgentQueueProps) {
  const q = useAgentQueue(tenantId);
  const selected = q.escalations.find((e) => e.id === q.selectedId);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "380px 1fr" }}>
      {/* Queue List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertCircle className="size-4" />
            Escalation Queue ({q.escalations.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          {q.loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : q.escalations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">
              No pending escalations. All conversations are handled by the bot.
            </p>
          ) : (
            <nav aria-label="Escalation queue" className="flex flex-col gap-1">
              {q.escalations.map((esc) => (
                <button
                  key={esc.id}
                  type="button"
                  onClick={() => q.handleSelect(esc.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    q.selectedId === esc.id
                      ? "bg-accent border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <TriggerBadge trigger={esc.trigger} />
                    <StatusBadge status={esc.status} />
                  </div>
                  {esc.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {esc.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatTimeAgo(esc.createdAt)}
                    {esc.customerName && (
                      <>
                        <User className="size-3 ml-1" />
                        {esc.customerName}
                      </>
                    )}
                  </div>
                </button>
              ))}
            </nav>
          )}
        </CardContent>
      </Card>

      {/* Conversation Panel + Context */}
      {selected ? (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm">
                Escalation: {triggerLabel(selected.trigger)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {selected.customerEmail ?? "Anonymous customer"}
                {selected.confidenceAtEscalation && ` — ${Math.round(parseFloat(selected.confidenceAtEscalation) * 100)}% confidence`}
              </p>
            </div>
            <div className="flex gap-2">
              {selected.status === "pending" && (
                <Button size="sm" onClick={() => q.handleAccept(selected.id)}>
                  Accept
                </Button>
              )}
              {(selected.status === "active" || selected.status === "assigned") && (
                <Button size="sm" variant="outline" onClick={() => q.handleResolve(selected.id)}>
                  <CheckCircle className="size-3.5 mr-1" />
                  Resolve
                </Button>
              )}
            </div>
          </div>

          {/* Context summary */}
          {selected.summary && (
            <Card>
              <CardContent className="p-3">
                <p className="text-sm">{selected.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Messages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <MessageSquare className="size-4" />
                Conversation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] overflow-y-auto space-y-3 mb-4">
                {q.messagesLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : q.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center p-4">
                    No messages yet.
                  </p>
                ) : (
                  q.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col gap-0.5 ${
                        msg.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : msg.sender === "agent"
                              ? "bg-blue-100 dark:bg-blue-900/30 rounded-bl-md"
                              : "bg-muted rounded-bl-md"
                        }`}
                      >
                        {msg.sender === "agent" && (
                          <Badge variant="secondary" className="text-[10px] mb-1">
                            Team
                          </Badge>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">
                        {msg.sender === "customer" ? "Customer" : msg.sender === "agent" ? "Agent" : "Bot"}
                        {msg.confidence !== null && msg.sender === "bot" && ` (${Math.round(msg.confidence * 100)}%)`}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Reply box — only for active escalations */}
              {(selected.status === "active" || selected.status === "assigned") && (
                <div className="flex gap-2">
                  <Textarea
                    value={q.replyText}
                    onChange={q.handleReplyChange}
                    onKeyDown={q.handleReplyKeyDown}
                    placeholder="Type a reply... (Enter to send)"
                    rows={2}
                    className="resize-none"
                  />
                  <Button
                    onClick={q.handleSendReply}
                    disabled={q.sending || !q.replyText.trim()}
                    className="shrink-0"
                  >
                    {q.sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-[500px]">
            <p className="text-sm text-muted-foreground">
              Select an escalation from the queue to view details
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Helper components ----

function TriggerBadge({ trigger }: { trigger: EscalationTrigger }) {
  const config: Record<EscalationTrigger, { label: string; icon: typeof AlertCircle }> = {
    explicit_request: { label: "Human requested", icon: User },
    low_confidence: { label: "Low confidence", icon: AlertCircle },
    repeat_failure: { label: "Repeat failure", icon: AlertCircle },
    safety: { label: "Safety", icon: Shield },
    sentiment: { label: "Sentiment", icon: AlertCircle },
  };

  const { label, icon: Icon } = config[trigger] ?? config.low_confidence;

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: EscalationStatus }) {
  const variants: Record<EscalationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "destructive" },
    assigned: { label: "Assigned", variant: "secondary" },
    active: { label: "Active", variant: "default" },
    resolved: { label: "Resolved", variant: "outline" },
    expired: { label: "Expired", variant: "outline" },
  };

  const { label, variant } = variants[status] ?? variants.pending;

  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case "explicit_request": return "Customer requested agent";
    case "low_confidence": return "Low confidence";
    case "repeat_failure": return "Repeated failures";
    case "safety": return "Safety event";
    case "sentiment": return "Negative sentiment";
    default: return "Escalation";
  }
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
