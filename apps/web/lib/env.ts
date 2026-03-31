export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
} as const;

export const hasSupabase = () => !!env.supabaseUrl && !!env.supabaseAnonKey;
export const hasOpenAI = () => !!env.openaiApiKey;
export const hasAnthropic = () => !!env.anthropicApiKey;
export const hasPinecone = () => !!env.pineconeApiKey;
export const hasStripe = () => !!env.stripeSecretKey;
export const hasUpstash = () => !!env.upstashRedisUrl;
export const isMockMode = () => !hasSupabase();
