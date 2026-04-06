# Tech Stack — Locked Decisions

Do not swap components without explicit approval. Every choice has architectural reasoning.

## Application Layer
- **Framework:** Next.js 15 App Router (API routes + dashboard + chat iframe in one repo)
- **Language:** TypeScript strict mode (catches tenant_id mixing at compile time)
- **UI:** Tailwind CSS + shadcn/ui (fast, consistent, no lock-in)
- **Validation:** Zod (runtime type safety on all API inputs)
- **ORM:** Drizzle ORM (lighter than Prisma, better TS inference)
- **Charts:** Recharts (lightweight, shadcn-compatible)
- **Theme:** next-themes (dark/light mode)

## Infrastructure
- **Auth + DB + Storage:** Supabase (Postgres + RLS + Auth + Storage)
- **Vector store:** Pinecone serverless (per-namespace tenant isolation)
- **Job queue:** Inngest (durable async jobs for ingestion)
- **Rate limiting:** Upstash Redis (serverless, edge-compatible)
- **Widget CDN:** Cloudflare R2 + Workers
- **Hosting:** Vercel
- **Payments:** Stripe (subscriptions + usage metering)
- **Errors:** Sentry
- **Logs:** Axiom (structured JSON, OpenTelemetry)

## AI Layer
- **LLM (simple):** GPT-4o-mini (~80% of queries)
- **LLM (complex):** GPT-4o (long/multi-part queries, low confidence)
- **LLM (failover):** Claude Sonnet 4.5
- **Embeddings:** OpenAI text-embedding-3-small (1536 dims)
- **Moderation:** OpenAI Moderation API
- **Temperature:** Fixed 0.2 (safety parameter, not tuning knob)
