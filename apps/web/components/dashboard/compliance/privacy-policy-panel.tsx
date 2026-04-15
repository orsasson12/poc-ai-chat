"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Copy, Download, RefreshCw } from "lucide-react";

export function PrivacyPolicyPanel() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compliance/privacy-policy");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMarkdown(data.markdown ?? "");
    } catch {
      toast.error("Failed to generate privacy policy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleCopy = useCallback(async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable");
    }
  }, [markdown]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy notice generator</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This Markdown snippet is generated from your current compliance
            settings — data region, retention windows, sub-processors, and
            cookie-free mode. Edit your settings and regenerate to update it.
          </p>
          <p className="text-xs text-muted-foreground">
            It is a starting point only, not legal advice. Have a lawyer
            review the text before publishing it on your site.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {loading ? "Generating…" : "Regenerate"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!markdown}>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              Copy Markdown
            </Button>
            <a
              href="/api/compliance/privacy-policy?format=download"
              className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download .md
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {markdown === null ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <Textarea
              readOnly
              value={markdown}
              rows={24}
              className="font-mono text-xs"
              aria-label="Generated privacy policy Markdown"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
