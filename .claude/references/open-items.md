# Open Items — Founder Decisions Required

## Before Week 1
- **Domain name** — hardcoded in widget iframe src, CORS, Cloudflare config
- **Brand name + assistant name** — used in fallback messages, widget UI, all copy
- **Pricing tiers** — Stripe products/prices needed. Working assumption: Starter $49/500, Professional $99/2000, Business $199/5000

## Before Week 3
- **Default fallback message** — suggested: "I don't have specific information about that. Please contact us directly for help."
- **Default confidence threshold** — currently 0.65 cosine similarity
- **Dashboard UI language** — English only for MVP (confirm)

## Accounts & Keys to Provision
- OpenAI API key (separate org, not personal)
- Anthropic API key (console.anthropic.com)
- Pinecone: account + index "bizassist-prod" (cosine, 1536 dims)
- Supabase: project URL + anon key + service role key (Pro plan for PITR)
- Stripe: secret key + publishable key + webhook signing secret
- Cloudflare: R2 bucket + account ID + API token
- Vercel: connected project + env vars
- Inngest: event key + signing key

## Design Decisions Before Week 3
- Dashboard visual design / brand guidelines / color palette
- Widget default color (current: #2563eb blue) and position (current: bottom-right)
- Onboarding wizard flow (4 steps assumed: details → upload → configure → deploy)
