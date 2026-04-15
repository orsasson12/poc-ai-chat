# EU Data Residency Architecture

> **Not legal advice.** This document describes the technical approach. Validating that it meets your residency commitments — especially under Schrems II supplementary measures — is a legal review.

## Goal

Let business owners pin their tenant to the European Union so that:

1. **Primary storage** (Postgres, Pinecone, object storage) operates inside the EU at all times,
2. **Request traffic** routes to an EU edge, and
3. **Any cross-border transfer** (OpenAI, Anthropic) is documented, contractually covered by SCCs, and visible in the dashboard.

## Non-goal

A single deployment of BizAssist that transparently routes EU tenants to EU infrastructure while serving US tenants from the same process. That is a feature that looks simple and is not — connection-pool management, secret separation, cost of a mis-routed query, and the blast radius of a configuration mistake all outweigh the benefit. We deliberately chose **dual deployment** instead.

## Architecture

```
   ┌────────────────────────┐            ┌────────────────────────┐
   │  eu.bizassist.app      │            │  us.bizassist.app      │
   │  Vercel EU (fra1)      │            │  Vercel US (iad1)      │
   │  BIZASSIST_DEPLOY_     │            │  BIZASSIST_DEPLOY_     │
   │  REGION=eu             │            │  REGION=us             │
   └──────┬──────────┬──────┘            └──────┬──────────┬──────┘
          │          │                          │          │
          ▼          ▼                          ▼          ▼
   ┌─────────┐  ┌─────────┐              ┌─────────┐  ┌─────────┐
   │ Supabase│  │ Pinecone│              │ Supabase│  │ Pinecone│
   │ EU      │  │ eu-west │              │ US-east │  │ us-east │
   └─────────┘  └─────────┘              └─────────┘  └─────────┘
          │                                    │
          ▼                                    ▼
      OpenAI                                OpenAI
      Anthropic                             Anthropic
      (US, covered by SCCs)                 (US)
```

Two deployments of the same git source code. Each one points at its own regional Supabase project and Pinecone index. Tenants are created on whichever deployment the owner signs up through and carry a `data_region` column (`eu` / `us` / `auto`) that must match the deployment at request time — enforced by `lib/region.ts`.

## Environment variables per deployment

| Variable | EU deployment | US deployment |
|----------|---------------|---------------|
| `BIZASSIST_DEPLOY_REGION` | `eu` | `us` |
| `DATABASE_URL` | Supabase EU connection string | Supabase US connection string |
| `PINECONE_API_KEY` | EU index API key | US index API key |
| `PINECONE_INDEX` | `bizassist-eu` | `bizassist-us` |
| `NEXT_PUBLIC_APP_URL` | `https://eu.bizassist.app` | `https://us.bizassist.app` |
| `OPENAI_API_KEY` | same | same |
| `ANTHROPIC_API_KEY` | same | same |

OpenAI and Anthropic credentials can be shared because those providers run out of the US for both deployments. The `dataRegion` pin does not change the LLM provider — that is documented in the DPA as a cross-border transfer covered by SCCs.

## Tenant provisioning

1. When an owner signs up on `eu.bizassist.app`, `createTenantWithAssistant` inserts a row with `data_region = 'eu'` by default.
2. On subsequent requests, `lib/region.ts::assertTenantRegion(tenant.dataRegion)` is called inside API routes and RSC pages. If a US-pinned tenant arrives at the EU deployment (e.g., after a manual migration), the call throws and the request is refused.
3. To move a tenant between regions, use the `/api/compliance/tenant-export` endpoint to pull the data, import it into the target region via the seeder script (out of scope for PoC), and update `data_region`.

## DNS and routing

- `app.bizassist.app` → geo-DNS → `eu.bizassist.app` or `us.bizassist.app` depending on the request's source.
- Once a customer has a tenant, the dashboard URL is sticky: the dashboard frontend reads `NEXT_PUBLIC_APP_URL` and uses absolute URLs for auth callbacks so the tenant lands back on the correct region.

## What still transits out of the EU

Even with the EU pin:

- **Chat messages** are sent to OpenAI (embedding) and Anthropic (generation) in the US.
- **Response text** is returned from the US and stored back in the EU Supabase project.
- **Request logs** at the Vercel edge may briefly transit through the customer's nearest POP.

All of this is listed in `sub-processors.md` and disclosed to end-customers via the generated privacy policy.

## Mitigations for the cross-border transfer

1. **Standard Contractual Clauses** via OpenAI and Anthropic's business DPAs.
2. **PII stripping** (safety layer 3) replaces emails, phone numbers, credit cards, SSNs, and IP addresses with tokens before the message leaves the EU Supabase.
3. **Prompt caching opt-out** at the provider level for sensitive tenants.
4. **Transport-layer encryption** (TLS 1.3) for all provider calls.
5. **Tenant-level disclosure** in the dashboard so the business owner can see exactly which sub-processors touch their data.

## Open items (post-PoC)

- Evaluate Mistral or other EU-based LLM providers once they have production-grade reliability parity.
- Investigate confidential-compute options for the LLM path (Azure Confidential Compute, AWS Nitro).
- Add an automated tenant-move tool that orchestrates export → import → region flip → dashboard confirmation.

## Verifying the invariant in CI

A CI job should run at least once per deployment to confirm:

```sql
-- Must return 0 rows on every deployment:
SELECT id, data_region
FROM tenants
WHERE data_region NOT IN ('auto', '{{BIZASSIST_DEPLOY_REGION}}');
```

Any row returned means a tenant is mis-placed and traffic to it must be blocked immediately.
