"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UnansweredQuestion {
  question: string;
  messageId: string;
  conversationId: string;
  createdAt: string;
}

interface UnansweredQuestionsProps {
  tenantId?: string;
}

export function UnansweredQuestions({ tenantId }: UnansweredQuestionsProps = {}) {
  const [questions, setQuestions] = useState<UnansweredQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const url = tenantId
          ? `/api/conversations/unanswered?tenantId=${tenantId}`
          : "/api/conversations/unanswered";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setQuestions(data.questions ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tenantId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="size-4" />
            Unanswered Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="size-4" />
            Unanswered Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No unanswered questions yet. Your knowledge base is covering all customer inquiries.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="size-4 text-amber-500" />
          Unanswered Questions
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {questions.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          These questions couldn&apos;t be answered from your knowledge base. Add content to cover them.
        </p>
        <ul className="space-y-2">
          {questions.slice(0, 10).map((q) => (
            <li
              key={q.messageId}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{q.question}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(q.createdAt).toLocaleDateString()}
                </p>
              </div>
              <a
                href="/knowledge"
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" />
                Add
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
