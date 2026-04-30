export const MODELS = {
  // Default primary model is Haiku (~3x cheaper than Sonnet on both input and output
  // tokens at comparable quality for grounded RAG answers on short Hebrew/English
  // queries). Override via LLM_PRIMARY env var when a specific tenant or env needs
  // Sonnet for higher reasoning depth (long/multi-part queries, low confidence).
  primary: process.env.LLM_PRIMARY ?? "claude-haiku-4-5",
  labeling: process.env.LLM_LABELING ?? "claude-haiku-4-5",
  summarize: process.env.LLM_SUMMARIZE ?? "claude-haiku-4-5",
} as const;
