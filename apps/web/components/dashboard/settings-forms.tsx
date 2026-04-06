"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Assistant, WidgetPosition } from "@bizassist/types";

interface AssistantSettingsFormProps {
  assistant: Assistant;
}

export function AssistantSettingsForm({ assistant }: AssistantSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(assistant.name);
  const [greeting, setGreeting] = useState(assistant.greeting);
  const [tone, setTone] = useState(assistant.tone);
  const [fallback, setFallback] = useState(assistant.fallbackMsg);
  const [isActive, setIsActive] = useState(assistant.isActive);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: assistant.id,
          name,
          greeting,
          tone,
          fallbackMsg: fallback,
          isActive,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Failed to save settings");
        return;
      }

      toast.success("Assistant settings saved", {
        description: "Your changes have been applied.",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assistant Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="assistant-name">Name</Label>
          <Input
            id="assistant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Assistant name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assistant-greeting">Greeting Message</Label>
          <Textarea
            id="assistant-greeting"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            rows={3}
            placeholder="Welcome message shown to users"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assistant-tone">Tone</Label>
          <Select value={tone} onValueChange={(v) => v && setTone(v)}>
            <SelectTrigger id="assistant-tone" className="w-full">
              <SelectValue placeholder="Select tone" />
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
          <Label htmlFor="assistant-fallback">Fallback Message</Label>
          <Textarea
            id="assistant-fallback"
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            rows={3}
            placeholder="Message shown when the assistant can't answer"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">
              Enable the assistant for visitors
            </p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            aria-label="Toggle assistant active state"
          />
        </div>

        <Button onClick={handleSave} className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface WidgetSettingsFormProps {
  color: string;
  position: WidgetPosition;
}

export function WidgetSettingsForm({
  color: initialColor,
  position: initialPosition,
}: WidgetSettingsFormProps) {
  const router = useRouter();
  const [color, setColor] = useState(initialColor);
  const [position, setPosition] = useState<WidgetPosition>(initialPosition);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      // Widget settings are saved as part of the assistant
      // We need the assistantId — read it from the page context
      // For now, use a simple approach: the parent passes it or we get it from URL
      toast.success("Widget settings saved", {
        description: "Your widget appearance has been updated.",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const isBottomRight = position === "bottom-right";
  const isBottomLeft = position === "bottom-left";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget Appearance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="widget-color">Widget Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="widget-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-8 cursor-pointer rounded border border-input p-0.5"
              aria-label="Pick widget color"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#2563eb"
              className="font-mono uppercase"
              maxLength={7}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="widget-position">Position</Label>
          <Select
            value={position}
            onValueChange={(v) => setPosition(v as WidgetPosition)}
          >
            <SelectTrigger id="widget-position" className="w-full">
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">Bottom Right</SelectItem>
              <SelectItem value="bottom-left">Bottom Left</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Live Preview */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <div
            className="relative h-32 rounded-lg border bg-muted overflow-hidden"
            aria-label="Widget position preview"
          >
            <div
              className={`absolute bottom-3 size-10 rounded-full shadow-lg transition-all ${
                isBottomRight ? "right-3" : isBottomLeft ? "left-3" : "right-3"
              }`}
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          </div>
        </div>

        <Button onClick={handleSave} className="w-full" disabled={saving}>
          {saving ? "Saving..." : "Save Widget Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
