# Dashboard Pages Reference

## Overview (Home)
- Metric cards: conversations (today/week/month), resolution rate, CSAT, unanswered count
- Health Score composite (accuracy + engagement + coverage)
- Alerts: errored knowledge items, recent security events
- Real-time updates via Supabase Realtime

## Knowledge Base
- Item list with status badges (pending/processing/active/error) + chunk counts
- Upload: drag & drop for PDF, DOCX, TXT, CSV (50MB max)
- URL import input
- Manual Q&A form
- Error messages with actionable descriptions
- Delete with confirmation → removes vectors within 60s

## Conversations
- Filterable: date range, satisfaction, escalation, security flags
- Full transcript per conversation
- Chunk attribution per response (expandable)
- Confidence scores + latency
- Business owner can annotate + mark for knowledge review

## Analytics
- Conversation volume over time (line chart)
- Resolution rate trend (line chart)
- Top 10 most asked questions (bar chart)
- Unanswered questions grouped by similarity
- CSAT trend (line chart)
- Filters: assistant, date range

## Settings
- Assistant config: name, greeting, tone, fallback message, escalation
- Widget appearance: color picker, position, branding
- Team member management
- API key generation (shown once, stored hashed)
- Billing: plan display, usage meter
- Embed code copy button

## Security
- Event log: type, severity, input preview (truncated), blocked status
- Aggregate counts by event type (cards)
- Date range filter
