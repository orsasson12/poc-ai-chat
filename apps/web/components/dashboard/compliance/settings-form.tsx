"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface ComplianceSettings {
  dataRegion: "eu" | "us" | "auto";
  retentionDaysConversations: number;
  retentionDaysLeads: number;
  retentionDaysSecurityEvents: number;
  aiDisclosureMode: "banner" | "inline" | "off";
  aiDisclosureText: string | null;
  cookielessMode: boolean;
  dpaAcceptedAt: string | null;
  dpaAcceptedVersion: string | null;
  currentDpaVersion: string;
}

export function SettingsForm() {
  const [settings, setSettings] = useState<ComplianceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/compliance/settings");
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as ComplianceSettings;
      setSettings(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load compliance settings");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/compliance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataRegion: settings.dataRegion,
          retentionDaysConversations: settings.retentionDaysConversations,
          retentionDaysLeads: settings.retentionDaysLeads,
          retentionDaysSecurityEvents: settings.retentionDaysSecurityEvents,
          aiDisclosureMode: settings.aiDisclosureMode,
          aiDisclosureText: settings.aiDisclosureText,
          cookielessMode: settings.cookielessMode,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Settings saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleAcceptDpa = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/compliance/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptDpa: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Data Processing Agreement accepted");
      await load();
    } catch {
      toast.error("Failed to accept DPA");
    } finally {
      setSaving(false);
    }
  }, [settings, load]);

  const handleRunRetention = useCallback(async () => {
    setRecomputing(true);
    try {
      const res = await fetch("/api/compliance/retention/run", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const total = (data.results ?? []).reduce(
        (sum: number, r: { counts: { conversations: number; leads: number } }) =>
          sum + r.counts.conversations + r.counts.leads,
        0,
      );
      toast.success(`Retention purge complete — ${total} records removed`);
    } catch {
      toast.error("Retention purge failed");
    } finally {
      setRecomputing(false);
    }
  }, []);

  if (!settings) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  const dpaNeedsRefresh =
    settings.dpaAcceptedVersion !== settings.currentDpaVersion;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Processing Agreement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            The DPA documents BizAssist&apos;s role as a data processor for your
            tenant. Review the current version and accept it to record
            acceptance on your account.
          </p>
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current version</span>
              <span className="font-medium">{settings.currentDpaVersion}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your acceptance</span>
              <span className="font-medium">
                {settings.dpaAcceptedAt
                  ? `${settings.dpaAcceptedVersion} — ${new Date(
                      settings.dpaAcceptedAt,
                    ).toLocaleDateString()}`
                  : "Not yet accepted"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleAcceptDpa} disabled={saving || !dpaNeedsRefresh}>
              {settings.dpaAcceptedAt ? "Re-accept current version" : "Accept DPA"}
            </Button>
            {!dpaNeedsRefresh && (
              <span className="text-xs text-muted-foreground">
                You&apos;re on the latest version.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data region</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Pin this tenant to a specific region. &quot;Auto&quot; runs on the
            deployment you signed up through. Changing the region requires
            migration and will be enforced on next deployment.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="data-region">Region</Label>
            <Select
              value={settings.dataRegion}
              onValueChange={(v) =>
                setSettings({ ...settings, dataRegion: v as ComplianceSettings["dataRegion"] })
              }
            >
              <SelectTrigger id="data-region" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (deployment default)</SelectItem>
                <SelectItem value="eu">European Union</SelectItem>
                <SelectItem value="us">United States</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Note: OpenAI and Anthropic API calls transit the United States even
            for EU-pinned tenants. This is documented in the DPA and
            sub-processor list.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data retention</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Data older than these windows is purged automatically each day by
            the retention job. Set a value to <code>0</code> to keep that class
            of data indefinitely.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ret-conv">Conversations (days)</Label>
              <Input
                id="ret-conv"
                type="number"
                min={0}
                max={3650}
                value={settings.retentionDaysConversations}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retentionDaysConversations: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ret-leads">Leads (days)</Label>
              <Input
                id="ret-leads"
                type="number"
                min={0}
                max={3650}
                value={settings.retentionDaysLeads}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retentionDaysLeads: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ret-sec">Security events (days)</Label>
              <Input
                id="ret-sec"
                type="number"
                min={0}
                max={3650}
                value={settings.retentionDaysSecurityEvents}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retentionDaysSecurityEvents: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunRetention}
              disabled={recomputing}
            >
              {recomputing ? "Running…" : "Run retention purge now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Act transparency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            EU AI Act Article 50 requires that users interacting with an AI
            system are informed. BizAssist is classified as a Limited Risk
            system; this setting controls the disclosure customers see.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-mode">Disclosure placement</Label>
            <Select
              value={settings.aiDisclosureMode}
              onValueChange={(v) =>
                setSettings({
                  ...settings,
                  aiDisclosureMode: v as ComplianceSettings["aiDisclosureMode"],
                })
              }
            >
              <SelectTrigger id="ai-mode" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="banner">Banner above chat (recommended)</SelectItem>
                <SelectItem value="inline">Inline with welcome message</SelectItem>
                <SelectItem value="off">Disabled (not recommended)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-text">Disclosure text</Label>
            <Textarea
              id="ai-text"
              rows={2}
              maxLength={500}
              placeholder="You're chatting with an AI assistant powered by BizAssist. Responses are generated, not written by a human."
              value={settings.aiDisclosureText ?? ""}
              onChange={(e) =>
                setSettings({ ...settings, aiDisclosureText: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use the default text.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cookie-free mode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm">
                Store session state only in <code>sessionStorage</code> (not{" "}
                <code>localStorage</code>), skip analytics cookies, and avoid
                persistent visitor IDs.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use when embedding the widget on sites without a cookie banner.
                History is lost when the tab closes.
              </p>
            </div>
            <Switch
              checked={settings.cookielessMode}
              onCheckedChange={(v) => setSettings({ ...settings, cookielessMode: v })}
              aria-label="Toggle cookie-free mode"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save all settings"}
        </Button>
      </div>
    </div>
  );
}
