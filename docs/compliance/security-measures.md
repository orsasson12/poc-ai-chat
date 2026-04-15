# Technical and Organisational Measures (Article 32 GDPR)

> **Not legal advice.** This document describes the technical and organisational measures BizAssist implements to protect personal data. It must be reviewed by a qualified lawyer before being attached to any contract or audit response.

## 1. Pseudonymisation and encryption

- **In transit**: TLS 1.3 is enforced for all public endpoints (widget, dashboard, API). HTTP → HTTPS redirect at the edge.
- **At rest**: Supabase-managed Postgres uses AES-256 encryption at rest. Pinecone vectors are stored encrypted at rest by the provider. Uploaded documents in Supabase Storage are encrypted at rest.
- **PII pseudonymisation**: The safety pipeline layer 3 scans message content for email addresses, phone numbers, credit card numbers, SSNs, and IP addresses, replacing them with opaque tokens (`[EMAIL]`, `[PHONE]`, etc.) **before** the message is sent to any LLM provider. The original text is retained in the conversation log scoped to the controller's tenant.

## 2. Ongoing confidentiality, integrity, availability and resilience

- **Confidentiality**: Multi-tenant isolation enforced at the application layer (every query scoped by `tenant_id`), at the vector layer (per-tenant Pinecone namespace), and at the auth layer (Supabase RLS). See `.claude/rules/02-multi-tenant.md` for the isolation contract and CI requirements.
- **Integrity**: All dashboard mutations are Zod-validated at the API boundary. Drizzle's strict TypeScript inference prevents tenant_id mixing at compile time.
- **Availability**: The application is deployed on Vercel with automatic failover. The database is managed Postgres with point-in-time recovery. An LLM failover chain (Claude Sonnet as primary, secondary provider on timeout/5xx) keeps chat available during upstream provider incidents.
- **Resilience**: Upstash Redis rate limiting protects against denial-of-wallet and brute-force attacks. Security events are written to a dedicated `security_events` table and monitored for spikes.

## 3. Ability to restore availability and access

- Postgres: automated daily backups retained for the plan's default window, plus point-in-time recovery up to 7 days.
- Pinecone: vectors are deterministically reproducible from the knowledge chunks stored in Postgres — a full restore is possible by re-embedding the chunks.
- Code: source of truth in git with full commit history.

## 4. Testing, assessing and evaluating effectiveness

- **Automated CI**: cross-tenant access tests run on every push to `main`. Any successful cross-tenant read fails the build.
- **Dependency scanning**: npm audit runs in CI; high-severity findings block merge.
- **Penetration testing**: annual third-party pentest covering the widget, chat API, and dashboard.
- **Code review**: all changes touching the chat pipeline, RLS policies, or API routes require review by another engineer.

## 5. Access controls

- Dashboard access is gated by Supabase Auth with email verification.
- Service role keys (database, Pinecone, OpenAI, Anthropic) live in environment variables only and are never checked into source control.
- Employee access to production data is restricted to named operators; access is logged.

## 6. Data segregation

- Each tenant's data is segregated by `tenant_id` in Postgres and by namespace in Pinecone.
- Rate limits are applied per tenant.
- Canary tokens unique to each tenant (HMAC of `tenant_id + salt`) are injected into every system prompt. The output validation layer scans every response for canary presence and fails the request if one leaks, preventing cross-tenant prompt bleed.

## 7. Security incident monitoring

- All safety pipeline events (prompt injection attempts, PII detection, canary leaks, scope violations, moderation hits) are logged to the `security_events` table with severity and classification score.
- The dashboard's Security panel surfaces these events to the business owner.
- Spikes in event rates are alerted to the ops on-call (via Axiom alerts in production deployments).

## 8. Secure development practices

- TypeScript strict mode across the codebase.
- Zod validation on every API route input.
- Drizzle ORM with parameterised queries — no raw string concatenation into SQL.
- Next.js Server Components preferred over client-side fetching where possible, reducing the client-side attack surface.
