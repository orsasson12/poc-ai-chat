"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Clock,
  ArrowDown,
  LogOut,
  RotateCcw,
  Globe,
  Eye,
  MessageSquare,
  Users,
  Loader2,
  GripVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EngagementTrigger, MessageCta, MessageButton } from "@bizassist/types";

// ---- Types ----

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: EngagementTrigger;
  delaySeconds: number | null;
  scrollPercent: number | null;
  urlPattern: string | null;
  proactiveMessage: string;
  qualifyingQuestions: string[] | null;
  priority: number;
  impressions: number;
  engagements: number;
  leadsGenerated: number;
}

interface EngagementRulesBuilderProps {
  assistantId: string;
}

const TRIGGER_CONFIG: Record<EngagementTrigger, { label: string; icon: typeof Clock; description: string }> = {
  time_on_page: { label: "Time on Page", icon: Clock, description: "Trigger after visitor spends X seconds on the page" },
  scroll_depth: { label: "Scroll Depth", icon: ArrowDown, description: "Trigger when visitor scrolls past X% of the page" },
  exit_intent: { label: "Exit Intent", icon: LogOut, description: "Trigger when cursor moves toward browser close (desktop only)" },
  return_visitor: { label: "Return Visitor", icon: RotateCcw, description: "Trigger for visitors who have been to the site before" },
  url_pattern: { label: "URL Pattern", icon: Globe, description: "Trigger on specific pages matching a URL pattern" },
};

// ---- Hook ----

function useRulesBuilder(assistantId: string) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState<EngagementTrigger>("time_on_page");
  const [newMessage, setNewMessage] = useState("");
  const [newDelay, setNewDelay] = useState(15);
  const [newScroll, setNewScroll] = useState(50);
  const [newUrlPattern, setNewUrlPattern] = useState("");
  const [newQuestions, setNewQuestions] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState(100);
  const [newMaxPerSession, setNewMaxPerSession] = useState(0);
  const [newMaxPerVisitor, setNewMaxPerVisitor] = useState(0);
  const [newCooldownSeconds, setNewCooldownSeconds] = useState(0);
  const [newMessageImage, setNewMessageImage] = useState("");
  const [newCtaLabel, setNewCtaLabel] = useState("");
  const [newCtaUrl, setNewCtaUrl] = useState("");
  const [newButtons, setNewButtons] = useState<MessageButton[]>([]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`/api/engagement-rules?assistantId=${assistantId}`);
      if (res.ok) setRules(await res.json());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [assistantId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  function resetCreateForm() {
    setNewName("");
    setNewTrigger("time_on_page");
    setNewMessage("");
    setNewDelay(15);
    setNewScroll(50);
    setNewUrlPattern("");
    setNewQuestions([]);
    setNewPriority(100);
    setNewMaxPerSession(0);
    setNewMaxPerVisitor(0);
    setNewCooldownSeconds(0);
    setNewMessageImage("");
    setNewCtaLabel("");
    setNewCtaUrl("");
    setNewButtons([]);
    setShowCreate(false);
  }

  async function handleCreate() {
    if (!newName.trim() || !newMessage.trim()) {
      toast.error("Name and message are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/engagement-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          name: newName,
          trigger: newTrigger,
          proactiveMessage: newMessage,
          delaySeconds: newDelay,
          scrollPercent: newScroll,
          urlPattern: newUrlPattern || undefined,
          qualifyingQuestions: newQuestions.filter((q) => q.trim()),
          priority: newPriority,
          maxPerSession: newMaxPerSession,
          maxPerVisitor: newMaxPerVisitor,
          cooldownSeconds: newCooldownSeconds,
          messageImage: newMessageImage.trim() || null,
          messageCta:
            newCtaLabel.trim() && newCtaUrl.trim()
              ? ({ label: newCtaLabel.trim(), url: newCtaUrl.trim() } satisfies MessageCta)
              : null,
          messageButtons: newButtons.filter((btn) => btn.label.trim() && btn.url.trim()),
        }),
      });
      if (res.ok) {
        toast.success("Rule created");
        resetCreateForm();
        fetchRules();
      } else {
        toast.error("Failed to create rule");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(rule: RuleRow) {
    const res = await fetch("/api/engagement-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
    });
    if (res.ok) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    }
  }

  async function handleDelete(ruleId: string) {
    const res = await fetch("/api/engagement-rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ruleId }),
    });
    if (res.ok) {
      toast.success("Rule deleted");
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    }
  }

  function handleNewNameChange(e: React.ChangeEvent<HTMLInputElement>) { setNewName(e.target.value); }
  function handleNewMessageChange(e: React.ChangeEvent<HTMLTextAreaElement>) { setNewMessage(e.target.value); }
  function handleNewDelayChange(e: React.ChangeEvent<HTMLInputElement>) { setNewDelay(parseInt(e.target.value) || 15); }
  function handleNewScrollChange(e: React.ChangeEvent<HTMLInputElement>) { setNewScroll(parseInt(e.target.value) || 50); }
  function handleNewUrlPatternChange(e: React.ChangeEvent<HTMLInputElement>) { setNewUrlPattern(e.target.value); }
  function handleNewTriggerChange(v: string | null) { if (v) setNewTrigger(v as EngagementTrigger); }
  function handleShowCreate() { setShowCreate(true); }
  function handleCancelCreate() { resetCreateForm(); }

  function handleAddQuestion() {
    if (newQuestions.length < 5) setNewQuestions([...newQuestions, ""]);
  }
  function handleQuestionChange(idx: number, value: string) {
    setNewQuestions((prev) => prev.map((q, i) => i === idx ? value : q));
  }
  function handleRemoveQuestion(idx: number) {
    setNewQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleNewPriorityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number.parseInt(e.target.value, 10);
    setNewPriority(Number.isFinite(n) ? Math.max(0, Math.min(1000, n)) : 100);
  }
  function handleNewMaxPerSessionChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number.parseInt(e.target.value, 10);
    setNewMaxPerSession(Number.isFinite(n) ? Math.max(0, n) : 0);
  }
  function handleNewMaxPerVisitorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number.parseInt(e.target.value, 10);
    setNewMaxPerVisitor(Number.isFinite(n) ? Math.max(0, n) : 0);
  }
  function handleNewCooldownChange(e: React.ChangeEvent<HTMLInputElement>) {
    const n = Number.parseInt(e.target.value, 10);
    setNewCooldownSeconds(Number.isFinite(n) ? Math.max(0, n) : 0);
  }

  function handleAddButton() {
    setNewButtons((prev) => {
      if (prev.length >= 3) return prev;
      const nextId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().slice(0, 8)
          : String(prev.length + 1);
      return [...prev, { id: `btn_${nextId}`, label: "", url: "", style: "secondary" }];
    });
  }
  function handleUpdateButton(idx: number, field: keyof MessageButton, value: string) {
    setNewButtons((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: value } as MessageButton : b)),
    );
  }
  function handleRemoveButton(idx: number) {
    setNewButtons((prev) => prev.filter((_, i) => i !== idx));
  }

  return {
    rules, loading, editingId, showCreate, saving,
    newName, newTrigger, newMessage, newDelay, newScroll, newUrlPattern, newQuestions, newPriority,
    newMaxPerSession, newMaxPerVisitor, newCooldownSeconds,
    newMessageImage, newCtaLabel, newCtaUrl, newButtons,
    setNewMessageImage, setNewCtaLabel, setNewCtaUrl,
    handleCreate, handleToggle, handleDelete,
    handleNewNameChange, handleNewMessageChange, handleNewDelayChange,
    handleNewScrollChange, handleNewUrlPatternChange, handleNewTriggerChange,
    handleNewPriorityChange,
    handleNewMaxPerSessionChange, handleNewMaxPerVisitorChange, handleNewCooldownChange,
    handleShowCreate, handleCancelCreate, handleAddQuestion, handleQuestionChange, handleRemoveQuestion,
    handleAddButton, handleUpdateButton, handleRemoveButton,
  };
}

