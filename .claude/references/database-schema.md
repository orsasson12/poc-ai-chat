# Database Schema Reference

## tenants
`id, owner_id (→ auth.users), name, slug, plan, status, stripe_customer_id, created_at`

## assistants
`id, tenant_id, name, greeting, tone, fallback_msg, escalation_email, escalation_webhook, widget_color, widget_position, is_active, confidence_threshold (default 0.65), created_at`

## knowledge_items
`id, tenant_id, assistant_id, type (document|url|manual_qa|structured), title, content, source_url, file_path, file_size, status (pending|processing|active|error|paused), chunk_count, error_msg, created_at`

## chunks
`id, tenant_id, knowledge_item_id, pinecone_id, content, token_count, chunk_index, heading`

## conversations
`id, tenant_id, assistant_id, session_id, started_at, ended_at, message_count, escalated, satisfaction (-1|1)`

## messages
`id, conversation_id, tenant_id, role (user|assistant), content, chunks_used (uuid[]), confidence (numeric), latency_ms, tokens_used, is_fallback`

## security_events
`id, tenant_id, conversation_id, event_type, severity, input_text, classification_score, blocked, created_at`

## tenant_members
`id, tenant_id, user_id, role (owner|admin|manager|viewer), invited_by, accepted_at`

## usage_logs
`id, tenant_id, period_start (date), conversations, tokens_in, tokens_out`

## Rules
- All tenant-scoped tables have RLS enabled
- All tables indexed on tenant_id + primary sort column
- UUIDs for all primary keys
- timestamps with timezone
