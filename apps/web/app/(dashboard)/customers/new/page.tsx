"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
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

export default function NewCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tone, setTone] = useState("friendly");
  const [widgetColor, setWidgetColor] = useState("#2563eb");

  async function handleSubmit(e: React.FormEvent) {
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
  }

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

      <form onSubmit={handleSubmit} className="space-y-6">
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
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Smile Dental Practice"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={industry} onValueChange={(v) => setIndustry(v ?? "")}>
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
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                placeholder={`Welcome to ${businessName || "your business"}! How can I help you today?`}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                The first message visitors see when they open the chat widget.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Conversation Tone</Label>
              <Select value={tone} onValueChange={(v) => v && setTone(v)}>
                <SelectTrigger id="tone" className="w-full">
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
              <Label htmlFor="color">Widget Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  id="color"
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  className="size-10 cursor-pointer rounded border border-input p-1"
                  aria-label="Pick widget color"
                />
                <Input
                  value={widgetColor}
                  onChange={(e) => setWidgetColor(e.target.value)}
                  placeholder="#2563eb"
                  className="w-32 font-mono uppercase"
                  maxLength={7}
                />
                {/* Preview */}
                <div className="flex-1 flex justify-end">
                  <div
                    className="size-10 rounded-full shadow-lg"
                    style={{ backgroundColor: widgetColor }}
                    aria-label="Color preview"
                  />
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
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "Creating..." : "Create Customer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
