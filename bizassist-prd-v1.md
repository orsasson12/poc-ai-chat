# BizAssist AI — Product Requirements Document
**Version:** 1.0 — Conversation-derived MVP spec
**Date:** March 31, 2026
**Status:** Ready for development
**Author:** Derived from founder + AI working session

---

## Document purpose

This PRD captures every decision made across our full product design session. It is not a generic template — every requirement, stack choice, and architectural constraint here was discussed, debated, and agreed. The intended readers are the developer(s) building this product. No decision in this document should need re-litigating; the reasoning is included inline so future contributors understand the why, not just the what.

---

## Table of contents

1. Product vision and scope
2. What we are building (and what we are not)
3. The three core flows
4. Technical stack — chosen and locked
5. AI model strategy
6. Data delivery — iframe architecture
7. Knowledge ingestion pipeline
8. Chat API and RAG pipeline
9. Safety system — five layers
10. Multi-tenant isolation model
11. Database schema
12. Widget and embedding strategy (WordPress, Wix, etc.)
13. Dashboard — business owner experience
14. Functional requirements by priority
15. Non-functional requirements
16. Build sequence — week by week
17. Open items — what the founder must decide and provide
18. How to improve results over time

---

## 1. Product vision and scope

BizAssist AI is a multi-tenant SaaS platform that lets any business owner create, configure, and deploy an AI chat assistant powered exclusively by their own approved content. The assistant is embedded on the business's website (or app) via a single script tag that loads an iframe hosted entirely on our domain.

The product has one non-negotiable rule: **the assistant answers only from what the business owner explicitly provided**. It does not hallucinate, does not draw on general internet knowledge, does not leak one tenant's data to another, and does not comply with attempts to manipulate it into behaving differently.

The MVP targets non-technical business owners — dental practices, e-commerce stores, consultants, salons, gyms — who can set up a working assistant in under 30 minutes without writing code.

---

## 2. What we are building and what we are not

### In scope for MVP

- Web-based dashboard for business owners to manage their assistant
- Knowledge base manager supporting PDF, DOCX, TXT, CSV file uploads and URL imports
- Async ingestion pipeline: extract text → chunk → embed → store in Pinecone
- Chat API: RAG retrieval from tenant-isolated Pinecone namespace + grounded LLM generation
- Embeddable widget: a vanilla JS script tag that loads an iframe hosted on our domain
- Five-layer safety system: injection detection, content moderation, PII stripping, output validation, audit logging
- Streaming responses (SSE) from the API to the iframe UI
- Real-time ingestion status in the dashboard via Supabase Realtime
- WordPress plugin (PHP, ~60 lines, distributable on WP Plugin Directory)
- Stripe billing: subscription management and per-conversation usage metering
- Analytics dashboard: conversation volume, resolution rate, CSAT, unanswered questions, security events

### Explicitly out of scope for MVP

- Voice / phone channel
- WhatsApp, Messenger, or any channel other than web chat
- Proactive / outbound messaging
- Agentic actions (booking appointments, processing orders)
- Multilingual support (English only at launch)
- Per-tenant LLM fine-tuning
- Self-hosted / on-premise deployment
- Mobile SDK (React Native)
- The assistant learning from conversations automatically

---

## 3. The three core flows

There are exactly three flows in this product. Everything else is scaffolding around them.

### Flow A — ingestion (business owner, happens once per document)

The business owner uploads content through the dashboard. This triggers an async Inngest job that extracts raw text from the file or URL, splits it into semantic chunks of ~400 tokens with 50-token overlap, generates embeddings using OpenAI text-embedding-3-small, and upserts those vectors into a Pinecone namespace scoped to this tenant's ID. The chunk text is also saved to Postgres for display in the dashboard. Status progresses: `pending → processing → active`. The assistant does not return answers from a knowledge item until it reaches `active`.

### Flow B — chat (end customer, happens on every message)

