# BizAssist AI

A multi-tenant SaaS platform that lets business owners deploy AI chat assistants powered exclusively by their own proprietary knowledge. The assistant answers only from what the business owner explicitly provides — no hallucinations, no off-topic answers.

## Overview

BizAssist AI combines document ingestion, vector search, and large language models into a turnkey chat solution. Business owners upload their knowledge (PDFs, DOCX, TXT, CSV, or URLs), and the platform builds a retrieval-augmented generation (RAG) pipeline that powers a conversational assistant scoped strictly to that content.

Key capabilities include streaming chat responses, intelligent model routing, a five-layer safety pipeline, per-tenant data isolation, lead capture, escalation workflows, and an embeddable widget that drops into any website.

## Tech Stack

**Application** — Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS 4, shadcn/ui, Zustand

**AI / LLM** — Anthropic Claude (primary), OpenAI GPT-4o-mini/4o (embeddings & complex queries), Pinecone (vector database)

**Backend & Data** — PostgreSQL via Drizzle ORM, Supabase (auth & realtime), Upstash Redis (rate limiting), Inngest (async jobs)

**Infrastructure** — Vercel (hosting), Cloudflare R2 (widget CDN), Stripe (billing), Sentry (errors), Axiom (monitoring)

## Project Structure

```
poc-ai-chat/
├── apps/
│   ├── web/                     # Main Next.js application
│   │   ├── app/                 # Routes: auth, dashboard, chat, API
│   │   ├── components/          # React components
│   │   ├── hooks/               # Custom React hooks
│   │   └── lib/                 # Feature modules
│   │       ├── db/              #   Database schema & operations
│   │       ├── llm/             #   LLM interactions
│   │       ├── rag/             #   Retrieval-augmented generation
│   │       ├── safety/          #   Security & content moderation
│   │       ├── knowledge/       #   Knowledge base utilities
│   │       ├── analytics/       #   Dashboard analytics
│   │       ├── channels/        #   Multi-channel connections
│   │       ├── escalation/      #   Support escalation workflows
│   │       ├── compliance/      #   GDPR & data compliance
│   │       └── integrations/    #   Third-party integrations
│   │
│   └── widget/                  # Embeddable chat widget (vanilla JS)
│
├── packages/
│   └── types/                   # Shared TypeScript definitions
│
├── supabase/
│   └── migrations/              # Database migrations
│
├── docs/                        # Feature & compliance docs
└── scripts/                     # Utility scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- PostgreSQL (via Supabase or local)

### Installation

```bash
git clone https://github.com/orsasson12/poc-ai-chat.git
cd poc-ai-chat
npm install
```

### Environment Variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database & auth |
| `OPENAI_API_KEY` | Embeddings & chat |
| `ANTHROPIC_API_KEY` | Claude LLM |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | Vector search |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Billing |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Async jobs |
| `SENTRY_DSN` | Error tracking |

The application gracefully degrades with mock data when external service keys are missing, making local development straightforward.

### Running Locally

```bash
npm run dev        # Start dev server at localhost:3000
npm run build      # Production build
npm run lint       # Run linting
```

## Features

### Knowledge Management
Upload PDFs, DOCX, TXT, CSV files or import URLs (up to 50 MB). Documents are chunked, embedded, and stored in Pinecone with per-tenant namespace isolation.

### RAG-Powered Chat
Conversations use retrieval-augmented generation to ground every answer in the business owner's uploaded content. Streaming responses are delivered via Server-Sent Events with sub-3-second latency targets.

### Multi-Tenant Isolation
Each tenant's data is isolated through Pinecone namespaces and Postgres row-level security. No cross-tenant data leakage by design.

### Five-Layer Safety Pipeline
Prompt injection detection, content moderation, PII stripping, output validation, and full audit logging protect every interaction.

### Embeddable Widget
A framework-agnostic vanilla JS widget that integrates with WordPress, Wix, Shopify, Squarespace, or any site via a simple script tag.

### Analytics Dashboard
Track conversation volume, resolution rates, and unanswered questions to continuously improve the knowledge base.

### Multi-Channel Support
Connect assistants to WhatsApp, Facebook Messenger, and Instagram alongside the web widget.

### Lead Capture & Escalation
Automatically capture visitor information and route conversations to human agents based on configurable escalation rules.

### GDPR Compliance
Built-in Subject Access Request (SAR) handling for data access and deletion.

## Architecture Decisions

- **Drizzle ORM** over Prisma for database operations
- **Claude** as primary LLM with OpenAI for embeddings and specific tasks
- **Zod** for runtime validation on all API endpoints
- **Zustand** for shared client state (not Context API)
- **Named event handlers** and custom hooks as enforced React patterns

## License

This project is a proof of concept. See the repository for license details.****
