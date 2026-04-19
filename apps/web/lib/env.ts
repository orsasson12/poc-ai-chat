export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  pineconeApiKey: process.env.PINECONE_API_KEY ?? "",
  pineconeIndex: process.env.PINECONE_INDEX ?? "bizassist-prod",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL ?? "",
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  canarySalt: process.env.CANARY_SALT ?? "dev-canary-salt",
  sentryDsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  sentryEnvironment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
  sentryTracesSampleRate: Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? (process.env.NODE_ENV === "production" ? "0.1" : "1.0"),
  ),
  axiomToken: process.env.AXIOM_TOKEN ?? "",
  axiomDataset: process.env.AXIOM_DATASET ?? "",
  axiomOrgId: process.env.AXIOM_ORG_ID ?? "",
  ragQueryRewriteEnabled: (process.env.RAG_QUERY_REWRITE_ENABLED ?? "false").toLowerCase() === "true",
  ragFreshnessHalfLifeDays: Number(process.env.RAG_FRESHNESS_HALF_LIFE_DAYS ?? "180"),
  ragFreshnessFloor: Number(process.env.RAG_FRESHNESS_FLOOR ?? "0.6"),
} as const;

export const hasDatabase = () => !!env.databaseUrl;
export const hasSupabase = () => !!env.supabaseUrl && !!env.supabaseAnonKey;
export const hasOpenAI = () => !!env.openaiApiKey;
export const hasAnthropic = () => !!env.anthropicApiKey;
export const hasPinecone = () => !!env.pineconeApiKey;
export const hasStripe = () => !!env.stripeSecretKey;
export const hasUpstash = () => !!env.upstashRedisUrl;
export const hasSentry = () => !!env.sentryDsn;
export const hasAxiom = () => !!env.axiomToken && !!env.axiomDataset;
export const isMockMode = () => !hasSupabase();
