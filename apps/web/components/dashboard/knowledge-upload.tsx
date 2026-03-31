"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud, Link, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function KnowledgeUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    toast.success(`Uploading "${file.name}"…`, {
      description: "Your file will be processed shortly.",
    });
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

  function handleUrlImport() {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    toast.success("URL queued for import", {
      description: url,
    });
    setUrl("");
  }

  function handleAddQA() {
    if (!question.trim() || !answer.trim()) {
      toast.error("Please fill in both question and answer");
      return;
    }
    toast.success("Q&A added to knowledge base", {
      description: question,
    });
    setQuestion("");
    setAnswer("");
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
                <Button onClick={handleUrlImport}>Import</Button>
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
                  placeholder="Provide a detailed answer…"
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
