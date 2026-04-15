/**
 * Authoritative list of sub-processors BizAssist uses to deliver the service.
 *
 * Kept as code, not DB rows, so every environment ships the exact same list and
 * changes are reviewable in version control. The dashboard renders this list
 * read-only; the generated DPA and privacy policy pull from it.
 *
 * When adding or removing an entry here, also bump DPA_VERSION in the DPA
 * template so owners are prompted to re-accept the updated agreement.
 */

export interface SubProcessor {
  id: string;
  name: string;
  purpose: string;
  location: string;       // primary processing region(s) — the controller needs this
  dataCategories: string[];
  url: string;
  /**
   * "eu" when the sub-processor offers a dedicated EU-region option BizAssist can pin to.
   * "transfer" when data transits out of the EU to fulfil the processing.
   */
  euResidency: "eu" | "transfer";
}

export const SUB_PROCESSORS: SubProcessor[] = [
  {
    id: "supabase",
    name: "Supabase",
    purpose: "Managed Postgres database, auth, and storage",
    location: "EU (Frankfurt) or US (configurable per deployment)",
    dataCategories: [
      "Tenant metadata",
      "Conversation transcripts",
      "Messages",
      "Knowledge base content",
      "Lead records",
    ],
    url: "https://supabase.com",
    euResidency: "eu",
  },
  {
    id: "pinecone",
    name: "Pinecone",
    purpose: "Vector database for semantic search over knowledge chunks",
    location: "EU (eu-west) or US (us-east) per namespace",
    dataCategories: ["Embedding vectors", "Chunk content metadata"],
    url: "https://pinecone.io",
    euResidency: "eu",
  },
  {
    id: "openai",
    name: "OpenAI",
    purpose: "Text embeddings and content moderation",
    location: "United States (per OpenAI DPA)",
    dataCategories: [
      "Customer messages sent for embedding",
      "Knowledge chunk text",
      "Moderation classification input",
    ],
    url: "https://openai.com",
    euResidency: "transfer",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    purpose: "Primary large language model for chat responses",
    location: "United States (per Anthropic DPA)",
    dataCategories: ["Customer messages included in prompts", "System prompts"],
    url: "https://anthropic.com",
    euResidency: "transfer",
  },
  {
    id: "stripe",
    name: "Stripe",
    purpose: "Subscription billing and payment processing",
    location: "EU / US (region depending on Stripe account configuration)",
    dataCategories: ["Billing contact", "Subscription and invoice metadata"],
    url: "https://stripe.com",
    euResidency: "eu",
  },
  {
    id: "vercel",
    name: "Vercel",
    purpose: "Application hosting and edge network",
    location: "EU / US (per deployment region)",
    dataCategories: ["Request logs", "TLS termination"],
    url: "https://vercel.com",
    euResidency: "eu",
  },
];

export const DPA_VERSION = "1.0";