The end customer types a message in the chat widget (an iframe on the business's website). The iframe calls `POST /api/chat` with the message, assistantId, sessionId, and recent history. The API resolves the assistantId to a tenantId, runs the five-layer safety check, embeds the cleaned query, retrieves the top 5 most relevant chunks from that tenant's Pinecone namespace, builds a grounded system prompt from those chunks, calls the LLM with temperature 0.2, validates the output, and streams the response back via SSE. The entire round trip from user pressing send to first token appearing on screen must be under 3 seconds (p95).

### Flow C — widget delivery (end customer's browser, happens on page load)

The customer's website loads `widget.js` from our Cloudflare R2 CDN via a `<script>` tag. The script reads the `data-assistant-id` attribute, creates a floating chat bubble, and on click creates an `<iframe>` pointing to `https://app.bizassist.ai/chat/[assistantId]`. All API calls happen from inside this iframe — our domain, our code, our API keys. The customer's website never directly contacts our API. The iframe is sandboxed with `allow-scripts allow-forms allow-same-origin`.

---

## 4. Technical stack — chosen and locked

Every decision below was made deliberately. Do not swap components without revisiting the architectural reasoning.

### Application layer

| Component | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 App Router | API routes + React dashboard + chat iframe in one repo. Edge runtime for config endpoints. |
| Language | TypeScript strict mode | Catches tenant_id mixing bugs at compile time. Non-negotiable for multi-tenant. |
| UI components | Tailwind CSS + shadcn/ui | Fast to build, consistent design, no proprietary component lock-in. |
| Form validation | Zod | Runtime type safety on all API inputs. Paired with TypeScript for end-to-end safety. |
| ORM | Drizzle ORM | Lighter than Prisma, better TypeScript inference, works well with Supabase. |

### Infrastructure

| Component | Choice | Reason |
|---|---|---|
| Auth + Database + Storage | Supabase | Postgres + Row Level Security + Auth + Storage in one service. RLS enforces tenant isolation at DB engine level — not just application code. |
| Vector store | Pinecone (serverless) | Per-namespace isolation is first-class. Deleting a namespace guarantees complete data removal (critical for GDPR). Free tier covers early development. |
| Job queue | Inngest | Durable, retryable async job execution for ingestion pipeline. No infra to manage. Dashboard shows every step. |
| Rate limiting / sessions | Upstash Redis | Serverless Redis, edge-compatible. Used for per-tenant rate limiting and session tokens. |
| Widget CDN | Cloudflare R2 + Workers | widget.js served from the edge globally. Sub-50ms load time anywhere. |
| App hosting | Vercel | Next.js native. Serverless functions for API routes. Edge runtime for config endpoints. |
| Payments | Stripe | Subscriptions + usage-based metering (per conversation billed monthly). |
| Error monitoring | Sentry | Error tracking, performance monitoring, session replay for dashboard debugging. |
| Log management | Axiom | Structured JSON logs, OpenTelemetry traces across the RAG pipeline. |

### AI layer

| Component | Choice | Reason |
|---|---|---|
| Primary LLM (simple queries) | GPT-4o-mini | Handles ~80% of business Q&A at 1/15th the cost of GPT-4o. Fast (800ms avg). |
| Primary LLM (complex queries) | GPT-4o | Used when query is >120 chars, multi-part, or retrieval confidence is below 0.72. |
| LLM failover | Anthropic Claude Sonnet 4.5 | Provider-diversity failover. Best instruction-following of all alternatives. Different infrastructure from OpenAI. |
| Embeddings | OpenAI text-embedding-3-small | 1536 dimensions. Must be the same model for ingestion and query — they must share the same vector space. |
| Content moderation | OpenAI Moderation API | Free. Multi-category (hate, harassment, self-harm, sexual, violence). Applied to all inputs. |

### Monorepo structure

```
bizassist/
├── apps/
│   ├── web/                      Next.js app (dashboard + API + chat iframe)
│   │   ├── app/
│   │   │   ├── (auth)/           Login, signup, password reset
│   │   │   ├── (dashboard)/      Protected: knowledge, analytics, settings, security
│   │   │   ├── chat/[id]/        The chat iframe page — loaded inside the widget
│   │   │   └── api/
│   │   │       ├── chat/         POST — main conversation endpoint
│   │   │       ├── ingest/       POST — trigger ingestion, DELETE — remove item
│   │   │       ├── widget/[id]/config/   GET — public config (edge cached)
│   │   │       └── webhooks/stripe/      POST — billing events
│   │   └── lib/
│   │       ├── rag/              embed.ts, retrieve.ts, generate.ts, validate.ts
│   │       ├── ingestion/        extract.ts, chunk.ts
│   │       ├── safety/           injection.ts, moderation.ts, pii.ts, canary.ts, index.ts
│   │       ├── llm/              providers.ts (OpenAI + Anthropic), prompts.ts
│   │       └── db/               client.ts, queries/
│   └── widget/                   Vanilla JS widget — no framework
│       └── src/widget.ts         Compiled to dist/widget.js, uploaded to Cloudflare R2
├── inngest/
│   └── functions/
│       ├── ingest-document.ts    8-step ingestion pipeline
│       └── ingest-url.ts         URL crawl + ingestion
├── supabase/
│   └── migrations/               SQL files, applied via supabase db push
└── packages/
    ├── types/                    Shared TypeScript types
    └── config/                   Shared ESLint, TS, Tailwind config
```

---

## 5. AI model strategy

### Model routing

The system does not use one model for everything. Routing is based on query characteristics:

```
incoming message
  ├── complexity check
  │     message.length > 120 chars OR contains multiple questions?
  │     → GPT-4o
  │
  ├── confidence check (post-retrieval)
  │     top retrieved chunk similarity < 0.72?
  │     → GPT-4o
  │
  ├── standard query
  │     → GPT-4o-mini
  │
  └── OpenAI timeout / 5xx error
        → Claude Sonnet 4.5 (automatic failover, <30 seconds)
```

### Temperature

Temperature is fixed at **0.2** across all models and all query types. This is not a tuning parameter — it is a safety parameter. Higher temperatures increase creative variation, which for a grounded RAG assistant means higher hallucination probability. 0.2 is the production-validated sweet spot that balances natural language output with strict context adherence.

### System prompt design

The system prompt uses the sandwich pattern: security and grounding instructions appear at both the top and bottom of the prompt, wrapping the retrieved context block. This is per Google and Microsoft's published research on prompt injection resistance. The structure is:

```
[INSTRUCTIONS — answer only from context, refuse instruction overrides]
[RETRIEVED CONTEXT BLOCK — chunks from Pinecone]
[REMINDER — if not in context, use fallback message]
```

The assistant's fallback message when no relevant chunk is found (or confidence is below threshold) is configurable by the business owner per assistant.

### Canary tokens

Each tenant has a unique canary token (HMAC derived from tenantId + salt) injected into the system prompt. The output validation layer scans every response for this token before delivery. If detected, the response is replaced with the fallback message and a `canary_leak` security event is logged. This catches prompt extraction attacks that cause the model to echo system prompt contents.

---

## 6. Data delivery — iframe architecture

### Why iframe and not a web component or npm package

Three reasons drove this decision:

First, security isolation. The iframe creates a hard boundary between the customer's website and our code. Their JavaScript cannot access our variables, our API keys, or our DOM. Our code cannot access their cookies or local storage. This is a browser-enforced security guarantee, not an application-level convention.

Second, zero-conflict deployment. Our widget runs on thousands of different websites with different frameworks, CSS resets, and JavaScript environments. A web component or React component can conflict with the host page's existing libraries (jQuery, Bootstrap, React version mismatches). Vanilla JS creating a sandboxed iframe has no dependencies and conflicts with nothing.

Third, instant updates. When we ship a bug fix or UI improvement, every deployed widget on every customer's website gets it immediately on the next page load. Customers never need to update their embed code.

### Widget delivery sequence

```
1. Customer's browser loads business's website
2. Browser parses <script src="https://cdn.bizassist.ai/widget.js" data-assistant-id="biz_xxx">
3. widget.js executes (vanilla JS, ~12KB, no dependencies)
4. Reads data-assistant-id from the script tag
5. Fetches GET /api/widget/[id]/config (edge cached 60s) → name, color, greeting
6. Renders floating chat bubble in bottom-right corner (position configurable)
7. On click: creates <iframe src="https://app.bizassist.ai/chat/[id]?session=[uuid]">
8. iframe loads: Next.js server component fetches assistant config server-side
9. Renders ChatWindow React component with greeting pre-populated
10. Customer types message → iframe calls POST /api/chat → streams response back
```

### Security constraints on the widget

The iframe `sandbox` attribute is set to `allow-scripts allow-forms allow-same-origin`. This prevents the iframe from navigating the top-level window, opening popups, or accessing the host page's origin. The `postMessage` event listener in `widget.js` validates `event.origin === 'https://app.bizassist.ai'` before processing any message. This prevents malicious host pages from spoofing close or resize events.

### Embedding instructions per platform

| Platform | Method | Notes |
|---|---|---|
| Any HTML site | Paste `<script>` before `</body>` | Works universally |
| WordPress | Plugin or Insert Headers and Footers | Plugin distributed via WP Plugin Directory |
| Wix | Settings → Custom Code → Add to Body | Requires paid Wix plan |
| Shopify | Themes → Edit code → theme.liquid | Before `</body>` tag |
| Squarespace | Settings → Advanced → Code Injection → Footer | |
| Webflow | Project Settings → Custom Code → Footer | |
| React / Vue / Next.js app | `<script>` in index.html or `useEffect` with dynamic script append | |

### WordPress plugin specification

The plugin is a single PHP file, distributable on the WordPress Plugin Directory. It adds one settings page under Settings → BizAssist AI where the business owner pastes their Assistant ID. It injects the widget script tag via the `wp_footer` action hook. The plugin has no npm dependencies, no build step, and no admin UI beyond the single settings field. Total code: ~60 lines of PHP.

---

## 7. Knowledge ingestion pipeline

### Supported input types (MVP)

| Type | Accepted formats | Max size | Processing |
|---|---|---|---|
| Document upload | PDF, DOCX, TXT, CSV | 50MB per file | Supabase Storage → Inngest job |
| URL import | Any public HTTP/HTTPS URL | Single page | Inngest job → fetch → HTML strip |
| Manual Q&A | Form in dashboard | Unlimited pairs | Inline processing |
| Structured data | Business hours, location, services, contact — form fields | — | Pre-formatted text, same pipeline |

### Eight-step Inngest worker

Every ingestion job — regardless of content type — runs through the same eight steps. Inngest executes each step independently, meaning a failure at step 5 retries only from step 5, not from the beginning.

```
Step 1: mark-processing     → knowledge_items.status = 'processing'
Step 2: extract-text        → download file / fetch URL → raw text string
Step 3: chunk-text          → split into ~400-token chunks, 50-char overlap
Step 4: delete-old-vectors  → remove existing Pinecone vectors for this item (re-ingestion support)
Step 5: embed-chunks        → OpenAI text-embedding-3-small, batches of 100
Step 6: upsert-to-pinecone  → index.namespace(tenantId).upsert(), batches of 100
Step 7: save-chunk-metadata → INSERT chunk rows to Postgres (id, content, token_count, heading)
Step 8: mark-active         → knowledge_items.status = 'active', chunk_count = N
```

### Text extraction per file type

**PDF:** `pdf-parse` with custom page renderer that preserves line breaks based on vertical position changes. Falls back to basic extraction if custom renderer fails. No OCR in MVP — scanned PDFs with no text layer will return empty and the item will be marked with a user-visible error message.

**DOCX:** `mammoth` library, `extractRawText` method. Returns clean plain text without formatting markup.

**CSV:** Detects if columns are named `question`/`answer` — if so, formats as Q&A pairs. Otherwise joins rows as plain text.

**URL:** `fetch` with 10-second timeout and a legitimate User-Agent header. Strips `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` elements. Converts block elements to newlines. Decodes HTML entities. Collapses whitespace.

**TXT / manual Q&A / structured:** Already plain text, passed directly to chunker.

### Chunking strategy

Target chunk size: **400 tokens** (~1,600 characters). Hard ceiling: **600 tokens**. Overlap between adjacent chunks: **200 characters** (not tokens — character overlap is more predictable).

The chunker splits by double newlines (paragraph boundaries) first. If a paragraph is under the hard ceiling, it becomes one chunk. If it exceeds the ceiling, it is split by sentence boundaries with overlap applied at each split point. Headings are detected (markdown `#` prefix or short ALL-CAPS lines) and stored as metadata for each chunk — this helps the LLM understand document structure when answering.

The overlap is the most important parameter for answer quality. It exists because the answer to a question sometimes spans a chunk boundary — the question is at the bottom of one chunk, the answer at the top of the next. Overlap ensures the complete answer appears in at least one chunk.

### Re-ingestion

When a business owner updates an existing document or re-imports a URL, the system must delete the old vectors before creating new ones. The Inngest worker's step 4 handles this. In Pinecone, deletion is by metadata filter (`knowledgeItemId` field) on the paid tier, or by querying for IDs then deleting by ID on the free tier. Postgres chunk rows are deleted with a simple `DELETE WHERE knowledge_item_id = ?`.

### Real-time status updates

The dashboard subscribes to Postgres changes via Supabase Realtime on the `knowledge_items` table. When the Inngest worker updates `status` from `processing` to `active`, the dashboard updates instantly without a page refresh. The business owner sees the chunk count appear next to the item name, confirming how many searchable pieces their document produced.

---

## 8. Chat API and RAG pipeline

### Request validation

Every `POST /api/chat` request is validated with Zod before any processing:
- `assistantId`: UUID string, required
- `message`: string, required, max 1000 characters
- `sessionId`: string, required, min 8 characters
- `history`: array of `{role, content}` objects, max 20 items, optional

Any validation failure returns 400 immediately with no LLM call made.

### Tenant resolution

The API looks up the `assistantId` in the `assistants` table using the service role client (which bypasses RLS). The result gives us `tenant_id`, `name`, `fallback_msg`, `confidence_threshold`, `tone`, and `is_active`. If no active assistant is found, the API returns 404. The `tenantId` is what scopes every downstream operation — embedding retrieval, conversation logging, usage metering.

### Safety pipeline (input)

Applied in order before any RAG processing:

1. **Injection classifier** — regex patterns for 20+ known injection phrases plus heuristic scoring for ambiguous cases. If score exceeds `INJECTION_CLASSIFIER_THRESHOLD` (default 0.80), return safe fallback immediately and log a `prompt_injection` security event.
2. **Content moderation** — OpenAI Moderation API. If flagged, return category-appropriate response (de-escalation for abuse, crisis resources for self-harm content) and log event.
3. **PII stripping** — regex patterns for email, phone, credit card, SSN, IP. Detected PII is replaced with `[EMAIL]`, `[PHONE]` etc. before the message is sent to OpenAI. Original message (with PII) is logged in Postgres for the business owner's conversation log. The cleaned version is what gets embedded and sent to the LLM.

### Embedding

The cleaned user message is embedded using `openai.embeddings.create()` with `text-embedding-3-small`. The same model was used at ingestion time — they must match. The resulting 1536-dimension vector is used to query Pinecone.

### Retrieval

```typescript
index.namespace(tenantId).query({
  vector: queryEmbedding,
  topK: 5,
  includeMetadata: true,
  includeValues: false,
})
```

Results are filtered to only those with `score >= assistant.confidence_threshold` (default 0.65). If zero chunks pass the threshold, the system skips the LLM call entirely and returns the fallback message directly. This is the primary anti-hallucination mechanism — the model is never asked to answer a question it has no grounded context for.

### Prompt construction

The system prompt is built from four parts assembled in order:

1. Identity and behaviour instructions (who the assistant is, what it is allowed to do)
2. The canary token injection
3. The context block — retrieved chunks formatted as numbered sources with relevance percentages
4. The closing reminder (re-state the fallback instruction)

The history array (last 8 turns) is included as user/assistant message pairs between the system prompt and the current user message. This maintains conversational context without exceeding context window limits.

### Model selection

```typescript
function chooseModel(message: string, chunks: RetrievedChunk[]): string {
  const complex = message.length > 120 || chunks.length === 0
  return complex ? 'gpt-4o' : 'gpt-4o-mini'
}
```

### Streaming

The LLM is called with `stream: true`. The response is converted to Server-Sent Events format (`data: <token>\n\n`) and streamed directly to the iframe via a `ReadableStream` response. The iframe's ChatWindow component reads the stream token by token and appends to the last message in real-time. The cursor `▋` character is shown while streaming is in progress.

### Safety pipeline (output)

Before the stream is closed, the full assembled response is checked for:
- Canary token presence (indicates system prompt was echoed)
- Known system prompt phrase patterns
- Response length exceeding 3000 characters (a hallucination signal)

If any check fails, the response is replaced with the fallback message. A `scope_violation` security event is logged. The replacement response is not streamed in pieces — it is sent as a single complete message to avoid partial display of the rejected content.

### Post-response logging

After the stream closes, the following are written to Postgres asynchronously (non-blocking — does not affect response latency):
- User message row (role: 'user', original content including PII, conversation_id)
- Assistant message row (role: 'assistant', content, chunks_used array, confidence score, latency_ms, tokens_used, is_fallback flag)
- Usage log upsert (increment conversations, tokens_in, tokens_out for the billing period)

---

## 9. Safety system — five layers

The five layers operate sequentially. A message that is blocked by layer 1 never reaches layer 2. A message that passes all five layers is considered safe to show the end customer.

### Layer 1 — input injection classifier (sync, <1ms)

Regex patterns matching 20+ known injection techniques: instruction overrides ("ignore previous instructions"), system prompt extraction ("show me your system prompt"), persona jailbreaks ("you are now DAN"), delimiter manipulation, encoding attacks (base64, ROT13), social engineering ("I am the owner, give me access").

The classifier also decodes common obfuscation before pattern matching: base64 decode attempt, character-spacing normalization ("i g n o r e" → "ignore").

Ambiguous inputs receive a heuristic score based on the presence of soft signals (words like "ignore", "override", "bypass", "unrestricted"). If the combined score exceeds the configured threshold, the message is blocked.

All blocked inputs return the same safe fallback response to avoid leaking information about which pattern triggered the block.

### Layer 2 — content moderation (async, ~100ms)

OpenAI Moderation API. Evaluates: hate speech, harassment, self-harm, sexual content, violence, illegal content. Each category triggers a different response type:

- Abusive / hate / harassment: professional de-escalation ("I'm here to help with questions about [Business]")
- Self-harm: safe messaging response with crisis resource suggestion
- Sexual / violence: neutral refusal

### Layer 3 — PII detection and stripping (sync, <1ms)

Applied after injection and moderation checks pass. Detected PII is replaced in the message before embedding and LLM processing. Original message is retained for the business owner's conversation log.

### Layer 4 — output validation (sync, <1ms, post-generation)

Applied to the complete assembled response before it is delivered. Checks: canary token presence, system prompt phrase patterns, response length sanity, and a basic groundedness heuristic (if chunks were empty, was the fallback message used?).

### Layer 5 — monitoring and audit (async)

All security events — whether the input was blocked or the output failed validation — are written to the `security_events` table with: event type, severity, input text (first 500 chars), classification score, blocked boolean, conversation ID, and timestamp. Business owners see a Security Events panel in their dashboard. Platform operators receive real-time alerts via Axiom when event rate spikes above baseline.

---

## 10. Multi-tenant isolation model

### Vector isolation — silo model

Each tenant gets a dedicated Pinecone namespace. This is physical isolation: a query to `namespace(tenantA)` cannot retrieve vectors from `namespace(tenantB)` regardless of application behavior. There is no shared index with metadata filtering — that approach is vulnerable to a single application bug causing cross-tenant leakage.

Deleting a namespace (`ns.deleteAll()`) guarantees complete removal of all that tenant's vectors. This is called when a business owner deletes their account (GDPR right to erasure).

### Database isolation — pool with row-level security

All tenants share a PostgreSQL database. Every table has a `tenant_id` column. Row Level Security policies are defined at the database engine level — not in application code. Even if application code has a bug that omits a WHERE clause, the RLS policy prevents the query from returning another tenant's rows.

The chat API uses the service role client (which bypasses RLS) but always includes an explicit `.eq('tenant_id', resolvedTenantId)` filter on every query. This is enforced as a code review checklist item.

### Cross-tenant access tests in CI

The CI pipeline includes integration tests that attempt to read Tenant B's data using Tenant A's credentials. Any successful cross-tenant read fails the build and blocks deployment. These tests run on every push to main.

### Rate limiting per tenant

Per-tenant rate limits are enforced at the API gateway level via Upstash Redis. Defaults: 60 chat requests per minute, 10 ingestion jobs per hour. Tenants exceeding their limits receive 429 responses with `Retry-After` headers. This prevents denial-of-wallet attacks where a malicious actor floods an assistant with expensive requests to inflate the business owner's usage costs.

---

## 11. Database schema — key tables

### tenants
`id, owner_id (→ auth.users), name, slug, plan, status, stripe_customer_id, created_at`

### assistants
`id, tenant_id, name, greeting, tone, fallback_msg, escalation_email, escalation_webhook, widget_color, widget_position, is_active, confidence_threshold (default 0.65), created_at`

### knowledge_items
`id, tenant_id, assistant_id, type (document|url|manual_qa|structured), title, content, source_url, file_path, file_size, status (pending|processing|active|error|paused), chunk_count, error_msg, created_at`

### chunks
`id, tenant_id, knowledge_item_id, pinecone_id, content, token_count, chunk_index, heading`

### conversations
`id, tenant_id, assistant_id, session_id, started_at, ended_at, message_count, escalated, satisfaction (-1|1)`

### messages
`id, conversation_id, tenant_id, role (user|assistant), content, chunks_used (uuid[]), confidence (numeric), latency_ms, tokens_used, is_fallback`

### security_events
`id, tenant_id, conversation_id, event_type, severity, input_text, classification_score, blocked, created_at`

### tenant_members
`id, tenant_id, user_id, role (owner|admin|manager|viewer), invited_by, accepted_at`

### usage_logs
`id, tenant_id, period_start (date), conversations, tokens_in, tokens_out`

All tenant-scoped tables have RLS enabled. All tables have appropriate indexes on `tenant_id` + primary sort column.

---

## 12. Widget and embedding strategy

### widget.js specification

- Vanilla TypeScript compiled to plain JavaScript. Zero npm dependencies in the output bundle.
- Target bundle size: under 15KB minified and gzipped.
- Reads configuration from `data-*` attributes on the script tag: `data-assistant-id` (required), `data-color` (optional override), `data-position` (optional: bottom-right, bottom-left).
- Generates a session ID on first load, persists it in `sessionStorage` for the duration of the browser session.
- Fetches assistant config from the edge-cached `/api/widget/[id]/config` endpoint before rendering the bubble. If the fetch fails or returns a non-200, the widget renders nothing (silent failure — does not break the host page).
- On bubble click: creates the iframe element, sets `src`, appends to `document.body`. The iframe is created lazily (not on page load) to avoid unnecessary network requests.
- Listens for `postMessage` events from the iframe for close and resize signals. Validates `event.origin` before processing.

### Cloudflare deployment

`widget.js` is uploaded to a Cloudflare R2 bucket and served via a Cloudflare Worker with the following response headers: `Cache-Control: public, max-age=3600`, `Content-Type: application/javascript`. The Worker adds `Access-Control-Allow-Origin: *` to support loading from any customer domain.

On each production deployment, a new `widget.js` is uploaded to R2. The Worker is updated to serve the new file. The cache TTL of 1 hour means all active widgets get the new version within one hour of deployment.

---

## 13. Dashboard — business owner experience

### Pages and their purpose

**Overview (home):** Real-time metrics cards — total conversations today/week/month, resolution rate (% where `is_fallback = false`), CSAT (average satisfaction score), unanswered questions count. A "Health Score" composite (accuracy + engagement + coverage). Alert section for knowledge items in error state and recent security events.

**Knowledge base:** Full list of knowledge items with status indicators and chunk counts. Upload controls for files and URLs. Manual Q&A entry form. Inline error messages for failed items with actionable descriptions ("This PDF appears to be scanned. Please export it as a text-based PDF and re-upload.").

**Conversations:** Full conversation log filterable by date range, satisfaction rating, escalation status, and flagged security events. Each conversation shows the full transcript, which chunks were retrieved for each response (expandable), confidence scores, and latency. Business owners can annotate conversations and mark them for knowledge base review.

**Analytics:** Charts for conversation volume over time, resolution rate trend, top 10 most asked questions, unanswered questions grouped by similarity, CSAT trend. Filterable by assistant and date range.

**Settings:** Assistant configuration (name, greeting, tone, fallback message, escalation method), widget appearance (color, position, branding), team member management, API key generation, billing and plan management.

**Security:** Security events log with event type, severity, input preview (truncated for privacy), and blocked status. Aggregate counts by event type for the current period.

### Real-time behavior

Knowledge item status updates appear immediately via Supabase Realtime without page refresh. Conversation count on the Overview page updates in real-time as new conversations come in. Security event alerts appear as toast notifications when high-severity events are logged.

---

## 14. Functional requirements by priority

### P0 — MVP launch blockers

| ID | Requirement |
|---|---|
| FR-01 | Business owner can sign up with email/password or Google SSO |
| FR-02 | Business owner can create an assistant with name, greeting, tone, and fallback message |
| FR-03 | Business owner can upload PDF, DOCX, TXT, CSV files (max 50MB each) |
| FR-04 | Business owner can import a URL by pasting it |
| FR-05 | Business owner can add manual Q&A pairs via a form |
| FR-06 | Ingestion pipeline processes uploads and marks items active within 5 minutes |
| FR-07 | Business owner can see real-time ingestion status (pending/processing/active/error) |
| FR-08 | Business owner can preview their assistant in a test chat before going live |
| FR-09 | Business owner can copy the embed script tag from the dashboard |
| FR-10 | Widget loads on any website via script tag without code changes to the host site |
| FR-11 | Chat responses are grounded exclusively in uploaded knowledge content |
| FR-12 | Assistant returns configurable fallback message when no relevant content is found |
| FR-13 | All five safety layers are active on every conversation |
| FR-14 | Responses stream token by token (not returned as a single block) |
| FR-15 | Business owner can view conversation logs in the dashboard |
| FR-16 | Business owner can pause their assistant (single toggle, takes effect immediately) |
| FR-17 | Business owner can delete a knowledge item (removes vectors from Pinecone within 60 seconds) |
| FR-18 | Stripe billing is integrated — plans enforced, overage metered |
| FR-19 | WordPress plugin available for installation |

### P1 — ship within 4 weeks of MVP launch

| ID | Requirement |
|---|---|
| FR-20 | Business owner can invite team members with Manager or Viewer roles |
| FR-21 | End customer can submit thumbs up/down feedback on each response |
| FR-22 | Analytics dashboard with conversation volume, resolution rate, CSAT, top questions |
| FR-23 | Unanswered questions report showing queries that triggered fallback, grouped by theme |
| FR-24 | Business owner can configure after-hours behavior (hide widget / show offline message) |
| FR-25 | Human escalation: "Talk to a human" button passes full transcript to configured email or webhook |

### P2 — roadmap (post-validation)

| ID | Requirement |
|---|---|
| FR-26 | URL crawler that imports all pages from a domain (up to 100 pages) |
| FR-27 | Shopify plugin |
| FR-28 | npm package / React component SDK for developer customers |
| FR-29 | REST API with API key auth for headless integrations |
| FR-30 | Multiple assistants per tenant (on higher plans) |
| FR-31 | OCR for scanned PDFs |
| FR-32 | Multilingual support (Spanish first) |

---

## 15. Non-functional requirements

### Performance

| Metric | Target | Measurement |
|---|---|---|
| Chat response — time to first token | < 1.5s (p50), < 3s (p95) | APM on `/api/chat` |
| Chat response — full response complete | < 5s (p95) | SSE stream timing |
| Widget load time | < 1s on 4G | Synthetic monitoring from 3 regions |
| Config endpoint latency | < 100ms (p95, edge cached) | Cloudflare analytics |
| Knowledge ingestion | < 5 minutes from upload to active | Inngest step timing |
| Dashboard page load | < 2s (p95) | Vercel Analytics |

### Reliability

| Metric | Target |
|---|---|
| Platform uptime | 99.9% (max 8.76 hrs downtime/year) |
| LLM provider failover time | < 30 seconds automatic failover to Claude |
| Data durability | 99.999999999% (Supabase + Pinecone replication) |
| RPO (recovery point objective) | < 1 hour (Supabase PITR) |
| RTO (recovery time objective) | < 4 hours |
| Zero cross-tenant data incidents | Enforced by architecture, verified by CI tests |

### Security

- MFA enforced on all business owner accounts (TOTP or Google SSO MFA)
- All data encrypted at rest (AES-256) and in transit (TLS 1.3)
- API keys are hashed (SHA-256) in the database — the raw key is shown once at creation
- Automated dependency vulnerability scanning in CI (npm audit)
- Weekly automated red-team test suite run against production
- Annual third-party penetration test targeting prompt injection and data isolation

### GDPR compliance

- Business owner account deletion cascades: Postgres rows deleted, Pinecone namespace deleted, Supabase Storage files deleted — within 30 days
- End customer conversation data retained for 90 days by default (configurable 30–365 days)
- Pre-chat disclosure: "I'm an AI assistant. Your messages are processed to answer your questions."
- Data export: business owners can download all their data (knowledge items, conversation logs, analytics) as JSON/CSV
- Sub-processor list published and kept current

---

## 16. Build sequence — week by week

### Week 1: RAG pipeline proof of concept

Goal: a Node.js script (not a web app) that accepts a text file, chunks it, embeds it into a Pinecone namespace, and answers 10 test questions from it with >= 85% accuracy.

Deliverables: `embed.ts`, `chunk.ts`, `retrieve.ts`, Supabase schema migrations 001–003, Pinecone index created.

Gate: manually test with a real business's FAQ document. If 85%+ of questions are answered correctly from the document content, proceed. If not, fix the chunking strategy and prompt before touching the UI.

### Week 2: Safety layer and chat API

Goal: `POST /api/chat` working end to end with all five safety layers active.

Deliverables: `injection.ts`, `moderation.ts`, `pii.ts`, `canary.ts`, `validate.ts`, `prompts.ts`, `providers.ts` (OpenAI + Anthropic), `route.ts` for `/api/chat`, red-team test suite passing 100%.

Gate: red-team suite — all adversarial prompts blocked, all legitimate queries answered correctly.

### Week 3: Ingestion pipeline and admin dashboard

Goal: business owner can upload a PDF, see it processed, and test their assistant in preview mode.

Deliverables: Inngest functions for `ingest-document` and `ingest-url`, all extractors (PDF, DOCX, CSV, URL, plain text), knowledge base manager UI, preview chat window, Supabase Realtime subscription for status updates.

Gate: upload a real PDF, watch status go to active, ask 10 questions in preview, verify grounded responses.

### Week 4: Widget, iframe, and deployment

Goal: a real website can embed the widget snippet and have a working conversation.

Deliverables: `widget.ts` compiled to `widget.js`, chat iframe page at `/chat/[id]`, Cloudflare R2 deployment, WordPress plugin PHP file, Vercel production deployment with all environment variables, streaming verified end to end.

Gate: embed the widget on a real external website (not localhost), send 5 messages, verify they stream correctly and are grounded in the uploaded content.

### Week 5: Billing, analytics, and hardening

Goal: the product can charge customers and the business owner has visibility into what their assistant is doing.

Deliverables: Stripe subscription integration, usage metering on `/api/chat`, billing webhook handler, analytics dashboard (conversation volume, resolution rate, CSAT, top questions, security events), load testing (100 concurrent conversations), Sentry and Axiom configured in production.

Gate: complete a full Stripe billing cycle in test mode. Load test passes with p95 latency under 3 seconds.

### Week 6: Pilot launch

Goal: onboard 10 real businesses manually. Collect feedback. Do not add features — observe and fix.

Deliverables: onboarding checklist, monitoring alerts configured, uptime monitoring live, GDPR deletion flow verified (delete test account → confirm all data removed from Postgres, Pinecone, and Storage).

Gate: 48-hour soak test at 99.9% uptime. Zero cross-tenant data incidents. At least 5 of 10 pilot businesses have active conversations within 7 days.

---

## 17. Open items — what the founder must decide and provide

These are the decisions and inputs that cannot be made by the engineering team. Each one blocks a specific part of the build.

### Decisions required before week 1

**Domain name.** The widget iframe `src` is hardcoded to the production domain. The Cloudflare R2 bucket and Worker are configured around it. All CORS policies reference it. Decide the domain before writing any networking code.

**Brand name and assistant name.** The fallback message, widget UI, and all user-facing copy reference the product name. Decide before the dashboard UI is built.

**Pricing tiers.** Stripe products and price IDs must be created in the Stripe dashboard before the billing integration can be built. Decide the tier names, monthly prices, conversation limits, and knowledge base storage limits. The working assumption from our session: Starter $49/500 conversations, Professional $99/2,000 conversations, Business $199/5,000 conversations.

### Decisions required before week 3

**Default fallback message.** The message the assistant returns when it cannot find relevant content. Business owners can override this per assistant, but there must be a platform default. Suggested: "I don't have specific information about that. Please contact us directly for help."

**Default confidence threshold.** The minimum Pinecone similarity score for a retrieved chunk to be used. Currently set to 0.65. This can be tuned after seeing real data, but a default must be set before launch.

**Supported languages for UI.** The dashboard UI language. English only for MVP, but confirm.

### Things to provide before development starts

**OpenAI API key.** Required for embeddings and chat completions. Set up a separate organization in OpenAI for this project — do not use a personal account key.

**Anthropic API key.** Required for the failover LLM. Create an account at console.anthropic.com.

**Pinecone account.** Create an account at pinecone.io. Create one serverless index named `bizassist-prod` with `cosine` metric and 1536 dimensions. Provide the API key.

**Supabase project.** Create a new project at supabase.com. Provide the project URL, anon key, and service role key. Enable Point-in-Time Recovery on the database (requires Pro plan).

**Stripe account.** Create the products and prices in Stripe. Provide the secret key, publishable key, and webhook signing secret.

**Cloudflare account.** Create an R2 bucket for the widget CDN. Provide account ID and API token with R2 write access.

**Vercel project.** Connect the GitHub repo to a new Vercel project. Set all environment variables listed in `.env.example`.

**Inngest account.** Create a project at inngest.com. Provide the event key and signing key.

### Design decisions required before week 3

**Dashboard visual design.** The implementation guide uses functional Tailwind styles. If there are brand guidelines, color palette preferences, or a specific visual style for the dashboard, provide them before the dashboard UI is built. Changing the visual design after the components are built takes significant time.

**Widget default appearance.** The default widget color is `#2563eb` (blue). The default position is bottom-right. These are per-assistant configurable, but the defaults should reflect the product's brand. Decide before the widget is built.

**Onboarding wizard flow.** The wizard is the first thing a new business owner sees. The current spec assumes 4 steps: business details → upload content → configure assistant → preview and deploy. If there are specific industries to target at launch (e.g., healthcare, e-commerce), the wizard can be pre-filled with industry-specific defaults. Decide before week 3.

---

## 18. How to improve results over time

This section is for after launch. It describes the specific levers available for improving answer quality, reducing hallucinations, and increasing resolution rate — based on real data from real conversations.

### The most important metric to track first: fallback rate

The fallback rate is the percentage of responses where the assistant said "I don't have that information." Every fallback is one of three things: a question the business owner hasn't answered in their knowledge base (a gap), a question asked in a way that retrieval failed to find the right chunk (a retrieval quality issue), or a deliberately adversarial query (expected behavior).

The unanswered questions report in the dashboard groups fallback-triggering queries by semantic similarity. The business owner's primary action after launch is reviewing this report weekly and adding content to fill the gaps. This is the single highest-leverage improvement action available.

### Improving chunk quality

**Increase overlap for documents with dense information.** If a FAQ has very short answers packed tightly together, the default 200-character overlap may not be enough. For those documents, increasing overlap to 400 characters prevents edge-case misses where an answer is split across chunk boundaries.

**Add more specific headings to uploaded documents.** The chunker stores the last heading it saw as metadata for each chunk. When a heading is present, the retrieval system has richer signal. Business owners who upload plain text documents without headings get weaker retrieval than those who upload a well-structured FAQ with clear section headers. Provide formatting guidance in the onboarding wizard.

**Split large documents into topic-focused files.** A single 200-page company handbook retrieves worse than 10 focused documents (returns policy, shipping policy, product catalog, etc.). This is counterintuitive but consistent — focused documents produce focused chunks, and retrieval similarity is higher when the query and chunk are both about the same narrow topic.

### Improving retrieval quality

**Tune the confidence threshold per assistant.** The default is 0.65 (cosine similarity). For assistants with comprehensive knowledge bases (most questions should have answers), lowering the threshold to 0.60 reduces false "I don't know" responses. For assistants with narrow knowledge bases (only a few documents), raising the threshold to 0.70 reduces cases where a loosely relevant chunk produces a slightly wrong answer.

**Add hybrid search (BM25 + vector).** The current retrieval is pure vector similarity, which handles semantic variation well ("how do I return something" finds "return policy") but handles exact keyword matches less well ("SKU-12345 price"). Adding BM25 sparse retrieval as a secondary pass and combining scores (0.7 × vector + 0.3 × BM25) improves retrieval for exact-match queries like product names, codes, and proper nouns. This is a week 8+ improvement, not MVP.

**Increase `topK` for complex questions.** The current default is 5 chunks. For questions that span multiple topics ("what's your return policy and do you offer gift wrapping?"), increasing to 7 or 8 reduces the risk that one of the two needed topics is not in the retrieved set.

### Improving answer quality

**Upgrade to GPT-4o for all queries once volume justifies cost.** GPT-4o-mini handles straightforward Q&A very well, but GPT-4o produces noticeably more natural, better-structured answers. At 100+ customers, the cost difference is covered by revenue. Run an A/B test: split 50% of traffic to GPT-4o and compare CSAT scores over two weeks.

**Add re-ranking.** After retrieving the top 10 chunks, use a cross-encoder re-ranker (Cohere Rerank API, ~$0.001 per call) to re-score them against the full query. Pass only the top 5 re-ranked results to the LLM. Re-ranking consistently improves answer quality by 10–20% on complex multi-topic queries. This is a month 3+ improvement.

**Prompt tuning per business vertical.** A dental practice assistant, an e-commerce assistant, and a legal firm assistant have different expectations for tone, response length, and structure. Building vertical-specific system prompt templates (selected during onboarding based on business category) measurably improves customer satisfaction scores within the first month of deployment.

### Improving the safety layer

**Expand the injection pattern library.** New jailbreak techniques are published regularly on platforms like HackerOne and Promptfoo. Subscribe to LLM security feeds and add new patterns to the classifier within 48 hours of discovery. The CI red-team suite makes this fast — add the new pattern to `ADVERSARIAL_PROMPTS`, verify it's blocked, ship.

**Add per-session risk scoring.** The current injection classifier evaluates each message independently. A smarter approach tracks a risk score across the session — a user who sends two mildly suspicious messages followed by a clearly adversarial one should be treated differently than a first-time adversarial message. Session-level risk accumulation is a month 2+ improvement.

**Evaluate Llama Guard for input classification.** Meta's Llama Guard is a specialized model for input safety classification that outperforms heuristic classifiers on novel attack patterns. Running it as a secondary classifier on messages that score between 0.60 and 0.80 on the heuristic scale would reduce both false positives (blocking legitimate queries) and false negatives (missing novel attacks). Available via Replicate or Groq APIs. Evaluate at month 3 when you have enough real attack data to benchmark against.

### The feedback loop to build from day one

The most powerful improvement mechanism is the simplest one: when a business owner reviews their conversation log and marks a response as wrong, that annotation should trigger a workflow that (1) shows them which chunk was retrieved for that response, (2) lets them edit that chunk directly, and (3) triggers a re-embedding of the edited chunk. This closes the feedback loop between "the assistant gave a wrong answer" and "the assistant now gives the right answer" in under two minutes without requiring the business owner to understand how RAG works.

This feature is not in the MVP. But designing the data model to support it from day one (which the current schema does — `messages.chunks_used` stores exactly which chunk IDs were used) means it can be built as a P1 feature after launch without schema changes.

---

*End of document. Version 1.0. Update this document when any architectural decision changes — it is the source of truth for what this product is and why.*
