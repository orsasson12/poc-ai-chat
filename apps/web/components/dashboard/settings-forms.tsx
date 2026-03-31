"use client";

import { useState } from "react";
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
  const [name, setName] = useState(assistant.name);
  const [greeting, setGreeting] = useState(assistant.greeting);
  const [tone, setTone] = useState(assistant.tone);
  const [fallback, setFallback] = useState(assistant.fallbackMsg);
  const [isActive, setIsActive] = useState(assistant.isActive);

  function handleSave() {
    toast.success("Assistant settings saved", {
      description: "Your changes have been applied.",
    });
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

        <Button onClick={handleSave} className="w-full">
          Save Changes
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
  const [color, setColor] = useState(initialColor);
  const [position, setPosition] = useState<WidgetPosition>(initialPosition);

  function handleSave() {
    toast.success("Widget settings saved", {
      description: "Your widget appearance has been updated.",
    });
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

        <Button onClick={handleSave} className="w-full">
          Save Widget Settings
        </Button>
      </CardContent>
    </Card>
  );
}
