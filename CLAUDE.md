# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Development
npm run dev                    # Start Next.js dev server (runs apps/web)
npm run build                  # Production build
npm run lint                   # ESLint

# Database
npx drizzle-kit push           # Push schema changes to database (requires DATABASE_URL)
npx drizzle-kit generate       # Generate migration files to supabase/migrations/

# Type checking
npx tsc --noEmit -p apps/web/tsconfig.json
```

## Architecture

**BizAssist** is a multi-tenant SaaS AI chatbot platform. Business owners upload knowledge (documents, URLs, Q&A, structured data), and their customers interact with an AI assistant that answers only from that knowledge.

### Monorepo Structure

- `apps/web/` — Next.js 15 App Router application (API routes, dashboard, chat)
- `packages/types/` — Shared TypeScript types (`@bizassist/types`)

### Path Aliases

- `@/*` → `apps/web/*`
- `@bizassist/types` → `packages/types`

### Key Directories (apps/web/)

- `app/(dashboard)/` — Business owner dashboard (knowledge, settings, analytics)
- `app/api/chat/` — Chat SSE endpoint (main conversation flow)
- `app/api/ingest/` — Knowledge ingestion (single items + CSV bulk)
- `app/chat/[id]/` — End-user chat page (rendered per assistant)
- `lib/db/` — Drizzle ORM schema (`schema.ts`) and queries (`queries.ts`)
- `lib/llm/` — System prompt construction (`prompts.ts`), model providers, history optimization
- `lib/rag/` — Embedding (`embed.ts`) and Pinecone retrieval (`retrieve.ts`)
- `lib/safety/` — Five-layer safety pipeline (injection, moderation, PII, output validation, audit)
- `lib/knowledge/` — Content formatting, chunking, processing, card schemas, scraping
- `lib/mock/` — Mock data and providers for development without external services
- `components/chat/` — Chat UI (chat-window, message-bubble, content-card)
- `components/dashboard/` — Dashboard forms, tables, uploads

### Data Flow: Chat Request

1. `POST /api/chat` → Zod validation → resolve assistant/tenant
2. `resolveChunks()` → embed query → Pinecone semantic search (or fallback to all knowledge items)
3. `buildSystemPrompt()` → inject chunks, language rules, tone, card instructions, canary token
4. Stream response via Claude API → SSE tokens → meta event (messageId, confidence, sources, cards)
5. Frontend accumulates tokens → on meta event, renders cards inline via `[CARD:id]` markers

### Data Flow: Knowledge Ingestion

1. `POST /api/ingest` → create knowledge item (pending)
2. `processKnowledgeItem()` → format → chunk → embed → store in Pinecone + Postgres
3. Status transitions: pending → processing → active (or error)

### Structured Cards System

Business owners can add structured data (products, services, team members) with metadata (image, fields). The LLM emits `[CARD:ki_xxx]` markers in responses. Card data travels in the SSE meta event, and the frontend renders them inline as visual cards.

### Graceful Degradation

The app works without external services. `lib/env.ts` provides feature flags (`hasDatabase()`, `hasAnthropic()`, `hasPinecone()`, etc.). When services are unavailable, it falls back to mock data from `lib/mock/`.

## Multi-Tenant Isolation

- Every database table has `tenant_id` — every query must scope by it
- Pinecone uses per-tenant namespaces (not metadata filtering)
- The assistant answers ONLY from provided business data — no general knowledge, no cross-tenant data

## Safety System

Five sequential layers — all must pass before showing a response. See `.claude/rules/03-safety-system.md` for full details. Key: canary tokens (HMAC per tenant) detect system prompt leakage.

## SSE Streaming Protocol

```
data: {"token": "text"}\n\n          # Each token
data: {"meta": {...}}\n\n            # After streaming: messageId, confidence, sources, cards
data: [DONE]\n\n                     # Termination
```

## React & Component Rules

- **No inline functions in JSX.** Always extract handlers as named functions (`handleClick`, `handleSubmit`, etc.), not anonymous arrows in `onClick={() => ...}`.
- **Extract custom hooks when a component has too many `useState`/`useEffect` calls.** If a component manages 4+ related state variables, group them into a `useXxx` hook in the same file or `lib/hooks/`.
- **Avoid prop drilling.** If a prop passes through 3+ component levels, use Zustand for shared state instead. Zustand is the global state library for this project — do not introduce React Context or other state managers.
- **Keep components focused.** One component should do one thing. If a component file exceeds ~200 lines, split it.
- **Never use array index as `key`.** Always use a stable, unique identifier (id, name, or generated id). If items don't have an id, generate one with `crypto.randomUUID()` when creating the item.

## Technology Constraints

Do not swap stack components without approval. Key locked decisions (see `.claude/rules/01-stack.md`):
- ORM: Drizzle (not Prisma) — for TS inference
- UI: Tailwind + shadcn/ui (Base UI primitives, not Radix)
- LLM: Claude primary, GPT-4o/4o-mini for embeddings, Claude Sonnet failover
- Validation: Zod on all API inputs
- Next.js 15 has breaking changes vs training data — check `node_modules/next/dist/docs/` when unsure
