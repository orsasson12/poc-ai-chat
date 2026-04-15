/**
 * Parses a structured CSV where each row is a card item (product, service, etc.).
 *
 * Required columns: card_type, name
 * Reserved columns: image → metadata.imageUrl, link → sourceUrl, description → content
 * All other columns become key-value pairs in metadata.fields
 *
 * Example CSV:
 *   card_type,name,description,image,price,duration,link
 *   product,Whitening Kit,Professional kit,https://img.com/1.jpg,$99,,https://buy.com
 *   service,Deep Cleaning,Thorough cleaning,https://img.com/2.jpg,$150,45 min,
 */

import { z } from "zod";

// ---- Known card types (extend as needed) ----

export const KNOWN_CARD_TYPES = [
  "product",
  "service",
  "team_member",
  "location",
  "link",
  "event",
] as const;

// ---- Suggested fields per card type (used by the form builder) ----

export const CARD_TYPE_FIELDS: Record<
  string,
  { label: string; key: string; placeholder: string }[]
> = {
  product: [
    { label: "Price", key: "price", placeholder: "e.g. $99" },
    { label: "Category", key: "category", placeholder: "e.g. Cosmetic" },
    { label: "SKU", key: "sku", placeholder: "e.g. WK-001" },
    { label: "In Stock", key: "in_stock", placeholder: "e.g. Yes" },
  ],
  service: [
    { label: "Price", key: "price", placeholder: "e.g. $150" },
    { label: "Duration", key: "duration", placeholder: "e.g. 45 minutes" },
    { label: "Category", key: "category", placeholder: "e.g. Dental" },
    { label: "Availability", key: "availability", placeholder: "e.g. Mon-Fri" },
  ],
  team_member: [
    { label: "Role", key: "role", placeholder: "e.g. Dentist" },
    { label: "Experience", key: "experience", placeholder: "e.g. 15 years" },
    { label: "Languages", key: "languages", placeholder: "e.g. English, Spanish" },
    { label: "Certification", key: "certification", placeholder: "e.g. ADA Board Certified" },
  ],
  location: [
    { label: "Address", key: "address", placeholder: "e.g. 123 Main St" },
    { label: "Phone", key: "phone", placeholder: "e.g. (555) 123-4567" },
    { label: "Hours", key: "hours", placeholder: "e.g. Mon-Fri 8am-6pm" },
  ],
  link: [
    { label: "URL", key: "url", placeholder: "e.g. https://booking.example.com" },
  ],
  event: [
    { label: "Date", key: "date", placeholder: "e.g. 2026-05-15" },
    { label: "Time", key: "time", placeholder: "e.g. 2:00 PM" },
    { label: "Location", key: "location", placeholder: "e.g. Main Office" },
  ],
};

export const CARD_TYPE_LABELS: Record<string, string> = {
  product: "Product",
  service: "Service",
  team_member: "Team Member",
  location: "Location",
  link: "Link",
  event: "Event",
};

// ---- CSV row validation ----

const rowSchema = z
  .object({
    card_type: z.string().min(1, "card_type is required"),
    name: z.string().min(1, "name is required"),
  })
  .passthrough();

// Columns that map to dedicated fields rather than metadata.fields
const RESERVED_COLUMNS = new Set(["card_type", "name", "image", "link", "description"]);

// ---- Types ----

export interface ParsedCard {
  cardType: string;
  name: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  description: string | null;
  fields: Record<string, string>;
  /** Text representation for LLM context / RAG embedding */
  content: string;
}

export interface CSVParseResult {
  cards: ParsedCard[];
  errors: { row: number; message: string }[];
}

// ---- CSV parser ----

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

export function parseStructuredCSV(csvContent: string): CSVParseResult {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return {
      cards: [],
      errors: [{ row: 0, message: "CSV must have a header row and at least one data row" }],
    };
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  if (!headers.includes("card_type")) {
    return { cards: [], errors: [{ row: 0, message: "Missing required column: card_type" }] };
  }
  if (!headers.includes("name")) {
    return { cards: [], errors: [{ row: 0, message: "Missing required column: name" }] };
  }

  const cards: ParsedCard[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = (values[j] ?? "").trim();
    }

    const validation = rowSchema.safeParse(rowObj);
    if (!validation.success) {
      errors.push({ row: i + 1, message: validation.error.issues[0].message });
      continue;
    }

    const cardType = rowObj.card_type;
    const name = rowObj.name;
    const imageUrl = rowObj.image || null;
    const sourceUrl = rowObj.link || null;
    const description = rowObj.description || null;

    // Everything that isn't a reserved column becomes a field
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(rowObj)) {
      if (RESERVED_COLUMNS.has(key) || !value) continue;
      fields[key] = value;
    }

    // Build a readable text block for the LLM / embedding
    const contentParts = [`${cardType.replace(/_/g, " ")}: ${name}`];
    if (description) contentParts.push(description);
    for (const [key, value] of Object.entries(fields)) {
      contentParts.push(`${key.replace(/_/g, " ")}: ${value}`);
    }

    cards.push({
      cardType,
      name,
      imageUrl,
      sourceUrl,
      description,
      fields,
      content: contentParts.join("\n"),
    });
  }

  return { cards, errors };
}
