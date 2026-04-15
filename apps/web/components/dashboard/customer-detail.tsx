"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Settings,
  BookOpen,
  Code,
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  Upload,
  X,
  CheckCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Activity,
  AlertTriangle,
  BarChart3,
  ArrowUpRight,
  Minus,
  Users,
  Target,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KnowledgeUpload } from "@/components/dashboard/knowledge-upload";
import { KnowledgeTable } from "@/components/dashboard/knowledge-table";
import { MetricCard } from "@/components/dashboard/metric-card";
import { VolumeChart, TopQuestionsChart } from "@/components/dashboard/analytics-charts";
import { SeverityBadge, StatusBadge } from "@/components/dashboard/status-badge";
import { ConversationsClient } from "@/components/dashboard/conversations-client";
import { UnansweredQuestions } from "@/components/dashboard/unanswered-questions";
import { WelcomeForm } from "@/components/dashboard/welcome-form";
import { AgentQueue } from "@/components/dashboard/agent-queue";
import { LeadsPanel } from "@/components/dashboard/leads-panel";
import { EngagementRulesBuilder } from "@/components/dashboard/engagement-rules-builder";
import { ChannelManager } from "@/components/dashboard/channel-manager";
import { IntegrationManager } from "@/components/dashboard/integration-manager";
import { FreshnessPanel } from "@/components/dashboard/freshness-panel";
import { formatPercentage, formatNumber } from "@/lib/utils";
import type {
  Assistant, KnowledgeItem, Tenant, WidgetPosition,
  DashboardMetrics, ConversationVolume, TopQuestion,
  SecurityEvent, CustomerStats, CardData, Message, SatisfactionScore, EscalationStatus, ChannelType,
} from "@bizassist/types";

interface SerializedConversation {
  id: string;
  tenantId: string;
  assistantId: string;
  sessionId: string;
  channel: ChannelType;
  contactId: string | null;
  channelConversationId: string | null;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  escalated: boolean;
  escalationStatus: EscalationStatus | null;
  assignedAgentId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerLanguage: string | null;
  customerDevice: string | null;
  referrerUrl: string | null;
  leadId: string | null;
  engagementRuleId: string | null;
  satisfaction: SatisfactionScore;
}

interface CustomerDetailProps {
  tenant: Tenant;
  assistant: Assistant;
  knowledgeItems: KnowledgeItem[];
  conversations: SerializedConversation[];
  useApi: boolean;
  initialMessages: Record<string, Message[]>;
  featuredCards: CardData[];
  metrics: DashboardMetrics;
  volume: ConversationVolume[];
  topQuestions: TopQuestion[];
  securityEvents: SecurityEvent[];
  customerStats: CustomerStats;
}

