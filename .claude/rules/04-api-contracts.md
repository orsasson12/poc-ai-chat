# API Contracts

## POST /api/chat — Main Conversation Endpoint
Zod validation:
- `assistantId`: UUID string, required
- `message`: string, required, max 1000 chars
- `sessionId`: string, required, min 8 chars
- `history`: array of {role, content}, max 20 items, optional

Pipeline: validate → resolve tenant → safety input (3 layers) → embed query → retrieve chunks → model selection → generate (stream) → safety output → log

## POST /api/ingest — Trigger Ingestion
- `assistantId`: UUID, required
- `type`: enum (document|url|manual_qa|structured)
- `file` or `url` or `content` depending on type

## DELETE /api/ingest — Remove Knowledge Item
- `knowledgeItemId`: UUID, required
- Removes Pinecone vectors + Postgres chunks within 60s

## GET /api/widget/[id]/config — Public Assistant Config
- Edge cached 60s
- Returns: name, color, greeting, position, is_active
- No auth required (public endpoint)

## POST /api/webhooks/stripe — Billing Events
- Verify Stripe signature
- Handle: subscription.created, subscription.updated, invoice.paid, invoice.payment_failed

## Model Selection Logic
```
message.length > 120 || chunks.length === 0 → GPT-4o
otherwise → GPT-4o-mini
OpenAI timeout/5xx → Claude Sonnet 4.5 failover (<30s)
```

## Streaming
- SSE format: `data: <token>\n\n`
- Cursor `▋` shown while streaming
- Failed output validation → single complete fallback message (no partial display)