// ---- Component ----

export function EngagementRulesBuilder({ assistantId }: EngagementRulesBuilderProps) {
  const b = useRulesBuilder(assistantId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Engagement Rules</h3>
          <p className="text-xs text-muted-foreground">
            Configure when and how the chatbot proactively engages visitors
          </p>
        </div>
        {!b.showCreate && (
          <Button size="sm" onClick={b.handleShowCreate} className="gap-1.5">
            <Plus className="size-3.5" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Create form */}
      {b.showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">New Engagement Rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input id="rule-name" value={b.newName} onChange={b.handleNewNameChange} placeholder="e.g. Pricing page greeting" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-trigger">Trigger Type</Label>
                <Select value={b.newTrigger} onValueChange={b.handleNewTriggerChange}>
                  <SelectTrigger id="rule-trigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {TRIGGER_CONFIG[b.newTrigger].description}
            </p>

            {/* Trigger-specific config */}
            {b.newTrigger === "time_on_page" && (
              <div className="space-y-2">
                <Label htmlFor="rule-delay">Delay (seconds)</Label>
                <Input id="rule-delay" type="number" min={1} max={300} value={b.newDelay} onChange={b.handleNewDelayChange} className="w-32" />
              </div>
            )}
            {b.newTrigger === "scroll_depth" && (
              <div className="space-y-2">
                <Label htmlFor="rule-scroll">Scroll depth (%)</Label>
                <Input id="rule-scroll" type="number" min={1} max={100} value={b.newScroll} onChange={b.handleNewScrollChange} className="w-32" />
              </div>
            )}
            {(b.newTrigger === "url_pattern" || b.newTrigger !== "exit_intent") && (
              <div className="space-y-2">
                <Label htmlFor="rule-url">URL Pattern (optional)</Label>
                <Input id="rule-url" value={b.newUrlPattern} onChange={b.handleNewUrlPatternChange} placeholder="/pricing/*, /products/**" />
                <p className="text-xs text-muted-foreground">Use * for single segment, ** for any path. Leave empty to match all pages.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rule-message">Proactive Message</Label>
              <Textarea id="rule-message" value={b.newMessage} onChange={b.handleNewMessageChange} rows={2} placeholder="Hi! I noticed you're looking at our pricing..." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                max={1000}
                value={b.newPriority}
                onChange={b.handleNewPriorityChange}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers fire first when multiple rules match. Default 100.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="rule-max-session">Max per session</Label>
                <Input
                  id="rule-max-session"
                  type="number"
                  min={0}
                  value={b.newMaxPerSession}
                  onChange={b.handleNewMaxPerSessionChange}
                />
                <p className="text-xs text-muted-foreground">0 = unlimited.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-max-visitor">Max per visitor (lifetime)</Label>
                <Input
                  id="rule-max-visitor"
                  type="number"
                  min={0}
                  value={b.newMaxPerVisitor}
                  onChange={b.handleNewMaxPerVisitorChange}
                />
                <p className="text-xs text-muted-foreground">0 = unlimited.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-cooldown">Cool-down (seconds)</Label>
                <Input
                  id="rule-cooldown"
                  type="number"
                  min={0}
                  value={b.newCooldownSeconds}
                  onChange={b.handleNewCooldownChange}
                />
                <p className="text-xs text-muted-foreground">
                  After fire / dismiss, don&apos;t show again for N seconds.
                </p>
              </div>
            </div>

            {/* ─── Rich proactive message ────────────────────────────── */}
            <div className="space-y-3 rounded-md border border-dashed p-4">
              <div>
                <h4 className="text-sm font-medium">Rich proactive message (optional)</h4>
                <p className="text-xs text-muted-foreground">
                  Attach an image, a primary CTA, and up to 3 action buttons. Leave blank
                  for a plain text-only bubble.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rule-img">Image URL</Label>
                <Input
                  id="rule-img"
                  value={b.newMessageImage}
                  onChange={(e) => b.setNewMessageImage(e.target.value)}
                  placeholder="https://…/welcome.jpg"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="rule-cta-label">CTA label</Label>
                  <Input
                    id="rule-cta-label"
                    maxLength={64}
                    value={b.newCtaLabel}
                    onChange={(e) => b.setNewCtaLabel(e.target.value)}
                    placeholder="Book a consultation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rule-cta-url">CTA URL</Label>
                  <Input
                    id="rule-cta-url"
                    value={b.newCtaUrl}
                    onChange={(e) => b.setNewCtaUrl(e.target.value)}
                    placeholder="https://example.com/book"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Action buttons (up to 3)</Label>
                {b.newButtons.map((btn, idx) => (
                  <div key={btn.id} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={btn.label}
                      onChange={(e) => b.handleUpdateButton(idx, "label", e.target.value)}
                      placeholder="Label"
                      className="w-36"
                      maxLength={64}
                    />
                    <Input
                      value={btn.url}
                      onChange={(e) => b.handleUpdateButton(idx, "url", e.target.value)}
                      placeholder="https://…"
                      className="flex-1 min-w-[180px]"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => b.handleRemoveButton(idx)}
                      aria-label="Remove button"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                {b.newButtons.length < 3 && (
                  <Button variant="outline" size="sm" onClick={b.handleAddButton} className="gap-1">
                    <Plus className="size-3" /> Add button
                  </Button>
                )}
              </div>
            </div>

            {/* Qualifying questions */}
            <div className="space-y-2">
              <Label>Qualifying Questions (optional)</Label>
              <p className="text-xs text-muted-foreground">Bot will ask these after the visitor responds to the proactive message.</p>
              {b.newQuestions.map((q, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={q}
                    onChange={(e) => b.handleQuestionChange(idx, e.target.value)}
                    placeholder={`Question ${idx + 1}`}
                  />
                  <Button variant="ghost" size="icon" onClick={() => b.handleRemoveQuestion(idx)} aria-label="Remove question">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              {b.newQuestions.length < 5 && (
                <Button variant="outline" size="sm" onClick={b.handleAddQuestion} className="gap-1">
                  <Plus className="size-3" /> Add Question
                </Button>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={b.handleCreate} disabled={b.saving}>
                {b.saving ? "Creating..." : "Create Rule"}
              </Button>
              <Button variant="outline" onClick={b.handleCancelCreate}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules list */}
      {b.loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : b.rules.length === 0 && !b.showCreate ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No engagement rules yet. Add rules to proactively start conversations with visitors.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {b.rules.map((rule) => {
            const cfg = TRIGGER_CONFIG[rule.trigger];
            const Icon = cfg.icon;

            return (
              <Card key={rule.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Badge variant="outline" className="text-[10px]">{cfg.label}</Badge>
                        {rule.urlPattern && (
                          <Badge variant="secondary" className="text-[10px] font-mono">{rule.urlPattern}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{rule.proactiveMessage}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="size-3" /> {rule.impressions} shown
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare className="size-3" /> {rule.engagements} engaged
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" /> {rule.leadsGenerated} leads
                        </span>
                        {rule.impressions > 0 && (
                          <span>
                            {Math.round((rule.engagements / rule.impressions) * 100)}% engagement rate
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={() => b.handleToggle(rule)}
                        aria-label={`${rule.enabled ? "Disable" : "Enable"} rule`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => b.handleDelete(rule.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
