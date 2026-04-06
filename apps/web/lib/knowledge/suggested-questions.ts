import type { KnowledgeItem } from "@bizassist/types";

const MAX_SUGGESTIONS = 4;
const MAX_QUESTION_LENGTH = 60;

/**
 * Extracts short suggested questions from active knowledge items.
 * Priority: manual Q&A titles → CSV Q&A keys → headings from documents/URLs.
 */
export function extractSuggestedQuestions(items: KnowledgeItem[]): string[] {
  const questions: string[] = [];

  const active = items.filter((i) => i.status === "active" && i.content);

  for (const item of active) {
    if (questions.length >= MAX_SUGGESTIONS) break;

    if (item.type === "manual_qa") {
      // Q&A items — the title IS the question
      addQuestion(questions, item.title);
      continue;
    }

    if (!item.content) continue;

    // CSV with QA_PAIR rows
    if (item.content.includes("QA_PAIR") || item.content.includes("Q:")) {
      const qaMatches = item.content.matchAll(/(?:^|\n)\s*Q:\s*(.+)/gi);
      for (const m of qaMatches) {
        if (questions.length >= MAX_SUGGESTIONS) break;
        addQuestion(questions, m[1].trim());
      }
    }

    // CSV key/value — extract questions from key column
    const csvQaMatches = item.content.matchAll(
      /QA_PAIR[^,]*,\s*[^,]*,\s*"?([^",\n]+)"?/gi,
    );
    for (const m of csvQaMatches) {
      if (questions.length >= MAX_SUGGESTIONS) break;
      addQuestion(questions, m[1].trim());
    }

    // Document/URL content — extract heading-style lines as topic prompts
    const headings = item.content.matchAll(/^##?\s+(.+)$/gm);
    for (const h of headings) {
      if (questions.length >= MAX_SUGGESTIONS) break;
      const topic = h[1].trim();
      if (topic.length > 5 && topic.length < 50 && !topic.toLowerCase().includes("config")) {
        addQuestion(questions, topicToQuestion(topic));
      }
    }
  }

  return questions.slice(0, MAX_SUGGESTIONS);
}

function addQuestion(list: string[], q: string) {
  const clean = q.replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 5) return;

  // Truncate and ensure it ends with "?"
  let question = clean.slice(0, MAX_QUESTION_LENGTH);
  if (!question.endsWith("?")) question += "?";

  // Avoid duplicates (case-insensitive)
  if (list.some((existing) => existing.toLowerCase() === question.toLowerCase())) return;

  list.push(question);
}

/** Turn a heading like "Opening Hours" into "What are your opening hours?" */
function topicToQuestion(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.startsWith("how") || lower.startsWith("what") || lower.startsWith("where") || lower.startsWith("when") || lower.startsWith("do ") || lower.startsWith("can ")) {
    return topic;
  }
  return `What are your ${lower}`;
}
