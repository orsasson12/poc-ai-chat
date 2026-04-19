export const MODELS = {
  primary: process.env.LLM_PRIMARY ?? "claude-sonnet-4-5",
  labeling: process.env.LLM_LABELING ?? "claude-haiku-4-5",
  summarize: process.env.LLM_SUMMARIZE ?? "claude-haiku-4-5",
} as const;
