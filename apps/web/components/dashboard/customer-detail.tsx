"use client";

import { useState } from "react";
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
import type { Assistant, KnowledgeItem, Tenant, WidgetPosition } from "@bizassist/types";

interface CustomerDetailProps {
  tenant: Tenant;
  assistant: Assistant;
  knowledgeItems: KnowledgeItem[];
  conversationCount: number;
}

export function CustomerDetail({
  tenant,
  assistant,
  knowledgeItems,
  conversationCount,
}: CustomerDetailProps) {
  return (
    <Tabs defaultValue="settings">
      <TabsList>
        <TabsTrigger value="settings" className="gap-1.5">
          <Settings className="size-3.5" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="knowledge" className="gap-1.5">
          <BookOpen className="size-3.5" />
          Knowledge ({knowledgeItems.length})
        </TabsTrigger>
        <TabsTrigger value="embed" className="gap-1.5">
          <Code className="size-3.5" />
          Embed Code
        </TabsTrigger>
        <TabsTrigger value="stats" className="gap-1.5">
          <MessageSquare className="size-3.5" />
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

      <TabsContent value="embed" className="mt-4">
        <EmbedTab assistantId={assistant.id} assistantName={assistant.name} />
      </TabsContent>

      <TabsContent value="stats" className="mt-4">
        <StatsTab
          conversationCount={conversationCount}
          knowledgeCount={knowledgeItems.length}
          tenant={tenant}
          assistant={assistant}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---- Settings Tab ----

function CustomerSettingsTab({
  tenant,
  assistant,
}: {
  tenant: Tenant;
  assistant: Assistant;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(assistant.name);
  const [greeting, setGreeting] = useState(assistant.greeting);
  const [tone, setTone] = useState(assistant.tone);
  const [fallback, setFallback] = useState(assistant.fallbackMsg);
  const [isActive, setIsActive] = useState(assistant.isActive);
  const [widgetColor, setWidgetColor] = useState(assistant.widgetColor);
  const [widgetPosition, setWidgetPosition] = useState<WidgetPosition>(
    assistant.widgetPosition,
  );

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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assistant Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Assistant Name</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-greeting">Greeting Message</Label>
            <Textarea
              id="cust-greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-tone">Tone</Label>
            <Select value={tone} onValueChange={(v) => v && setTone(v)}>
              <SelectTrigger id="cust-tone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="empathetic">Empathetic</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-fallback">Fallback Message</Label>
            <Textarea
              id="cust-fallback"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Enable the chatbot for visitors
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              aria-label="Toggle active"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Widget Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="cust-color"
                value={widgetColor}
                onChange={(e) => setWidgetColor(e.target.value)}
                className="size-10 cursor-pointer rounded border border-input p-1"
              />
              <Input
                value={widgetColor}
                onChange={(e) => setWidgetColor(e.target.value)}
                className="w-32 font-mono uppercase"
                maxLength={7}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-position">Position</Label>
            <Select
              value={widgetPosition}
              onValueChange={(v) => setWidgetPosition(v as WidgetPosition)}
            >
              <SelectTrigger id="cust-position" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bottom-right">Bottom Right</SelectItem>
                <SelectItem value="bottom-left">Bottom Left</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="relative h-32 rounded-lg border bg-muted overflow-hidden">
              <div
                className={`absolute bottom-3 size-10 rounded-full shadow-lg transition-all ${
                  widgetPosition === "bottom-left" ? "left-3" : "right-3"
                }`}
                style={{ backgroundColor: widgetColor }}
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save All Settings"}
          </Button>
        </CardContent>
      </Card>
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
              onClick={() => window.open(chatUrl, "_blank")}
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
  conversationCount,
  knowledgeCount,
  tenant,
  assistant,
}: {
  conversationCount: number;
  knowledgeCount: number;
  tenant: Tenant;
  assistant: Assistant;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Total Conversations</p>
          <p className="text-3xl font-bold">{conversationCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Knowledge Items</p>
          <p className="text-3xl font-bold">{knowledgeCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Plan</p>
          <p className="text-3xl font-bold capitalize">{tenant.plan}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Status</p>
          <div className="mt-1">
            <Badge
              variant={assistant.isActive ? "default" : "secondary"}
              className="text-sm"
            >
              {assistant.isActive ? "Active" : "Disabled"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
