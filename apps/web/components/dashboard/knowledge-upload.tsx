"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, Link, Plus, Database } from "lucide-react";
import { StructuredItemForm } from "@/components/dashboard/structured-item-form";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface KnowledgeUploadProps {
  assistantId?: string;
}

function useKnowledgeUpload(assistantId?: string) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);

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

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assistantId],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

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

  async function handleCSVUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    const csv = await file.text();
    if (!csv.trim()) {
      toast.error("File is empty");
      return;
    }

    if (!assistantId) {
      toast.success(`Parsing "${file.name}"...`, {
        description: "Structured data will be imported shortly.",
      });
      return;
    }

    setCsvLoading(true);
    try {
      const res = await fetch("/api/ingest/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, csv }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`${data.created} items imported from "${file.name}"`, {
          description: data.errors?.length
            ? `${data.errors.length} rows had errors`
            : undefined,
        });
        router.refresh();
      } else {
        toast.error(data.error || "Failed to import CSV");
      }
    } catch {
      toast.error("Failed to import CSV — check the file format and try again");
    } finally {
      setCsvLoading(false);
    }
  }

  // Named handlers for JSX events (no inline functions)
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
  }

  function handleCsvInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleCSVUpload(e.target.files);
  }

  function handleUploadAreaClick() {
    fileInputRef.current?.click();
  }

  function handleUploadAreaKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      fileInputRef.current?.click();
    }
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
  }

  function handleUrlKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleUrlImport();
  }

  function handleQuestionChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuestion(e.target.value);
  }

  function handleAnswerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setAnswer(e.target.value);
  }

  function handleCsvButtonClick() {
    csvInputRef.current?.click();
  }

  return {
    fileInputRef,
    csvInputRef,
    isDragging,
    url,
    urlLoading,
    question,
    answer,
    csvLoading,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleUploadAreaClick,
    handleUploadAreaKeyDown,
    handleFileInputChange,
    handleUrlChange,
    handleUrlKeyDown,
    handleUrlImport,
    handleQuestionChange,
    handleAnswerChange,
    handleAddQA,
    handleCsvButtonClick,
    handleCsvInputChange,
  };
}

export function KnowledgeUpload({ assistantId }: KnowledgeUploadProps) {
  const {
    fileInputRef,
    csvInputRef,
    isDragging,
    url,
    urlLoading,
    question,
    answer,
    csvLoading,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleUploadAreaClick,
    handleUploadAreaKeyDown,
    handleFileInputChange,
    handleUrlChange,
    handleUrlKeyDown,
    handleUrlImport,
    handleQuestionChange,
    handleAnswerChange,
    handleAddQA,
    handleCsvButtonClick,
    handleCsvInputChange,
  } = useKnowledgeUpload(assistantId);

  return (
    <Tabs defaultValue="upload">
      <TabsList>
        <TabsTrigger value="upload">File Upload</TabsTrigger>
        <TabsTrigger value="url">URL Import</TabsTrigger>
        <TabsTrigger value="qa">Manual Q&amp;A</TabsTrigger>
        <TabsTrigger value="structured">Structured Data</TabsTrigger>
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
              onClick={handleUploadAreaClick}
              onKeyDown={handleUploadAreaKeyDown}
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
                onChange={handleFileInputChange}
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
                    onChange={handleUrlChange}
                    className="pl-8"
                    onKeyDown={handleUrlKeyDown}
                  />
                </div>
                <Button onClick={handleUrlImport} disabled={urlLoading}>
                  {urlLoading ? "Importing..." : "Import"}
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
                  onChange={handleQuestionChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qa-answer">Answer</Label>
                <Textarea
                  id="qa-answer"
                  placeholder="Provide a detailed answer..."
                  value={answer}
                  onChange={handleAnswerChange}
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
      <TabsContent value="structured">
        <Card>
          <CardContent className="pt-4">
            <StructuredItemForm assistantId={assistantId} />

            <div className="relative my-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                or bulk import
              </span>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Upload a CSV with columns:{" "}
                <code className="rounded bg-muted px-1 py-0.5">card_type</code>,{" "}
                <code className="rounded bg-muted px-1 py-0.5">name</code>, and any additional fields.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={csvLoading}
                onClick={handleCsvButtonClick}
              >
                <Database className="size-4" />
                {csvLoading ? "Importing..." : "Upload CSV"}
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={handleCsvInputChange}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
