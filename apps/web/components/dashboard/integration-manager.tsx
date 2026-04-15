"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ShoppingCart,
  Users,
  Headphones,
  Globe,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  RefreshCw,
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
import type { IntegrationProvider, IntegrationStatus } from "@bizassist/types";

// ---- Types ----

interface IntegrationRow {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  label: string;
  shopDomain: string | null;
  baseUrl: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  callCount: number;
}

interface IntegrationManagerProps {
  tenantId: string;
  assistantId: string;
}

const PROVIDER_CONFIG: Record<IntegrationProvider, { label: string; icon: typeof ShoppingCart; color: string; authType: "oauth" | "api_key" }> = {
  shopify: { label: "Shopify", icon: ShoppingCart, color: "text-green-600", authType: "oauth" },
  hubspot: { label: "HubSpot CRM", icon: Users, color: "text-orange-500", authType: "oauth" },
  zendesk: { label: "Zendesk", icon: Headphones, color: "text-emerald-600", authType: "oauth" },
  generic_webhook: { label: "Custom Webhook", icon: Globe, color: "text-blue-600", authType: "api_key" },
};

// ---- Hook ----

function useIntegrationManager(tenantId: string, assistantId: string) {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState<IntegrationProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // Add form state
  const [label, setLabel] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations?tenantId=${tenantId}&assistantId=${assistantId}`);
      if (res.ok) setIntegrations(await res.json());
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [tenantId, assistantId]);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  function handleShowAdd(provider: IntegrationProvider) {
    setShowAdd(provider);
    setLabel(PROVIDER_CONFIG[provider].label);
    setShopDomain("");
    setSubdomain("");
    setApiKey("");
    setBaseUrl("");
  }

  function handleCancelAdd() { setShowAdd(null); }

  async function handleConnect() {
    if (!showAdd) return;
    setSaving(true);

    try {
      const cfg = PROVIDER_CONFIG[showAdd];

      if (cfg.authType === "oauth") {
        // Start OAuth flow
        const res = await fetch("/api/integrations/oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: showAdd,
            assistantId,
            shopDomain: shopDomain || undefined,
            subdomain: subdomain || undefined,
          }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        toast.error(data.error ?? "Failed to start OAuth");
      } else {
        // API key / webhook auth
        const res = await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assistantId,
            provider: showAdd,
            label,
            apiKey: apiKey || undefined,
            baseUrl: baseUrl || undefined,
          }),
        });
        if (res.ok) {
          toast.success(`${cfg.label} connected`);
          setShowAdd(null);
          fetchIntegrations();
        } else {
          const data = await res.json();
          toast.error(data.error ?? "Failed to connect");
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch("/api/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tenantId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Connection successful");
      } else {
        toast.error(data.error ?? "Connection test failed");
      }
      fetchIntegrations();
    } finally {
      setTesting(null);
    }
  }

  async function handleDisconnect(id: string) {
    const res = await fetch("/api/integrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, tenantId }),
    });
    if (res.ok) {
      toast.success("Integration removed");
      fetchIntegrations();
    }
  }

  function handleLabelChange(e: React.ChangeEvent<HTMLInputElement>) { setLabel(e.target.value); }
  function handleShopDomainChange(e: React.ChangeEvent<HTMLInputElement>) { setShopDomain(e.target.value); }
  function handleSubdomainChange(e: React.ChangeEvent<HTMLInputElement>) { setSubdomain(e.target.value); }
  function handleApiKeyChange(e: React.ChangeEvent<HTMLInputElement>) { setApiKey(e.target.value); }
  function handleBaseUrlChange(e: React.ChangeEvent<HTMLInputElement>) { setBaseUrl(e.target.value); }

  return {
    integrations, loading, showAdd, saving, testing,
    label, shopDomain, subdomain, apiKey, baseUrl,
    handleShowAdd, handleCancelAdd, handleConnect,
    handleTest, handleDisconnect,
    handleLabelChange, handleShopDomainChange, handleSubdomainChange,
    handleApiKeyChange, handleBaseUrlChange,
  };
}

// ---- Component ----

export function IntegrationManager({ tenantId, assistantId }: IntegrationManagerProps) {
  const m = useIntegrationManager(tenantId, assistantId);

  const connectedProviders = new Set(m.integrations.map((i) => i.provider));
  const availableProviders = (Object.keys(PROVIDER_CONFIG) as IntegrationProvider[])
    .filter((p) => !connectedProviders.has(p) || p === "generic_webhook");

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm">Backend Integrations</h3>
        <p className="text-xs text-muted-foreground">
          Connect business systems so the bot can look up real-time data
        </p>
      </div>

      {/* Connected integrations */}
      {m.loading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {m.integrations.map((integration) => {
            const cfg = PROVIDER_CONFIG[integration.provider];
            const Icon = cfg.icon;
            return (
              <Card key={integration.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Icon className={`size-5 ${cfg.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{integration.label}</span>
                        <IntegrationStatusBadge status={integration.status} />
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {integration.shopDomain && <p>{integration.shopDomain}</p>}
                        {integration.baseUrl && <p className="truncate">{integration.baseUrl}</p>}
                        <p>
                          {integration.callCount} calls
                          {integration.lastUsedAt && ` · Last used ${formatTimeAgo(integration.lastUsedAt)}`}
                        </p>
                        {integration.lastError && (
                          <p className="text-destructive">{integration.lastError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => m.handleTest(integration.id)}
                        disabled={m.testing === integration.id}
                        aria-label="Test connection"
                      >
                        {m.testing === integration.id
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <RefreshCw className="size-3.5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => m.handleDisconnect(integration.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove integration"
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

      {/* Add integration */}
      {!m.showAdd && availableProviders.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-muted-foreground">Add Integration</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableProviders.map((provider) => {
              const cfg = PROVIDER_CONFIG[provider];
              const Icon = cfg.icon;
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => m.handleShowAdd(provider)}
                  className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors hover:bg-muted"
                >
                  <Icon className={`size-5 ${cfg.color}`} />
                  <div>
                    <p className="text-sm font-medium">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {cfg.authType === "oauth" ? "Connect via OAuth" : "API key authentication"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Connect form */}
      {m.showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="size-4" />
              Connect {PROVIDER_CONFIG[m.showAdd].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="int-label">Display Name</Label>
              <Input id="int-label" value={m.label} onChange={m.handleLabelChange} />
            </div>

            {m.showAdd === "shopify" && (
              <div className="space-y-2">
                <Label htmlFor="int-shop">Shopify Store Domain</Label>
                <Input id="int-shop" value={m.shopDomain} onChange={m.handleShopDomainChange} placeholder="mystore.myshopify.com" />
              </div>
            )}

            {m.showAdd === "zendesk" && (
              <div className="space-y-2">
                <Label htmlFor="int-subdomain">Zendesk Subdomain</Label>
                <Input id="int-subdomain" value={m.subdomain} onChange={m.handleSubdomainChange} placeholder="mycompany" />
                <p className="text-xs text-muted-foreground">From: mycompany.zendesk.com</p>
              </div>
            )}

            {m.showAdd === "generic_webhook" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="int-base-url">Base URL</Label>
                  <Input id="int-base-url" type="url" value={m.baseUrl} onChange={m.handleBaseUrlChange} placeholder="https://api.example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="int-api-key">API Key (optional)</Label>
                  <Input id="int-api-key" type="password" value={m.apiKey} onChange={m.handleApiKeyChange} placeholder="Bearer token or API key" />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button onClick={m.handleConnect} disabled={m.saving}>
                {m.saving ? "Connecting..." : PROVIDER_CONFIG[m.showAdd].authType === "oauth" ? "Connect with OAuth" : "Save Connection"}
              </Button>
              <Button variant="outline" onClick={m.handleCancelAdd}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Helpers ----

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const config: Record<IntegrationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connected: { label: "Connected", variant: "default" },
    disconnected: { label: "Disconnected", variant: "outline" },
    error: { label: "Error", variant: "destructive" },
    expired: { label: "Expired", variant: "destructive" },
  };
  const { label, variant } = config[status];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

function formatTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}
