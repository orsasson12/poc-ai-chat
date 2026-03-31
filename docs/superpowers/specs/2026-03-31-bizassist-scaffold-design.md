# BizAssist AI — App Scaffold Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Scope:** Full Next.js app scaffold with mock data, ready for real service keys

---

## Goal

Scaffold the complete BizAssist AI application — all dashboard pages, auth, chat iframe, API routes, DB schema, widget source, and safety pipeline code. Everything uses typed mock data when env vars are absent, and switches to real service calls when keys are provided. The user copies `.env.example` to `.env.local`, adds their keys, and the app goes live.

---

## Project Structure

```
bizassist/
├── apps/web/                     Next.js 15 App Router
│   ├── app/
│   │   ├── layout.tsx            Root layout (fonts, theme provider)
│   │   ├── page.tsx              Landing / redirect to dashboard
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx        Sidebar + header shell
│   │   │   ├── overview/page.tsx
│   │   │   ├── knowledge/page.tsx
│   │   │   ├── conversations/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── security/page.tsx
│   │   ├── chat/[id]/page.tsx    Chat iframe (public, no auth)
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── ingest/route.ts
│   │       ├── widget/[id]/config/route.ts
│   │       └── webhooks/stripe/route.ts
│   ├── components/
│   │   ├── ui/                   shadcn/ui primitives
│   │   ├── dashboard/            Dashboard-specific components
│   │   ├── chat/                 Chat UI components
│   │   └── widget/               Widget preview components
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts         Drizzle schema (all 9 tables)
│   │   │   ├── client.ts         DB client (env-gated)
│   │   │   └── queries/          Query functions per table
│   │   ├── rag/
│   │   │   ├── embed.ts          OpenAI embeddings (env-gated)
│   │   │   ├── retrieve.ts       Pinecone query (env-gated)
│   │   │   ├── generate.ts       LLM generation (env-gated)
│   │   │   └── validate.ts       Output validation
│   │   ├── safety/
│   │   │   ├── injection.ts      Layer 1: regex + heuristic classifier
│   │   │   ├── moderation.ts     Layer 2: OpenAI moderation (env-gated)
│   │   │   ├── pii.ts            Layer 3: PII detection + stripping
│   │   │   ├── canary.ts         Layer 4: canary token validation
│   │   │   └── index.ts          Pipeline orchestrator
│   │   ├── llm/
│   │   │   ├── providers.ts      OpenAI + Anthropic clients (env-gated)
│   │   │   └── prompts.ts        System prompt templates (sandwich pattern)
│   │   ├── supabase/
│   │   │   ├── client.ts         Browser client
│   │   │   ├── server.ts         Server client
│   │   │   └── middleware.ts      Auth middleware
│   │   ├── mock/
│   │   │   ├── data.ts           Smile Dental mock dataset
│   │   │   └── providers.ts      Mock service implementations
│   │   ├── env.ts                Env var checker + feature flags
│   │   └── utils.ts              Shared utilities
│   ├── hooks/                    Custom React hooks
│   ├── styles/
│   │   └── globals.css           Tailwind + shadcn theme
│   └── middleware.ts             Auth route protection
├── apps/widget/
│   └── src/widget.ts             Vanilla JS widget source
├── packages/
│   └── types/
│       └── index.ts              Shared TypeScript types
├── supabase/
│   └── migrations/               SQL migration files
├── drizzle.config.ts
├── .env.example                  All keys documented
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## Mock Strategy

### Pattern: env-gated service calls

```typescript
// lib/env.ts
export const hasOpenAI = () => !!process.env.OPENAI_API_KEY
export const hasSupabase = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL
export const hasPinecone = () => !!process.env.PINECONE_API_KEY
// ... etc

// lib/rag/embed.ts
import { hasOpenAI } from '@/lib/env'
import { mockEmbedding } from '@/lib/mock/providers'

