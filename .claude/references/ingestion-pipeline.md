# Knowledge Ingestion Pipeline Reference

## Supported Input Types (MVP)
| Type | Formats | Max Size |
|---|---|---|
| Document upload | PDF, DOCX, TXT, CSV | 50MB per file |
| URL import | Any public HTTP/HTTPS | Single page |
| Manual Q&A | Form in dashboard | Unlimited pairs |
| Structured data | Business hours, location, services, contact | Form fields |

## Eight-Step Inngest Worker
1. mark-processing → knowledge_items.status = 'processing'
2. extract-text → download file / fetch URL → raw text
3. chunk-text → split into ~400-token chunks, 200-char overlap
4. delete-old-vectors → remove existing Pinecone vectors (re-ingestion)
5. embed-chunks → text-embedding-3-small, batches of 100
6. upsert-to-pinecone → namespace(tenantId).upsert(), batches of 100
7. save-chunk-metadata → INSERT chunks to Postgres
8. mark-active → status = 'active', chunk_count = N

## Chunking Strategy
- Target: 400 tokens (~1,600 chars)
- Hard ceiling: 600 tokens
- Overlap: 200 characters
- Split by double newlines first (paragraph boundaries)
- Over ceiling → split by sentence boundaries with overlap
- Headings detected (markdown # or ALL-CAPS) stored as metadata

## Text Extraction
- **PDF:** pdf-parse with custom page renderer
- **DOCX:** mammoth extractRawText
- **CSV:** detect question/answer columns → Q&A pairs; else join rows
- **URL:** fetch (10s timeout) → strip script/style/nav/header/footer → clean text
- **TXT/manual/structured:** pass directly to chunker

## Re-ingestion
- Delete old vectors by knowledgeItemId metadata filter
- Delete Postgres chunks: DELETE WHERE knowledge_item_id = ?
- Then run full pipeline again

## Real-time Status
- Supabase Realtime on knowledge_items table
- Dashboard updates instantly on status change
- Chunk count appears when active
