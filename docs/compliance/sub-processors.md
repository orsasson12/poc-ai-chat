# Authorized Sub-processors

> **Not legal advice.** This list is the authoritative record of third parties BizAssist uses to deliver the service. It is mirrored from `apps/web/lib/compliance/sub-processors.ts` — edit that file first and then regenerate this document.

Last updated: bundled with DPA version **1.0**.

## Data processing partners

| Sub-processor | Purpose | Location | EU residency | Data categories |
|---------------|---------|----------|--------------|-----------------|
| **Supabase** | Managed Postgres database, auth, and storage | EU (Frankfurt) or US — configurable per deployment | EU available | Tenant metadata, conversation transcripts, messages, knowledge base content, lead records |
| **Pinecone** | Vector database for semantic search over knowledge chunks | EU (eu-west) or US (us-east) per namespace | EU available | Embedding vectors, chunk content metadata |
| **OpenAI** | Text embeddings and content moderation | United States | Cross-border transfer (SCCs) | Customer messages sent for embedding, knowledge chunk text, moderation classification input |
| **Anthropic (Claude)** | Primary large language model for chat responses | United States | Cross-border transfer (SCCs) | Customer messages included in prompts, system prompts |
| **Stripe** | Subscription billing and payment processing | EU / US | EU available | Billing contact, subscription and invoice metadata |
| **Vercel** | Application hosting and edge network | EU / US per deployment | EU available | Request logs, TLS termination |

## Cross-border transfers

Two sub-processors — **OpenAI** and **Anthropic** — are located in the United States and there is no currently-offered EU-only region. When a customer's message is sent to either provider for language model processing, the message content is transferred internationally.

These transfers are covered by:

- The **Standard Contractual Clauses** (Commission Implementing Decision (EU) 2021/914) incorporated by reference into the respective provider DPAs, and
- Supplementary technical measures: transport-layer encryption (TLS 1.3), the PII detection layer in BizAssist which replaces email / phone / SSN patterns with tokens before the message leaves the EU, and prompt caching disabled for sensitive categories.

When a tenant pins to the EU region in the Compliance dashboard, **primary storage** (Supabase, Pinecone) stays in the EU — only the language model calls transit to the US.

## Adding or changing a sub-processor

1. Edit `apps/web/lib/compliance/sub-processors.ts`.
2. Bump `DPA_VERSION` in the same file so tenants are prompted to re-accept the DPA on next login.
3. Regenerate this document from the constants.
4. Notify existing controllers at least **30 days in advance** of the change, per clause 7 of the DPA.
