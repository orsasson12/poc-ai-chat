/**
 * Section-level change detection for knowledge content.
 *
 * Compares old and new content at a section level (split by headings),
 * classifies the severity of changes, and produces a structured diff.
 */

import type { SectionDiff, ChangeSeverity } from "@bizassist/types";

export interface DiffResult {
  severity: ChangeSeverity;
  summary: string;
  added: number;
  removed: number;
  modified: number;
  details: SectionDiff[];
}

/**
 * Detects changes between old and new content at the section level.
 */
export function detectChanges(oldContent: string, newContent: string): DiffResult {
  if (!oldContent && newContent) {
    return {
      severity: "major",
      summary: "New content added (no previous version)",
      added: 1,
      removed: 0,
      modified: 0,
      details: [{ type: "added", heading: null, oldText: null, newText: newContent, similarity: null }],
    };
  }

  const oldSections = splitIntoSections(oldContent);
  const newSections = splitIntoSections(newContent);

  const details: SectionDiff[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;

  // Match sections by heading
  const oldMap = new Map(oldSections.map((s) => [normalizeHeading(s.heading), s]));
  const newMap = new Map(newSections.map((s) => [normalizeHeading(s.heading), s]));
  const processedOld = new Set<string>();

  // Check each new section
  for (const [key, newSec] of newMap) {
    const oldSec = oldMap.get(key);

    if (!oldSec) {
      // New section added
      added++;
      details.push({
        type: "added",
        heading: newSec.heading,
        oldText: null,
        newText: newSec.text,
        similarity: null,
      });
    } else {
      processedOld.add(key);
      const sim = calculateSimilarity(oldSec.text, newSec.text);

      if (sim < 0.95) {
        // Section was modified
        modified++;
        details.push({
          type: "modified",
          heading: newSec.heading,
          oldText: oldSec.text,
          newText: newSec.text,
          similarity: sim,
        });
      }
      // else: unchanged, don't add to diff
    }
  }

  // Check for removed sections
  for (const [key, oldSec] of oldMap) {
    if (!processedOld.has(key) && !newMap.has(key)) {
      removed++;
      details.push({
        type: "removed",
        heading: oldSec.heading,
        oldText: oldSec.text,
        newText: null,
        similarity: null,
      });
    }
  }

  // Classify severity
  const severity = classifySeverity(added, removed, modified, oldSections.length, details);

  // Generate summary
  const summary = generateSummary(added, removed, modified, severity, details);

  return { severity, summary, added, removed, modified, details };
}

// ---- Section splitting ----

interface Section {
  heading: string | null;
  text: string;
}

/**
 * Splits content into sections based on headings (markdown-style) or
 * paragraph breaks. Falls back to paragraph-level splitting.
 */
function splitIntoSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Detect headings: "# Title", "## Title", "Title\n===", bold "**Title**"
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/) ??
                         line.match(/^\*\*(.+)\*\*\s*$/) ??
                         (line.length > 3 && line.length < 80 && !line.includes(".") && line === line.trim() ? [line, line] : null);

    if (headingMatch && currentLines.length > 0) {
      // Save previous section
      const text = currentLines.join("\n").trim();
      if (text) {
        sections.push({ heading: currentHeading, text });
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else if (headingMatch && currentLines.length === 0) {
      currentHeading = headingMatch[1].trim();
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  const lastText = currentLines.join("\n").trim();
  if (lastText) {
    sections.push({ heading: currentHeading, text: lastText });
  }

  // If we only got 1 section, try paragraph splitting
  if (sections.length <= 1 && content.length > 500) {
    return splitByParagraphs(content);
  }

  return sections;
}

function splitByParagraphs(content: string): Section[] {
  return content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20)
    .map((p, i) => ({
      heading: `Paragraph ${i + 1}`,
      text: p,
    }));
}

function normalizeHeading(heading: string | null): string {
  return (heading ?? "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

// ---- Similarity calculation ----

/**
 * Calculates text similarity using word overlap (Jaccard-like).
 * Returns 0-1 where 1 = identical.
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

// ---- Severity classification ----

/**
 * Classifies change severity based on:
 * - Number and type of changes
 * - Whether pricing/contact/availability keywords are affected
 * - Proportion of content that changed
 */
function classifySeverity(
  added: number,
  removed: number,
  modified: number,
  totalOldSections: number,
  details: SectionDiff[],
): ChangeSeverity {
  const totalChanges = added + removed + modified;

  if (totalChanges === 0) return "none";

  // Check for high-impact content changes
  const hasHighImpactChange = details.some((d) => {
    const text = ((d.newText ?? "") + (d.oldText ?? "")).toLowerCase();
    return HIGH_IMPACT_PATTERNS.some((p) => p.test(text));
  });

  if (hasHighImpactChange) return "major";
  if (removed > 0) return "major"; // removing content is always significant
  if (added > 2) return "major"; // many new sections
  if (totalOldSections > 0 && modified / totalOldSections > 0.5) return "major"; // >50% modified

  // Check similarity of modified sections
  const lowSimCount = details.filter((d) => d.type === "modified" && d.similarity !== null && d.similarity < 0.7).length;
  if (lowSimCount > 0) return "major";

  return "minor";
}

const HIGH_IMPACT_PATTERNS = [
  /\$\d+/,          // prices
  /\bpric/i,        // pricing
  /\bcost/i,
  /\bfee/i,
  /\bhour/i,        // business hours
  /\bphone/i,       // contact info
  /\baddress/i,
  /\bemail/i,
  /\bclosed/i,      // availability
  /\bdiscontinued/i,
  /\bno longer/i,
  /\bunavailable/i,
];

// ---- Summary generation ----

function generateSummary(
  added: number,
  removed: number,
  modified: number,
  severity: ChangeSeverity,
  details: SectionDiff[],
): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} section${added > 1 ? "s" : ""} added`);
  if (removed > 0) parts.push(`${removed} section${removed > 1 ? "s" : ""} removed`);
  if (modified > 0) parts.push(`${modified} section${modified > 1 ? "s" : ""} modified`);

  const changeList = parts.join(", ");
  const severityLabel = severity === "major" ? "Major changes" : "Minor changes";

  // Add specific detail for the most significant change
  const mostChanged = details
    .filter((d) => d.type === "modified" && d.similarity !== null)
    .sort((a, b) => (a.similarity ?? 1) - (b.similarity ?? 1))[0];

  if (mostChanged?.heading) {
    return `${severityLabel}: ${changeList}. Most significant change in "${mostChanged.heading}".`;
  }

  return `${severityLabel}: ${changeList}.`;
}