export function CustomerDetail({
  tenant,
  assistant,
  knowledgeItems,
  conversations,
  useApi,
  initialMessages,
  featuredCards,
  metrics,
  volume,
  topQuestions,
  securityEvents,
  customerStats,
}: CustomerDetailProps) {
  return (
    <Tabs defaultValue="settings">
      <TabsList className="flex-wrap">
        <TabsTrigger value="settings" className="gap-1.5">
          <Settings className="size-3.5" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="knowledge" className="gap-1.5">
          <BookOpen className="size-3.5" />
          Knowledge ({knowledgeItems.length})
        </TabsTrigger>
        <TabsTrigger value="conversations" className="gap-1.5">
          <MessageSquare className="size-3.5" />
          Conversations ({conversations.length})
        </TabsTrigger>
        <TabsTrigger value="welcome" className="gap-1.5">
          <Sparkles className="size-3.5" />
          Welcome
        </TabsTrigger>
        <TabsTrigger value="engagement" className="gap-1.5">
          <Sparkles className="size-3.5" />
          Engagement
        </TabsTrigger>
        <TabsTrigger value="leads" className="gap-1.5">
          <Target className="size-3.5" />
          Leads
        </TabsTrigger>
        <TabsTrigger value="handoff" className="gap-1.5">
          <Users className="size-3.5" />
          Handoff
        </TabsTrigger>
        <TabsTrigger value="channels" className="gap-1.5">
          <MessageSquare className="size-3.5" />
          Channels
        </TabsTrigger>
        <TabsTrigger value="integrations" className="gap-1.5">
          <Activity className="size-3.5" />
          Integrations
        </TabsTrigger>
        <TabsTrigger value="embed" className="gap-1.5">
          <Code className="size-3.5" />
          Embed Code
        </TabsTrigger>
        <TabsTrigger value="freshness" className="gap-1.5">
          <Clock className="size-3.5" />
          Freshness
        </TabsTrigger>
        <TabsTrigger value="stats" className="gap-1.5">
          <BarChart3 className="size-3.5" />
          Stats
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="mt-4">
        <CustomerSettingsTab tenant={tenant} assistant={assistant} />
      </TabsContent>

      <TabsContent value="knowledge" className="mt-4 space-y-4">
        <KnowledgeUpload assistantId={assistant.id} />
        <Card>
          <CardHeader>
            <CardTitle>
              Knowledge Items
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {knowledgeItems.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No knowledge items yet. Add documents, URLs, or Q&A pairs above
                to teach the chatbot about this business.
              </p>
            ) : (
              <KnowledgeTable items={knowledgeItems} />
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="conversations" className="mt-4 space-y-4">
        <UnansweredQuestions tenantId={tenant.id} />
        <ConversationsClient
          conversations={conversations}
          initialMessages={initialMessages}
          useApi={useApi}
          tenantId={tenant.id}
        />
      </TabsContent>

      <TabsContent value="welcome" className="mt-4">
        <WelcomeForm assistant={assistant} featuredCards={featuredCards} tenantId={tenant.id} />
      </TabsContent>

      <TabsContent value="engagement" className="mt-4">
        <EngagementRulesBuilder assistantId={assistant.id} />
      </TabsContent>

      <TabsContent value="leads" className="mt-4">
        <LeadsPanel tenantId={tenant.id} />
      </TabsContent>

      <TabsContent value="handoff" className="mt-4">
        <AgentQueue tenantId={tenant.id} />
      </TabsContent>

      <TabsContent value="channels" className="mt-4">
        <ChannelManager tenantId={tenant.id} assistantId={assistant.id} />
      </TabsContent>

      <TabsContent value="integrations" className="mt-4">
        <IntegrationManager tenantId={tenant.id} assistantId={assistant.id} />
      </TabsContent>

      <TabsContent value="embed" className="mt-4">
        <EmbedTab assistantId={assistant.id} assistantName={assistant.name} />
      </TabsContent>

      <TabsContent value="freshness" className="mt-4">
        <FreshnessPanel tenantId={tenant.id} knowledgeItems={knowledgeItems} />
      </TabsContent>

      <TabsContent value="stats" className="mt-4">
        <StatsTab
          metrics={metrics}
          volume={volume}
          topQuestions={topQuestions}
          securityEvents={securityEvents}
          knowledgeItems={knowledgeItems}
          customerStats={customerStats}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---- Settings Hook ----

function useCustomerSettingsForm(tenant: Tenant, assistant: Assistant) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const widgetFileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(assistant.name);
  const [greeting, setGreeting] = useState(assistant.greeting);
  const [tone, setTone] = useState(assistant.tone);
  const [fallback, setFallback] = useState(assistant.fallbackMsg);
  const [escalationEmail, setEscalationEmail] = useState(assistant.escalationEmail ?? "");
  const [avatarUrl, setAvatarUrl] = useState(assistant.avatarUrl ?? "");
  const [isActive, setIsActive] = useState(assistant.isActive);
  const [widgetColor, setWidgetColor] = useState(assistant.widgetColor);
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(
    assistant.widgetPosition,
  );

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => setAvatarUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setName(e.target.value);
  }

  function handleGreetingChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setGreeting(e.target.value);
  }

  function handleToneChange(v: string | null) {
    if (v) setTone(v);
  }

  function handleFallbackChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setFallback(e.target.value);
  }

  function handleEscalationEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    setEscalationEmail(e.target.value);
  }

  function handleAvatarUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAvatarUrl(e.target.value);
  }

  function handleActiveChange(checked: boolean) {
    setIsActive(checked);
  }

  function handleWidgetColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    setWidgetColor(e.target.value);
  }

  function handleWidgetPositionChange(v: string | null) {
    if (v) setWidgetPosition(v as WidgetPosition);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelect(e.target.files);
  }

  function handleRemoveAvatar() {
    setAvatarUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleRemoveAllAvatars() {
    setAvatarUrl("");
    if (widgetFileInputRef.current) widgetFileInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  function handleWidgetUploadClick() {
    widgetFileInputRef.current?.click();
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${tenant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantName: name,
          greeting,
          tone,
          fallbackMsg: fallback,
          escalationEmail,
          avatarUrl,
          isActive,
          widgetColor,
          widgetPosition,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to save settings");
        return;
      }

      toast.success("Settings saved");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return {
    // Refs
    fileInputRef,
    widgetFileInputRef,
    // State values
    saving,
    name,
    greeting,
    tone,
    fallback,
    escalationEmail,
    avatarUrl,
    isActive,
    widgetColor,
    widgetPosition,
    // Handlers
    handleNameChange,
    handleGreetingChange,
    handleToneChange,
    handleFallbackChange,
    handleEscalationEmailChange,
    handleAvatarUrlChange,
    handleActiveChange,
    handleWidgetColorChange,
    handleWidgetPositionChange,
    handleFileInputChange,
    handleRemoveAvatar,
    handleRemoveAllAvatars,
    handleUploadClick,
    handleWidgetUploadClick,
    handleSave,
  };
}

// ---- Settings Tab ----

function CustomerSettingsTab({
  tenant,
  assistant,
}: {
  tenant: Tenant;
  assistant: Assistant;
}) {
  const {
    fileInputRef,
    widgetFileInputRef,
    saving,
    name,
    greeting,
    tone,
    fallback,
    escalationEmail,
    avatarUrl,
    isActive,
    widgetColor,
    widgetPosition,
    handleNameChange,
    handleGreetingChange,
    handleToneChange,
    handleFallbackChange,
    handleEscalationEmailChange,
    handleAvatarUrlChange,
    handleActiveChange,
    handleWidgetColorChange,
    handleWidgetPositionChange,
    handleFileInputChange,
    handleRemoveAvatar,
    handleRemoveAllAvatars,
    handleUploadClick,
    handleWidgetUploadClick,
    handleSave,
  } = useCustomerSettingsForm(tenant, assistant);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Assistant Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar */}
            <div className="space-y-2">
              <Label>Avatar</Label>
              <div className="flex items-start gap-4">
                {avatarUrl ? (
                  <div className="relative shrink-0">
                    <img src={avatarUrl} alt="Avatar" className="h-14 w-14 rounded-full object-cover border" />
                    <button
                      type="button"
                      onClick={handleRemoveAvatar}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                      aria-label="Remove avatar"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: widgetColor }}>
                    {name[0] || "?"}
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={handleUploadClick}>
                      <Upload className="size-3" /> Upload
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={handleFileInputChange} />
                  </div>
                  <Input
                    placeholder="or paste image URL"
                    value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
                    onChange={handleAvatarUrlChange}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cust-name">Assistant Name</Label>
              <Input id="cust-name" value={name} onChange={handleNameChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-greeting">Greeting Message</Label>
              <Textarea id="cust-greeting" value={greeting} onChange={handleGreetingChange} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-tone">Tone</Label>
              <Select value={tone} onValueChange={handleToneChange}>
                <SelectTrigger id="cust-tone" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-fallback">Fallback Message</Label>
              <Textarea id="cust-fallback" value={fallback} onChange={handleFallbackChange} rows={3} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Enable the chatbot for visitors</p>
              </div>
              <Switch checked={isActive} onCheckedChange={handleActiveChange} aria-label="Toggle active" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cust-escalation">Escalation Email</Label>
              <Input
                id="cust-escalation"
                type="email"
                value={escalationEmail}
                onChange={handleEscalationEmailChange}
                placeholder="support@business.com"
              />
              <p className="text-xs text-muted-foreground">
                Where to forward conversations the assistant can&apos;t handle
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Widget Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cust-color">Color</Label>
              <div className="flex items-center gap-3">
                <input type="color" id="cust-color" value={widgetColor} onChange={handleWidgetColorChange} className="size-10 cursor-pointer rounded border border-input p-1" />
                <Input value={widgetColor} onChange={handleWidgetColorChange} className="w-32 font-mono uppercase" maxLength={7} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cust-position">Position</Label>
              <Select value={widgetPosition} onValueChange={handleWidgetPositionChange}>
                <SelectTrigger id="cust-position" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bottom-right">Bottom Right</SelectItem>
                  <SelectItem value="bottom-left">Bottom Left</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Widget Avatar */}
            <div className="space-y-2">
              <Label>Widget Avatar</Label>
              <div className="flex items-center gap-3">
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-full overflow-hidden shadow-sm border"
                  style={{ backgroundColor: widgetColor }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Widget avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-white font-bold">{name[0] || "AI"}</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={handleWidgetUploadClick}>
                      <Upload className="size-3" /> Upload
                    </Button>
                    {avatarUrl && (
                      <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-destructive" onClick={handleRemoveAllAvatars}>
                        <X className="size-3" /> Remove
                      </Button>
                    )}
                    <input ref={widgetFileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={handleFileInputChange} />
                  </div>
                  <Input
                    placeholder="or paste image URL"
                    value={avatarUrl.startsWith("data:") ? "" : avatarUrl}
                    onChange={handleAvatarUrlChange}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="relative h-32 rounded-lg border bg-muted overflow-hidden">
                <div
                  className={`absolute bottom-3 size-10 rounded-full shadow-lg overflow-hidden flex items-center justify-center transition-all ${
                    widgetPosition === "bottom-left" ? "left-3" : "right-3"
                  }`}
                  style={{ backgroundColor: widgetColor }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-white text-sm font-bold">{name[0] || "AI"}</span>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Saving..." : "Save All Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Embed Tab ----

function EmbedTab({
  assistantId,
  assistantName,
}: {
  assistantId: string;
  assistantName: string;
}) {
  const [copied, setCopied] = useState(false);

  const embedCode = `<script
  src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js"
  data-assistant-id="${assistantId}"
  async
></script>`;

  const chatUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/chat/${assistantId}`
      : `/chat/${assistantId}`;

  function handleCopy() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast.success("Embed code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenChat() {
    window.open(chatUrl, "_blank");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Embed Widget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add this script tag to your customer&apos;s website, just before the
            closing <code className="text-xs">&lt;/body&gt;</code> tag.
          </p>
          <div className="relative">
            <pre className="rounded-lg bg-muted p-4 text-sm overflow-x-auto font-mono">
              {embedCode}
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={handleCopy}
              aria-label="Copy embed code"
            >
              {copied ? (
                <Check className="size-4 text-green-500" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Direct Chat Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Share this link directly with customers, or use it to test the
            chatbot.
          </p>
          <div className="flex items-center gap-2">
            <Input value={chatUrl} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="icon"
              onClick={handleOpenChat}
              aria-label={`Open ${assistantName} chat`}
            >
              <ExternalLink className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Stats Tab ----

function StatsTab({
  metrics,
  volume,
  topQuestions,
  securityEvents,
  knowledgeItems,
  customerStats,
}: {
  metrics: DashboardMetrics;
  volume: ConversationVolume[];
  topQuestions: TopQuestion[];
  securityEvents: SecurityEvent[];
  knowledgeItems: KnowledgeItem[];
  customerStats: CustomerStats;
}) {
  const feedbackTotal = customerStats.positiveFeedback + customerStats.negativeFeedback;
  const feedbackScore = feedbackTotal > 0
    ? formatPercentage(customerStats.positiveFeedback / feedbackTotal)
    : "N/A";

  const avgLatency = customerStats.avgLatencyMs > 0
    ? `${Math.round(customerStats.avgLatencyMs)}ms`
    : "N/A";

  const recentEvents = securityEvents.slice(0, 5);

  const knowledgeByType: Record<string, number> = {};
  const knowledgeByStatus: Record<string, number> = {};
  knowledgeItems.forEach((item) => {
    knowledgeByType[item.type] = (knowledgeByType[item.type] || 0) + 1;
    knowledgeByStatus[item.status] = (knowledgeByStatus[item.status] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Row 1: Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Conversations Today"
          value={metrics.conversationsToday}
          description={`${metrics.conversationsWeek} this week`}
          icon={MessageSquare}
        />
        <MetricCard
          title="Resolution Rate"
          value={formatPercentage(metrics.resolutionRate)}
          description="Answered without escalation"
          icon={CheckCircle}
        />
        <MetricCard
          title="Avg Response Time"
          value={avgLatency}
          description="AI response latency"
          icon={Clock}
        />
        <MetricCard
          title="Feedback Score"
          value={feedbackScore}
          description={feedbackTotal > 0 ? `${customerStats.positiveFeedback} positive, ${customerStats.negativeFeedback} negative` : "No feedback yet"}
          icon={ThumbsUp}
        />
      </div>

      {/* Row 2: Health Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle>Health Score</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">
              {metrics.healthScore}
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <div className="flex-1">
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${metrics.healthScore}%` }}
                  role="progressbar"
                  aria-valuenow={metrics.healthScore}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Health score: ${metrics.healthScore} out of 100`}
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Based on resolution rate and fallback frequency.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Row 3: Secondary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Unanswered"
          value={metrics.unansweredCount}
          description="Questions needing attention"
          icon={HelpCircle}
        />
        <MetricCard
          title="Total Messages"
          value={formatNumber(customerStats.totalMessages)}
          description={`${formatNumber(customerStats.totalTokensUsed)} tokens used`}
          icon={MessageSquare}
        />
        <MetricCard
          title="Avg Messages / Chat"
          value={customerStats.avgMessagesPerConversation > 0 ? customerStats.avgMessagesPerConversation.toFixed(1) : "N/A"}
          description={`${formatNumber(customerStats.totalConversations)} total conversations`}
          icon={Users}
        />
        <MetricCard
          title="Escalated"
          value={customerStats.escalatedCount}
          description={customerStats.totalConversations > 0 ? `${formatPercentage(customerStats.escalatedCount / customerStats.totalConversations)} of conversations` : "No conversations"}
          icon={ArrowUpRight}
        />
      </div>

      {/* Row 4: Confidence Distribution + Satisfaction Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm">Confidence Distribution</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const total = customerStats.confidenceHigh + customerStats.confidenceMedium + customerStats.confidenceLow;
              if (total === 0) return <p className="text-sm text-muted-foreground">No responses yet.</p>;
              return (
                <div className="space-y-3">
                  <ConfidenceBar label="High (80%+)" count={customerStats.confidenceHigh} total={total} color="bg-green-500" />
                  <ConfidenceBar label="Medium (50-80%)" count={customerStats.confidenceMedium} total={total} color="bg-yellow-500" />
                  <ConfidenceBar label="Low (<50%)" count={customerStats.confidenceLow} total={total} color="bg-red-500" />
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Satisfaction Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ThumbsUp className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm">Satisfaction Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const total = customerStats.satisfactionPositive + customerStats.satisfactionNeutral + customerStats.satisfactionNegative;
              if (total === 0) return <p className="text-sm text-muted-foreground">No ratings yet.</p>;
              return (
                <div className="space-y-3">
                  <SatisfactionRow icon={ThumbsUp} label="Positive" count={customerStats.satisfactionPositive} total={total} color="text-green-600 dark:text-green-400" />
                  <SatisfactionRow icon={Minus} label="Neutral" count={customerStats.satisfactionNeutral} total={total} color="text-muted-foreground" />
                  <SatisfactionRow icon={ThumbsDown} label="Negative" count={customerStats.satisfactionNegative} total={total} color="text-red-600 dark:text-red-400" />
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Row 5: Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <VolumeChart data={volume} />
        <TopQuestionsChart data={topQuestions} />
      </div>

      {/* Row 6: Most-Used Knowledge Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">Most-Used Knowledge Sources</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {customerStats.topKnowledgeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No knowledge usage data yet.</p>
          ) : (
            <div className="space-y-2">
              {customerStats.topKnowledgeItems.map((item, i) => {
                const maxCount = customerStats.topKnowledgeItems[0].usageCount;
                return (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-muted-foreground text-right">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm truncate">{item.title}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{item.usageCount} references</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(item.usageCount / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 7: Security Events + Knowledge Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Security Events */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm">Recent Security Events</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No security events.</p>
            ) : (
              <ul className="space-y-2">
                {recentEvents.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono">{event.eventType}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {event.inputText.slice(0, 50)}
                        {event.inputText.length > 50 ? "..." : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <SeverityBadge severity={event.severity} />
                      {event.blocked && (
                        <Badge variant="destructive" className="text-xs">
                          Blocked
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Knowledge Base Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm">Knowledge Base Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {knowledgeItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No knowledge items.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">By Type</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(knowledgeByType).map(([type, cnt]) => (
                      <div key={type} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
                        <span className="text-xs capitalize">{type.replace("_", " ")}</span>
                        <span className="text-xs font-bold">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">By Status</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(knowledgeByStatus).map(([status, cnt]) => (
                      <div key={status} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5">
                        <StatusBadge status={status as KnowledgeItem["status"]} />
                        <span className="text-xs font-bold">{cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---- Stats Helpers ----

function ConfidenceBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SatisfactionRow({ icon: Icon, label, count, total, color }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; total: number; color: string }) {
  const pct = Math.round((count / total) * 100);
  return (
    <div className="flex items-center gap-3">
      <Icon className={`size-4 ${color}`} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-1">
          <span>{label}</span>
          <span className="text-muted-foreground">{count} ({pct}%)</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
