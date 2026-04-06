# Multi-Tenant Isolation Rules

## Non-Negotiable Rule
The assistant answers ONLY from what the business owner explicitly provided. No hallucination, no general knowledge, no cross-tenant leakage, no prompt manipulation compliance.

## Vector Isolation — Silo Model
- Each tenant gets a dedicated Pinecone namespace
- Query to namespace(tenantA) CANNOT retrieve from namespace(tenantB)
- No shared index with metadata filtering (vulnerable to bugs)
- Deleting namespace = complete data removal (GDPR)

## Database Isolation — RLS
- All tables have `tenant_id` column
- Row Level Security policies at DB engine level
- Service role client always includes `.eq('tenant_id', resolvedTenantId)`
- This is a code review checklist item — every query must scope by tenant

## Rate Limiting
- Per-tenant via Upstash Redis
- Defaults: 60 chat/min, 10 ingestion jobs/hour
- 429 responses with Retry-After headers
- Prevents denial-of-wallet attacks

## CI Requirements
- Cross-tenant access tests: attempt to read Tenant B data with Tenant A credentials
- Any successful cross-tenant read = build failure
- Run on every push to main
