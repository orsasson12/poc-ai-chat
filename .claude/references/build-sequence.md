# Build Sequence — Week by Week

## Week 1: RAG Pipeline POC
- Node.js script: text file → chunk → embed → Pinecone → answer questions
- Deliverables: embed.ts, chunk.ts, retrieve.ts, migrations 001-003
- Gate: 85%+ accuracy on real FAQ document

## Week 2: Safety Layer + Chat API
- POST /api/chat with all 5 safety layers
- Deliverables: injection.ts, moderation.ts, pii.ts, canary.ts, validate.ts, prompts.ts, providers.ts
- Gate: red-team suite 100% pass

## Week 3: Ingestion Pipeline + Dashboard
- Upload PDF → process → preview chat
- Deliverables: Inngest functions, extractors, knowledge base UI, preview chat, Realtime subscriptions
- Gate: real PDF upload → active → 10 grounded responses

## Week 4: Widget, Iframe, Deployment
- Working widget on real external website
- Deliverables: widget.ts → widget.js, chat iframe, R2 deploy, WP plugin, Vercel production
- Gate: 5 streaming messages on external site

## Week 5: Billing, Analytics, Hardening
- Charge customers + analytics visibility
- Deliverables: Stripe integration, usage metering, analytics dashboard, load testing, Sentry + Axiom
- Gate: full Stripe billing cycle, p95 < 3s under load

## Week 6: Pilot Launch
- 10 real businesses, observe and fix
- Deliverables: onboarding checklist, monitoring, uptime checks, GDPR deletion verified
- Gate: 48hr soak at 99.9%, zero cross-tenant incidents, 5/10 businesses active in 7 days