export async function embedQuery(text: string): Promise<number[]> {
  if (!hasOpenAI()) return mockEmbedding()
  // real OpenAI call
}
```

### Mock data: "Smile Dental"

A fictional dental practice with:
- 3 knowledge items (FAQ PDF, services page URL, manual Q&A pairs)
- 15 sample conversations with varying satisfaction scores
- 5 security events (2 injection attempts, 1 PII detection, 2 moderation flags)
- Realistic analytics data over 30 days
- 2 team members (owner + viewer)

---

## Database Schema

All 9 tables from PRD section 11, implemented as Drizzle schema:
- tenants, assistants, knowledge_items, chunks, conversations, messages, security_events, tenant_members, usage_logs
- All tables include tenant_id for RLS readiness
- Proper indexes on tenant_id + sort columns
- Enum types for status fields

SQL migrations generated for Supabase + RLS policies included.

---

## Dashboard Pages

### Overview
- 4 metric cards: conversations (today/week/month), resolution rate, CSAT, unanswered count
- Health score composite gauge
- Alert cards for errored knowledge items + recent security events
- Real-time updates via Supabase Realtime (when connected)

### Knowledge Base
- Table of items with status badges (pending/processing/active/error)
- Upload zone (drag & drop) for PDF, DOCX, TXT, CSV
- URL import input
- Manual Q&A form (expandable)
- Chunk count per item
- Delete with confirmation

### Conversations
- Filterable list (date, satisfaction, escalation, security flags)
- Conversation detail panel with full transcript
- Chunk attribution (expandable per response)
- Confidence scores + latency per response

### Analytics
- Conversation volume chart (line, 30 days)
- Resolution rate trend (line)
- Top 10 questions (bar)
- Unanswered questions grouped by theme
- CSAT trend (line)
- Date range + assistant filter

### Settings
- Assistant config form (name, greeting, tone, fallback, escalation)
- Widget appearance (color picker, position selector, live preview)
- Team member management (invite, role assignment)
- Embed code copy button
- Billing section (plan display, usage meter)

### Security
- Event log table with type, severity, input preview, blocked status
- Aggregate counts by event type (cards)
- Date range filter

---

## Chat & Widget

### Chat iframe (`/chat/[id]`)
- Server component loads assistant config
- Client ChatWindow component with message bubbles
- Streaming text display with cursor indicator
- Pre-chat disclosure message
- Thumbs up/down feedback buttons (P1, UI ready)
- Responsive — works in iframe and standalone

### Widget (`widget.ts`)
- Vanilla TS, zero dependencies
- Reads data-assistant-id, data-color, data-position
- Floating bubble → lazy iframe creation on click
- postMessage listener with origin validation
- Session ID in sessionStorage

---

## API Routes

All routes use Zod validation. All return typed responses.

| Route | Method | Purpose |
|---|---|---|
| /api/chat | POST | Main conversation endpoint (full RAG pipeline) |
| /api/ingest | POST | Trigger ingestion job |
| /api/ingest | DELETE | Remove knowledge item + vectors |
| /api/widget/[id]/config | GET | Public assistant config (edge cacheable) |
| /api/webhooks/stripe | POST | Stripe billing events (stub) |

---

## Design System

- shadcn/ui as component library
- Tailwind CSS for all styling
- Dark/light mode via next-themes
- Professional SaaS aesthetic — clean sidebar, metric cards, data tables
- Consistent spacing, typography, color palette
- All interactive elements keyboard accessible
- Semantic HTML throughout

---

## .env.example

Every service key listed with section headers and descriptions. Copy to .env.local, fill in keys, app switches from mock to real automatically.

---

## Out of Scope (Follow-up Sessions)

- Inngest worker functions (interfaces defined, no runtime)
- Cloudflare R2 widget deployment
- WordPress plugin PHP file
- Stripe webhook business logic
- Real Supabase RLS policy enforcement testing
- Load testing
- E2E Playwright tests

---

## Success Criteria

1. `npm run dev` works with zero env vars — full dashboard browsable with mock data
2. Every page from the PRD is implemented and navigable
3. Chat iframe renders and simulates streaming responses
4. All API routes return valid typed responses
5. Adding real keys to .env.local switches any service from mock to real
6. TypeScript strict mode — zero type errors
7. All interactive elements are keyboard accessible
