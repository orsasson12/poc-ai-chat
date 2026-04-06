# Add Real Service Integration

When adding a real service (replacing mock):

1. Copy `.env.example` to `.env.local` (if not done yet)
2. Add the service keys to `.env.local`
3. The app auto-detects keys via `lib/env.ts` — no code changes needed
4. Restart the dev server (`npm run dev` in apps/web)
5. Verify the feature works with real data

## Service Checklist — Go Live Order

### Phase 1: Core (required to go live)

- [ ] **Supabase** (auth + DB + storage)
  - Create project at supabase.com (Pro plan for PITR)
  - Get: project URL, anon key, service role key
  - Run `npx drizzle-kit push` to create tables from schema
  - Enable RLS policies on all tables (see `supabase/migrations/`)
  - Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **OpenAI** (embeddings + chat + moderation)
  - Create org at platform.openai.com (separate from personal)
  - Set `OPENAI_API_KEY`
  - Used by: embeddings (text-embedding-3-small), chat (gpt-4o-mini/gpt-4o), moderation API
  - Budget alert: set monthly spending limit

- [ ] **Pinecone** (vector store)
  - Create account at pinecone.io
  - Create serverless index: name=`bizassist-prod`, metric=`cosine`, dimensions=`1536`
  - Set `PINECONE_API_KEY`, `PINECONE_INDEX=bizassist-prod`

### Phase 2: Billing + Failover

- [ ] **Stripe** (billing)
  - Create products/prices in Stripe dashboard:
    - Starter: $49/mo, 500 conversations
    - Professional: $99/mo, 2,000 conversations
    - Business: $199/mo, 5,000 conversations
  - Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
  - Wire webhook handler in `app/api/webhooks/stripe/route.ts`

- [ ] **Anthropic** (failover LLM)
  - Create account at console.anthropic.com
  - Set `ANTHROPIC_API_KEY`
  - Used as automatic failover when OpenAI times out

### Phase 3: Infrastructure

- [ ] **Upstash Redis** (rate limiting)
  - Create database at upstash.com (serverless, edge-compatible)
  - Set `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - Enforces: 60 chat/min, 10 ingestion jobs/hour per tenant

- [ ] **Inngest** (job queue for ingestion)
  - Create project at inngest.com
  - Set `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
  - Need to build: `inngest/functions/ingest-document.ts` and `ingest-url.ts`

- [ ] **Cloudflare R2** (widget CDN)
  - Create R2 bucket + Worker at cloudflare.com
  - Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`
  - Upload compiled `widget.js` to R2

### Phase 4: Monitoring

- [ ] **Sentry** (error tracking)
  - Create project at sentry.io
  - Set `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`

- [ ] **Axiom** (structured logging)
  - Create dataset at axiom.co
  - Set `AXIOM_TOKEN`, `AXIOM_DATASET=bizassist`

### Phase 5: Deployment

- [ ] **Vercel** (hosting)
  - Connect GitHub repo to Vercel project
  - Set ALL env vars from `.env.local` in Vercel dashboard
  - Domain: set `NEXT_PUBLIC_APP_URL` to production URL

- [ ] **Domain** — decide before deployment (hardcoded in widget iframe src, CORS)
