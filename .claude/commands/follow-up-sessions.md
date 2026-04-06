# Follow-Up Sessions Guide

What was built and what remains, organized by session priority.

## Current State (Scaffold Complete)

The full app scaffold is built with mock data. All dashboard pages, auth, chat iframe, API routes, safety pipeline, RAG pipeline, LLM providers, and widget source are in place. TypeScript compiles with 0 errors. Dev server runs at localhost:3000.

**19 commits on main branch.** No real services connected yet.

## Session 2: RAG Pipeline POC (Week 1 from PRD)

**Goal:** Prove the RAG pipeline works with real data — 85% accuracy on a real FAQ.

**What to do:**
1. Connect Supabase (create project, run schema migrations with `npx drizzle-kit push`)
2. Connect OpenAI (set API key)
3. Connect Pinecone (create index, set API key)
4. Write a test script that: takes a text file, chunks it, embeds it, stores in Pinecone, answers 10 questions
5. Test with a real business FAQ document
6. Tune chunking params if accuracy is below 85%

**Files to modify/create:**
- `lib/rag/embed.ts` — already has real OpenAI code, just needs key
- `lib/rag/retrieve.ts` — already has real Pinecone code, just needs key
- New: ingestion test script (can be a simple Node.js script)
- May need: `lib/ingestion/chunk.ts` and `lib/ingestion/extract.ts`

**Gate:** 85%+ accuracy on real FAQ content.

## Session 3: Ingestion Pipeline (Week 3 from PRD)

**Goal:** Business owner uploads a PDF, sees it processed, tests their assistant.

**What to do:**
1. Connect Inngest (create project, set keys)
2. Build 8-step Inngest worker functions:
   - `inngest/functions/ingest-document.ts`
   - `inngest/functions/ingest-url.ts`
3. Build text extractors:
   - `lib/ingestion/extract.ts` (PDF via pdf-parse, DOCX via mammoth, CSV, URL)
   - `lib/ingestion/chunk.ts` (400-token chunks, 200-char overlap, heading detection)
4. Wire up the dashboard upload UI to actually call `/api/ingest`
5. Add Supabase Realtime subscription for status updates in Knowledge Base page
6. Install: `npm install pdf-parse mammoth inngest`

**Files to create:**
- `inngest/functions/ingest-document.ts`
- `inngest/functions/ingest-url.ts`
- `apps/web/lib/ingestion/extract.ts`
- `apps/web/lib/ingestion/chunk.ts`

**Gate:** Upload real PDF, watch status go to active, ask 10 grounded questions.

## Session 4: Widget Deployment + WordPress (Week 4 from PRD)

**Goal:** A real website can embed the widget and have working conversations.

**What to do:**
1. Connect Cloudflare R2 (create bucket)
2. Compile `apps/widget/src/widget.ts` to plain JS
3. Upload `widget.js` to R2 with Worker serving it
4. Deploy the app to Vercel
5. Create the WordPress plugin (~60 lines PHP)
6. Test on an external website (not localhost)

**Files to create:**
- `apps/widget/build.js` — build script
- `wordpress/bizassist-ai.php` — WP plugin
- Cloudflare Worker script

**Gate:** Widget works on external website, 5 streaming messages grounded in uploaded content.

## Session 5: Billing + Analytics (Week 5 from PRD)

**Goal:** Charge customers, show analytics.

**What to do:**
1. Connect Stripe (create products/prices)
2. Wire Stripe webhook handler in `app/api/webhooks/stripe/route.ts`
3. Add usage metering to `/api/chat` (count conversations + tokens)
4. Wire analytics page to real data (replace mock with DB queries)
5. Add Sentry + Axiom for monitoring
6. Load test: 100 concurrent conversations, p95 < 3s

**Files to modify:**
- `app/api/webhooks/stripe/route.ts` — add subscription event handling
- `app/api/chat/route.ts` — add usage logging
- `app/(dashboard)/analytics/page.tsx` — wire to real data
- `app/(dashboard)/overview/page.tsx` — wire to real data

## Session 6: Hardening + Launch (Week 6 from PRD)

**Goal:** Production-ready for 10 pilot businesses.

**What to do:**
1. Write Supabase RLS policies for all tables
2. Write cross-tenant isolation CI tests
3. Add E2E Playwright tests for critical flows
4. Configure uptime monitoring
5. Verify GDPR deletion flow (delete tenant → confirm all data removed)
6. Set up Upstash Redis rate limiting
7. 48-hour soak test at 99.9% uptime

**P1 features (ship within 4 weeks post-launch):**
- Team member invitations (FR-20)
- Thumbs up/down feedback (FR-21) — UI already has placeholder
- Unanswered questions report (FR-23)
- After-hours behavior (FR-24)
- Human escalation with transcript (FR-25)
