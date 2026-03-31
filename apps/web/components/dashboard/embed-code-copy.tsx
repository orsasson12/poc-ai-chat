"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmbedCodeCopyProps {
  assistantId: string;
}

export function EmbedCodeCopy({ assistantId }: EmbedCodeCopyProps) {
  const [copied, setCopied] = useState(false);

  const embedCode = `<script
  src="https://cdn.bizassist.ai/widget.js"
  data-assistant-id="${assistantId}"
  defer
></script>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Embed Code</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy embed code"}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs font-mono leading-relaxed">
          <code>{embedCode}</code>
        </pre>
        <p className="mt-3 text-xs text-muted-foreground">
          Paste this snippet just before the closing{" "}
          <code className="rounded bg-muted px-1 font-mono">&lt;/body&gt;</code>{" "}
          tag on every page where you want the chat widget to appear.
        </p>
      </CardContent>
    </Card>
  );
}
