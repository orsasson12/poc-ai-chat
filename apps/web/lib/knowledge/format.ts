/**
 * Formats raw knowledge content into structured text optimized for LLM context.
 * Handles CSV, plain text, and Q&A formats.
 */

interface ParsedKnowledge {
  businessInfo: string;
  qaPairs: string;
  policies: string;
  assistantConfig: string;
  raw: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function isCSV(content: string): boolean {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return false;
  const firstLine = lines[0].toLowerCase();
  return (
    firstLine.includes(",") &&
    (firstLine.includes("category") ||
      firstLine.includes("type") ||
      firstLine.includes("key") ||
      firstLine.includes("question"))
  );
}

export function formatKnowledgeForLLM(
  title: string,
  content: string,
  type: string,
): string {
  if (!content) return "";

  // Q&A items are already formatted
  if (type === "manual_qa") {
    return content;
  }

  // Try CSV parsing
  if (isCSV(content)) {
    return formatCSV(content);
  }

  // Plain text — return as-is with title
  return `## ${title}\n\n${content}`;
}

function formatCSV(content: string): string {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return content;

  const headers = parseCSVLine(lines[0]);
  const categoryIdx = headers.findIndex((h) => h.toLowerCase() === "category");
  const typeIdx = headers.findIndex((h) => h.toLowerCase() === "type");
  const keyIdx = headers.findIndex((h) => h.toLowerCase() === "key");
  const valueIdx = headers.findIndex((h) => h.toLowerCase() === "value");
  const notesIdx = headers.findIndex((h) => h.toLowerCase() === "notes");

  if (keyIdx === -1 || valueIdx === -1) {
    // Unknown CSV format — return as readable table
    return lines
      .slice(1)
      .map((line) => {
        const cols = parseCSVLine(line);
        return headers.map((h, i) => `${h}: ${cols[i] ?? ""}`).join(" | ");
      })
      .join("\n");
  }

  // Group by category
  const groups: Record<string, { key: string; value: string; type: string; notes: string }[]> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const category = categoryIdx >= 0 ? cols[categoryIdx] ?? "" : "GENERAL";
    const type = typeIdx >= 0 ? cols[typeIdx] ?? "" : "";
    const key = cols[keyIdx] ?? "";
    const value = cols[valueIdx] ?? "";
    const notes = notesIdx >= 0 ? cols[notesIdx] ?? "" : "";

    if (!key || !value) continue;

    if (!groups[category]) groups[category] = [];
    groups[category].push({ key, value, type, notes });
  }

  const sections: string[] = [];

  // Business Info
  if (groups["BUSINESS_INFO"]) {
    const info = groups["BUSINESS_INFO"];
    sections.push("## Business Information");
    const hours = info.filter((i) => i.type === "hours");
    const identity = info.filter((i) => i.type !== "hours");

    for (const item of identity) {
      sections.push(`- **${item.key.replace(/_/g, " ")}**: ${item.value}`);
    }

    if (hours.length > 0) {
      sections.push("\n### Opening Hours");
      for (const h of hours) {
        sections.push(
          `- **${h.key.charAt(0).toUpperCase() + h.key.slice(1)}**: ${h.value}`,
        );
      }
    }
  }

  // Q&A Pairs
  if (groups["QA_PAIR"]) {
    sections.push("\n## Frequently Asked Questions");
    for (const qa of groups["QA_PAIR"]) {
      sections.push(`\n**Q: ${qa.key}**\nA: ${qa.value}`);
    }
  }

  // Safety Rules
  if (groups["SAFETY_RULES"]) {
    sections.push("\n## Safety & Behavior Rules");
    const offLimits = groups["SAFETY_RULES"].filter((i) => i.type === "off_limits");
    const behaviors = groups["SAFETY_RULES"].filter((i) => i.type === "behavior");

    if (offLimits.length > 0) {
      sections.push("### Off-limits topics (never discuss):");
      for (const item of offLimits) {
        sections.push(`- ${item.value}`);
      }
    }

    if (behaviors.length > 0) {
      sections.push("### Special responses:");
      for (const item of behaviors) {
        sections.push(
          `- **${item.key.replace(/_/g, " ")}**: "${item.value}"`,
        );
      }
    }
  }

  // Assistant Config
  if (groups["ASSISTANT_CONFIG"]) {
    sections.push("\n## Assistant Configuration");
    for (const item of groups["ASSISTANT_CONFIG"]) {
      sections.push(
        `- **${item.key.replace(/_/g, " ")}**: ${item.value}`,
      );
    }
  }

  // Widget Config
  if (groups["WIDGET_CONFIG"]) {
    // Skip widget config — not relevant for chat context
  }

  // Any other categories
  for (const [cat, items] of Object.entries(groups)) {
    if (
      ["BUSINESS_INFO", "QA_PAIR", "SAFETY_RULES", "ASSISTANT_CONFIG", "WIDGET_CONFIG"].includes(cat)
    )
      continue;
    sections.push(`\n## ${cat.replace(/_/g, " ")}`);
    for (const item of items) {
      sections.push(`- **${item.key}**: ${item.value}`);
    }
  }

  return sections.join("\n");
}
