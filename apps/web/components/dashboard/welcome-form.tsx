"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, ExternalLink, Upload, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContentCard } from "@/components/chat/content-card";
import type { Assistant, CardData, WelcomeButton } from "@bizassist/types";

// ---- Hook ----

function useWelcomeForm(assistant: Assistant, featuredCards: CardData[], tenantId?: string) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [greeting, setGreeting] = useState(assistant.greeting);
  const [bannerUrl, setBannerUrl] = useState(assistant.welcomeBanner ?? "");
  const [buttons, setButtons] = useState<WelcomeButton[]>(assistant.welcomeButtons);

  function handleGreetingChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setGreeting(e.target.value);
  }

  function handleBannerUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBannerUrl(e.target.value);
  }

  async function handleBannerUpload(file: File) {
    if (!tenantId) {
      toast.error("Missing customer context");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tenantId", tenantId);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok) {
        setBannerUrl(data.url);
        toast.success("Image uploaded");
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  function handleAddButton() {
    setButtons((prev) => [...prev, { id: crypto.randomUUID(), label: "", url: "" }]);
  }

  const handleButtonLabelChange = useCallback(
    (btnId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setButtons((prev) =>
        prev.map((b) => (b.id === btnId ? { ...b, label: e.target.value } : b)),
      );
    },
    [],
  );

  const handleButtonUrlChange = useCallback(
    (btnId: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setButtons((prev) =>
        prev.map((b) => (b.id === btnId ? { ...b, url: e.target.value } : b)),
      );
    },
    [],
  );

  const handleRemoveButton = useCallback(
    (btnId: string) => () => {
      setButtons((prev) => prev.filter((b) => b.id !== btnId));
    },
    [],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const validButtons = buttons.filter((b) => b.label.trim() && b.url.trim());

      if (!tenantId) {
        toast.error("Missing customer context");
        return;
      }

      const res = await fetch(`/api/customers/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ greeting, welcomeBanner: bannerUrl.trim() || "", welcomeButtons: validButtons }),
      });

      if (res.ok) {
        toast.success("Welcome screen saved");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  return {
    saving, uploading, greeting, bannerUrl, buttons, featuredCards,
    handleGreetingChange, handleBannerUrlChange, handleBannerUpload,
    handleAddButton, handleButtonLabelChange, handleButtonUrlChange,
    handleRemoveButton, handleSave,
  };
}

// ---- Component ----

interface WelcomeFormProps {
  assistant: Assistant;
  featuredCards: CardData[];
  tenantId?: string;
}

export function WelcomeForm({ assistant, featuredCards, tenantId }: WelcomeFormProps) {
  const form = useWelcomeForm(assistant, featuredCards, tenantId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* Form */}
      <div className="space-y-6">
        {/* Banner */}
        <Card>
          <CardHeader>
            <CardTitle>Banner Image</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BannerUploadZone
              bannerUrl={form.bannerUrl}
              uploading={form.uploading}
              onUpload={form.handleBannerUpload}
              onUrlChange={form.handleBannerUrlChange}
            />
          </CardContent>
        </Card>

        {/* Greeting */}
        <Card>
          <CardHeader>
            <CardTitle>Greeting Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="welcome-greeting">Message</Label>
            <Textarea
              id="welcome-greeting"
              value={form.greeting}
              onChange={form.handleGreetingChange}
              rows={3}
              placeholder="Welcome! How can I help you today?"
            />
            <p className="text-xs text-muted-foreground">
              First message visitors see when the chat opens.
            </p>
          </CardContent>
        </Card>

        {/* CTA Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Action Buttons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Clickable links shown below the greeting. Max 5 buttons.
            </p>
            {form.buttons.map((btn) => (
              <div key={btn.id} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`btn-label-${btn.id}`} className="text-xs">Label</Label>
                  <Input
                    id={`btn-label-${btn.id}`}
                    placeholder="e.g. Book Now"
                    value={btn.label}
                    onChange={form.handleButtonLabelChange(btn.id)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`btn-url-${btn.id}`} className="text-xs">URL</Label>
                  <Input
                    id={`btn-url-${btn.id}`}
                    type="url"
                    placeholder="https://..."
                    value={btn.url}
                    onChange={form.handleButtonUrlChange(btn.id)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove button"
                  onClick={form.handleRemoveButton(btn.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {form.buttons.length < 5 && (
              <Button type="button" variant="outline" size="sm" onClick={form.handleAddButton} className="gap-1.5">
                <Plus className="size-3.5" />
                Add Button
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Featured Cards info */}
        <Card>
          <CardHeader>
            <CardTitle>Featured Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {featuredCards.length > 0
                ? `${featuredCards.length} item${featuredCards.length === 1 ? "" : "s"} featured. Manage them in the Knowledge Base by clicking the star icon on structured items.`
                : "No items featured yet. Go to the Knowledge Base, add structured items, and click the star icon to feature them here."}
            </p>
          </CardContent>
        </Card>

        <Button onClick={form.handleSave} disabled={form.saving} className="w-full">
          {form.saving ? "Saving..." : "Save Welcome Screen"}
        </Button>
      </div>

      {/* Live Preview */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Live Preview</p>
        <div className="rounded-xl border bg-background overflow-hidden shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: assistant.widgetColor }}>
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {assistant.name[0]}
            </div>
            <div className="text-white">
              <p className="text-sm font-medium">{assistant.name}</p>
              <p className="text-xs opacity-80">Online</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-3 space-y-3 max-h-[500px] overflow-y-auto">
            {/* Banner */}
            {form.bannerUrl && (
              <img
                src={form.bannerUrl}
                alt=""
                className="w-full rounded-lg object-cover max-h-24"
              />
            )}

            {/* Greeting */}
            <div className="rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm max-w-[90%]">
              {form.greeting || "Welcome!"}
            </div>

            {/* Featured Cards */}
            {featuredCards.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {featuredCards.map((card) => (
                  <div key={card.knowledgeItemId} className="shrink-0 scale-90 origin-top-left">
                    <ContentCard data={card} />
                  </div>
                ))}
              </div>
            )}

            {/* CTA Buttons */}
            {form.buttons.filter((b) => b.label.trim()).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.buttons
                  .filter((b) => b.label.trim())
                  .map((btn) => (
                    <span
                      key={btn.id}
                      className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium"
                    >
                      {btn.label}
                      {btn.url && <ExternalLink className="size-2.5 text-muted-foreground" />}
                    </span>
                  ))}
              </div>
            )}

            {/* Suggested questions placeholder */}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
                Sample question 1
              </span>
              <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
                Sample question 2
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Banner Upload Zone ----

function BannerUploadZone({
  bannerUrl,
  uploading,
  onUpload,
  onUrlChange,
}: {
  bannerUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  onUrlChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) onUpload(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleClickZone() {
    fileInputRef.current?.click();
  }

  return (
    <div className="space-y-3">
      {/* Drop zone / preview */}
      <button
        type="button"
        onClick={handleClickZone}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        disabled={uploading}
        className={`relative w-full rounded-lg border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
        } ${uploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
      >
        {bannerUrl ? (
          <div className="relative">
            <img
              src={bannerUrl}
              alt="Banner preview"
              className="w-full rounded-lg object-cover max-h-36"
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
              <span className="text-xs font-medium text-white flex items-center gap-1.5">
                <Upload className="size-3.5" />
                Replace image
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            {uploading ? (
              <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            ) : (
              <ImageIcon className="size-8" />
            )}
            <p className="text-sm font-medium">
              {uploading ? "Uploading..." : "Drop an image here or click to upload"}
            </p>
            <p className="text-xs">JPEG, PNG, WebP, GIF, or SVG. Max 2 MB.</p>
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Upload banner image"
      />

      {/* OR divider + URL input */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or paste a URL</span>
        <Separator className="flex-1" />
      </div>

      <Input
        id="welcome-banner"
        type="url"
        placeholder="https://..."
        value={bannerUrl}
        onChange={onUrlChange}
      />

      <p className="text-xs text-muted-foreground">
        Shown at the top of the chat when it opens. Recommended: 800x200px.
      </p>
    </div>
  );
}
