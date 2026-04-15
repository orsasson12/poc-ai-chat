"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Upload, X, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const industries = [
  "Healthcare / Dental",
  "Legal Services",
  "Real Estate",
  "Restaurant / Food",
  "Retail / E-commerce",
  "Fitness / Wellness",
  "Education / Tutoring",
  "Automotive",
  "Beauty / Salon",
  "Financial Services",
  "Other",
];

function useNewCustomerForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tone, setTone] = useState("friendly");
  const [widgetColor, setWidgetColor] = useState("#2563eb");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");

  const handleBusinessNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBusinessName(e.target.value);
    },
    [],
  );

  const handleWebsiteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setWebsite(e.target.value);
    },
    [],
  );

  const handleIndustryChange = useCallback((v: string | null) => {
    setIndustry(v ?? "");
  }, []);

  const handleGreetingChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setGreeting(e.target.value);
    },
    [],
  );

  const handleToneChange = useCallback((v: string | null) => {
    if (v) setTone(v);
  }, []);

  const handleWidgetColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setWidgetColor(e.target.value);
    },
    [],
  );

  const handleFileSelect = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];

      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be under 2MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const dataUrl = readerEvent.target?.result as string;
        setAvatarPreview(dataUrl);
        setAvatarUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelect(e.target.files);
    },
    [handleFileSelect],
  );

  const handleAvatarLinkChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAvatarUrl(e.target.value);
      setAvatarPreview(e.target.value);
    },
    [],
  );

  const handleClearAvatar = useCallback(() => {
    setAvatarUrl("");
    setAvatarPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleUploadAreaClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadAreaKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!businessName.trim()) {
        toast.error("Business name is required");
        return;
      }

      setSaving(true);
      try {
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName: businessName.trim(),
            website: website.trim() || undefined,
            industry: industry || undefined,
            greeting:
              greeting.trim() ||
              `Welcome to ${businessName.trim()}! How can I help you today?`,
            tone,
            avatarUrl: avatarUrl || undefined,
            widgetColor,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error ?? "Failed to create customer");
          return;
        }

        const data = await res.json();
        toast.success(`${businessName} created!`, {
          description: "Now add their knowledge base to power the chatbot.",
        });
        router.push(`/customers/${data.tenant.id}`);
      } finally {
        setSaving(false);
      }
    },
    [businessName, website, industry, greeting, tone, avatarUrl, widgetColor, router],
  );

  return {
    fileInputRef,
    saving,
    businessName,
    website,
    industry,
    greeting,
    tone,
    widgetColor,
    avatarUrl,
    avatarPreview,
    handleBusinessNameChange,
    handleWebsiteChange,
    handleIndustryChange,
    handleGreetingChange,
    handleToneChange,
    handleWidgetColorChange,
    handleFileInputChange,
    handleAvatarLinkChange,
    handleClearAvatar,
    handleUploadAreaClick,
    handleUploadAreaKeyDown,
    handleSubmit,
  };
}

export default function NewCustomerPage() {
  const form = useNewCustomerForm();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/customers" />}
          aria-label="Back to customers"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Customer</h1>
          <p className="text-muted-foreground">
            Set up a new business with their own AI chatbot
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit} className="space-y-6">
        {/* Business Info */}
        <Card>
          <CardHeader>
            <CardTitle>Business Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business-name">
                Business Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="business-name"
                value={form.businessName}
                onChange={form.handleBusinessNameChange}
                placeholder="e.g. Smile Dental Practice"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={form.website}
                onChange={form.handleWebsiteChange}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={form.industry} onValueChange={form.handleIndustryChange}>
                <SelectTrigger id="industry" className="w-full">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Avatar */}
            <div className="space-y-2">
              <Label>Chatbot Avatar</Label>
              <div className="flex items-start gap-4">
                {form.avatarPreview ? (
                  <div className="relative shrink-0">
                    <img
                      src={form.avatarPreview}
                      alt="Avatar preview"
                      className="h-16 w-16 rounded-full object-cover border"
                    />
                    <button
                      type="button"
                      onClick={form.handleClearAvatar}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                      aria-label="Remove avatar"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-bold text-muted-foreground">
                    {form.businessName[0] || "?"}
                  </div>
                )}
                <Tabs defaultValue="upload" className="flex-1">
                  <TabsList className="h-8">
                    <TabsTrigger value="upload" className="gap-1 text-xs px-2">
                      <Upload className="size-3" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="link" className="gap-1 text-xs px-2">
                      <LinkIcon className="size-3" />
                      Link
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="upload" className="mt-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={form.handleUploadAreaClick}
                      onKeyDown={form.handleUploadAreaKeyDown}
                      className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 p-3 text-center text-xs text-muted-foreground hover:border-primary/50"
                      aria-label="Click to upload avatar image"
                    >
                      Drop image or click to browse
                    </div>
                    <input
                      ref={form.fileInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      tabIndex={-1}
                      onChange={form.handleFileInputChange}
                    />
                  </TabsContent>
                  <TabsContent value="link" className="mt-2">
                    <Input
                      placeholder="https://example.com/logo.png"
                      value={form.avatarUrl.startsWith("data:") ? "" : form.avatarUrl}
                      onChange={form.handleAvatarLinkChange}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chatbot Config */}
        <Card>
          <CardHeader>
            <CardTitle>Chatbot Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="greeting">Greeting Message</Label>
              <Textarea
                id="greeting"
                value={form.greeting}
                onChange={form.handleGreetingChange}
                placeholder={`Welcome to ${form.businessName || "your business"}! How can I help you today?`}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The first message visitors see when they open the chat widget.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Conversation Tone</Label>
              <Select value={form.tone} onValueChange={form.handleToneChange}>
                <SelectTrigger id="tone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
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
              <Label htmlFor="color">Widget Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="color"
                  value={form.widgetColor}
                  onChange={form.handleWidgetColorChange}
                  className="size-10 cursor-pointer rounded border border-input p-1"
                  aria-label="Pick widget color"
                />
                <Input
                  value={form.widgetColor}
                  onChange={form.handleWidgetColorChange}
                  placeholder="#2563eb"
                  className="w-32 font-mono uppercase"
                  maxLength={7}
                />
                {/* Preview */}
                <div className="flex-1 flex justify-end">
                  <div
                    className="size-10 rounded-full shadow-lg overflow-hidden flex items-center justify-center"
                    style={{ backgroundColor: form.widgetColor }}
                    aria-label="Color preview"
                  >
                    {form.avatarPreview ? (
                      <img src={form.avatarPreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-white text-sm font-bold">{form.businessName[0] || "AI"}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            render={<Link href="/customers" />}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={form.saving} className="flex-1">
            {form.saving ? "Creating..." : "Create Customer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
