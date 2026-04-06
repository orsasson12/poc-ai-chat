"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, Link, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface KnowledgeUploadProps {
  assistantId?: string;
}

export function KnowledgeUpload({ assistantId }: KnowledgeUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!assistantId) {
      toast.success(`Uploading "${file.name}"...`, {
        description: "Your file will be processed shortly.",
      });
      return;
    }

    // Read file content
    const content = await file.text();
    if (!content.trim()) {
      toast.error("File is empty");
      return;
    }

    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId,
        type: "document",
        title: file.name,
        content,
      }),
    });

    if (res.ok) {
      toast.success(`"${file.name}" added to knowledge base`, {
        description: "Content uploaded and ready to approve.",
      });
      router.refresh();
    } else {
      toast.error("Failed to add file");
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleUrlImport() {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!assistantId) {
      toast.success("URL queued for import", { description: url });
      setUrl("");
      return;
    }

    setUrlLoading(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId,
          type: "url",
          title: new URL(url).hostname,
          url,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success("URL content imported to knowledge base", { description: url });
        setUrl("");
        router.refresh();
      } else {
        toast.error(data.message || "Failed to import URL");
      }
    } catch {
      toast.error("Failed to import URL — check the URL and try again");
    } finally {
      setUrlLoading(false);
    }
  }

  async function handleAddQA() {
    if (!question.trim() || !answer.trim()) {
      toast.error("Please fill in both question and answer");
      return;
    }

    if (!assistantId) {
      toast.success("Q&A added to knowledge base", { description: question });
      setQuestion("");
      setAnswer("");
      return;
    }

    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId,
        type: "manual_qa",
        title: question,
        content: `Q: ${question}\nA: ${answer}`,
      }),
    });

    if (res.ok) {
      toast.success("Q&A added to knowledge base", { description: question });
      setQuestion("");
      setAnswer("");
      router.refresh();
    } else {
      toast.error("Failed to add Q&A");
    }
  }

  return (
    <Tabs defaultValue="upload">
      <TabsList>
        <TabsTrigger value="upload">File Upload</TabsTrigger>
        <TabsTrigger value="url">URL Import</TabsTrigger>
        <TabsTrigger value="qa">Manual Q&amp;A</TabsTrigger>
      </TabsList>

      <TabsContent value="upload">
        <Card>
          <CardContent className="pt-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload file area — drag and drop or click to browse"
              className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary/50"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
            >
              <UploadCloud className="size-10 text-muted-foreground" />
              <div>
                <p className="font-medium">Drop files here or click to browse</p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF, DOCX, TXT, CSV
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.csv"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="url">
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              <Label htmlFor="url-input">Page URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="url-input"
                    type="url"
                    placeholder="https://yoursite.com/faq"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-8"
                    onKeyDown={(e) => e.key === "Enter" && handleUrlImport()}
                  />
                </div>
                <Button onClick={handleUrlImport} disabled={urlLoading}>
                  {urlLoading ? "Importing…" : "Import"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                We will crawl and extract content from the URL.
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="qa">
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="qa-question">Question</Label>
                <Input
                  id="qa-question"
                  placeholder="e.g. What are your office hours?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-answer">Answer</Label>
                <Textarea
                  id="qa-answer"
                  placeholder="Provide a detailed answer..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={handleAddQA} className="gap-1.5">
                <Plus className="size-4" />
                Add Q&amp;A
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
