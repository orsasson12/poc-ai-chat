/**
 * Splits knowledge content into ~500-token chunks at natural boundaries.
 */

const DEFAULT_MAX_CHARS = 2000; // ~500 tokens

export interface ContentChunk {
  text: string;
  index: number;
  heading: string | null;
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits content into chunks. Strategy depends on content type:
 * - Q&A: each Q/A pair is one chunk
 * - CSV: groups of rows with header context
 * - Text/HTML: paragraph and sentence boundary splitting
 */
export function chunkContent(
  content: string,
  type: string,
  title: string,
  maxChars = DEFAULT_MAX_CHARS,
): ContentChunk[] {
  if (!content || content.trim().length < 10) return [];

  if (type === "manual_qa") {
    return chunkQA(content, title);
  }

  return chunkText(content, title, maxChars);
}

/** Each Q/A pair becomes its own chunk. */
function chunkQA(content: string, title: string): ContentChunk[] {
  // Split on "Q:" patterns that start a new question
  const pairs = content.split(/(?=^Q:\s)/m).filter((p) => p.trim().length > 0);

  if (pairs.length === 0) {
    return [{ text: content.trim(), index: 0, heading: title }];
  }

  return pairs.map((pair, i) => ({
    text: pair.trim(),
    index: i,
    heading: title,
  }));
}

/** Split text at paragraph/sentence boundaries. */
function chunkText(content: string, title: string, maxChars: number): ContentChunk[] {
  const chunks: ContentChunk[] = [];

  // First split by markdown headings to preserve sections
  const sections = splitBySections(content);

  for (const section of sections) {
    const heading = section.heading || title;
    const text = section.text.trim();

    if (!text) continue;

    if (text.length <= maxChars) {
      chunks.push({ text, index: chunks.length, heading });
      continue;
    }

    // Split large sections by paragraphs
    const paragraphs = text.split(/\n\n+/);
    let current = "";

    for (const para of paragraphs) {
      if (current.length + para.length + 2 > maxChars && current.length > 0) {
        chunks.push({ text: current.trim(), index: chunks.length, heading });
        current = "";
      }

      if (para.length > maxChars) {
        // Push accumulated text first
        if (current.length > 0) {
          chunks.push({ text: current.trim(), index: chunks.length, heading });
          current = "";
        }
        // Split oversized paragraph by sentences
        const sentences = splitSentences(para);
        for (const sent of sentences) {
          if (current.length + sent.length + 1 > maxChars && current.length > 0) {
            chunks.push({ text: current.trim(), index: chunks.length, heading });
            current = "";
          }
          current += (current ? " " : "") + sent;
        }
      } else {
        current += (current ? "\n\n" : "") + para;
      }
    }

    if (current.trim()) {
      chunks.push({ text: current.trim(), index: chunks.length, heading });
    }
  }

  return chunks;
}

interface Section {
  heading: string | null;
  text: string;
}

function splitBySections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentText = "";

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (currentText.trim()) {
        sections.push({ heading: currentHeading, text: currentText });
      }
      currentHeading = headingMatch[1].trim();
      currentText = "";
    } else {
      currentText += line + "\n";
    }
  }

  if (currentText.trim()) {
    sections.push({ heading: currentHeading, text: currentText });
  }

  return sections.length > 0 ? sections : [{ heading: null, text: content }];
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}
