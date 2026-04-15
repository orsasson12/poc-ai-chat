"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  MessageSquare,
  Phone,
  Globe,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Settings,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChannelType, ChannelConnectionStatus } from "@bizassist/types";

// ---- Types ----

interface ConnectionRow {
  id: string;
  channel: ChannelType;
  status: ChannelConnectionStatus;
  platformAccountId: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  greeting: string | null;
  connectedAt: string | null;
  lastWebhookAt: string | null;
  errorMessage: string | null;
}

interface ChannelManagerProps {
  tenantId: string;
  assistantId: string;
}

const CHANNEL_CONFIG: Record<ChannelType, { label: string; icon: typeof MessageSquare; color: string; description: string }> = {
  widget: { label: "Website Widget", icon: Globe, color: "text-blue-600", description: "Already active — embedded on your website" },
  whatsapp: { label: "WhatsApp Business", icon: Phone, color: "text-green-600", description: "Connect your WhatsApp Business phone number" },
  messenger: { label: "Facebook Messenger", icon: MessageSquare, color: "text-blue-500", description: "Connect your Facebook Page" },
  instagram: { label: "Instagram DMs", icon: MessageSquare, color: "text-pink-600", description: "Connect your Instagram Professional account" },
};

// ---- Hook ----

function useChannelManager(tenantId: string, assistantId: string) {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState<ChannelType | null>(null);
  const [saving, setSaving] = useState(false);

  // Connect form state
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [platformId, setPlatformId] = useState("");
  const [greeting, setGreeting] = useState("");

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels?tenantId=${tenantId}`);
      if (res.ok) setConnections(await res.json());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  function handleShowConnect(channel: ChannelType) {
    setShowConnect(channel);
    setAccessToken("");
    setPhoneNumber("");
    setPlatformId("");
    setGreeting("");
  }

  function handleCancelConnect() {
    setShowConnect(null);
  }

  async function handleConnect() {
    if (!showConnect || !accessToken.trim()) {
      toast.error("Access token is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          assistantId,
          channel: showConnect,
          accessToken: accessToken.trim(),
          phoneNumber: phoneNumber.trim() || undefined,
          platformAccountId: platformId.trim() || undefined,
          greeting: greeting.trim() || undefined,
        }),
      });
      if (res.ok) {
        toast.success(`${CHANNEL_CONFIG[showConnect].label} connected`);
        setShowConnect(null);
        fetchConnections();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to connect");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect(connectionId: string) {
    const res = await fetch(`/api/channels/${connectionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (res.ok) {
      toast.success("Channel disconnected");
      fetchConnections();
    }
  }

  function handleAccessTokenChange(e: React.ChangeEvent<HTMLInputElement>) { setAccessToken(e.target.value); }
  function handlePhoneNumberChange(e: React.ChangeEvent<HTMLInputElement>) { setPhoneNumber(e.target.value); }
  function handlePlatformIdChange(e: React.ChangeEvent<HTMLInputElement>) { setPlatformId(e.target.value); }
  function handleGreetingChange(e: React.ChangeEvent<HTMLTextAreaElement>) { setGreeting(e.target.value); }

  return {
    connections, loading, showConnect, saving,
    accessToken, phoneNumber, platformId, greeting,
    handleShowConnect, handleCancelConnect, handleConnect, handleDisconnect,
    handleAccessTokenChange, handlePhoneNumberChange, handlePlatformIdChange, handleGreetingChange,
  };
}

// ---- Component ----

export function ChannelManager({ tenantId, assistantId }: ChannelManagerProps) {
  const m = useChannelManager(tenantId, assistantId);

  const connectedChannels = new Set(m.connections.map((c) => c.channel));
  const availableChannels = (["whatsapp", "messenger", "instagram"] as ChannelType[])
    .filter((ch) => !connectedChannels.has(ch));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Connected Channels</h3>
          <p className="text-xs text-muted-foreground">
            All channels share the same knowledge base and safety pipeline
          </p>
        </div>
      </div>

      {/* Active connections */}
      {m.loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Widget is always active */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-blue-600" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Website Widget</span>
                    <Badge variant="default" className="text-[10px]">Active</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Default channel — always active</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Connected channels */}
          {m.connections.map((conn) => {
            const cfg = CHANNEL_CONFIG[conn.channel];
            const Icon = cfg.icon;
            return (
              <Card key={conn.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Icon className={`size-5 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{cfg.label}</span>
                        <ConnectionStatusBadge status={conn.status} />
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {conn.phoneNumber && <p>Phone: {conn.phoneNumber}</p>}
                        {conn.platformAccountId && <p>ID: {conn.platformAccountId}</p>}
                        {conn.lastWebhookAt && (
                          <p>Last message: {new Date(conn.lastWebhookAt).toLocaleDateString()}</p>
                        )}
                        {conn.errorMessage && (
                          <p className="text-destructive">{conn.errorMessage}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => m.handleDisconnect(conn.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      aria-label={`Disconnect ${cfg.label}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add channel section */}
      {availableChannels.length > 0 && !m.showConnect && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground">Add Channel</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {availableChannels.map((ch) => {
              const cfg = CHANNEL_CONFIG[ch];
              const Icon = cfg.icon;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => m.handleShowConnect(ch)}
                  className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted"
                >
                  <Icon className={`size-5 ${cfg.color}`} />
                  <div>
                    <p className="text-sm font-medium">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground">{cfg.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Connect form */}
      {m.showConnect && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Plus className="size-4" />
              Connect {CHANNEL_CONFIG[m.showConnect].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ch-token">Access Token</Label>
              <Input
                id="ch-token"
                type="password"
                value={m.accessToken}
                onChange={m.handleAccessTokenChange}
                placeholder="Paste your platform access token"
              />
              <p className="text-xs text-muted-foreground">
                {m.showConnect === "whatsapp"
                  ? "From Meta Business Suite → WhatsApp → API Setup"
                  : "From Meta for Developers → Your App → Access Tokens"}
              </p>
            </div>

            {m.showConnect === "whatsapp" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ch-phone">Phone Number ID</Label>
                  <Input id="ch-phone" value={m.platformId} onChange={m.handlePlatformIdChange} placeholder="From WhatsApp API setup" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ch-phone-number">Phone Number</Label>
                  <Input id="ch-phone-number" value={m.phoneNumber} onChange={m.handlePhoneNumberChange} placeholder="+1234567890" />
                </div>
              </>
            )}

            {(m.showConnect === "messenger" || m.showConnect === "instagram") && (
              <div className="space-y-2">
                <Label htmlFor="ch-page-id">Facebook Page ID</Label>
                <Input id="ch-page-id" value={m.platformId} onChange={m.handlePlatformIdChange} placeholder="From your Facebook Page → About → Page ID" />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ch-greeting">Channel Greeting (optional)</Label>
              <Textarea
                id="ch-greeting"
                value={m.greeting}
                onChange={m.handleGreetingChange}
                rows={2}
                placeholder="Custom greeting for this channel..."
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={m.handleConnect} disabled={m.saving}>
                {m.saving ? "Connecting..." : "Connect"}
              </Button>
              <Button variant="outline" onClick={m.handleCancelConnect}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Helpers ----

function ConnectionStatusBadge({ status }: { status: ChannelConnectionStatus }) {
  const config: Record<ChannelConnectionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    active: { label: "Active", variant: "default" },
    error: { label: "Error", variant: "destructive" },
    disconnected: { label: "Disconnected", variant: "outline" },
  };
  const { label, variant } = config[status];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}
