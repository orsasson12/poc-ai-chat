-- Migration: 0001_compliance_and_analytics
-- Applies the schema drift accumulated during the analytics + compliance feature work.
-- All changes are additive: new columns carry DEFAULTs so existing rows backfill automatically,
-- and new tables are strictly new. No DROPs, no lossy ALTERs.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. tenants: analytics + compliance columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "cost_per_ticket_cents" integer NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "data_region" varchar(8) NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "retention_days_conversations" integer NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS "retention_days_leads" integer NOT NULL DEFAULT 730,
  ADD COLUMN IF NOT EXISTS "retention_days_security_events" integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS "ai_disclosure_mode" varchar(16) NOT NULL DEFAULT 'banner',
  ADD COLUMN IF NOT EXISTS "ai_disclosure_text" text,
  ADD COLUMN IF NOT EXISTS "dpa_accepted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "dpa_accepted_version" varchar(32);

-- ─────────────────────────────────────────────────────────────
-- 2. assistants: cookieless_mode flag
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "assistants"
  ADD COLUMN IF NOT EXISTS "cookieless_mode" boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────
-- 3. analytics_daily: per-tenant daily rollup facts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "analytics_daily" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "date" date NOT NULL,
  "conversation_count" integer NOT NULL DEFAULT 0,
  "message_count" integer NOT NULL DEFAULT 0,
  "deflected_count" integer NOT NULL DEFAULT 0,
  "escalated_count" integer NOT NULL DEFAULT 0,
  "fallback_count" integer NOT NULL DEFAULT 0,
  "avg_confidence" numeric(4,3),
  "avg_latency_ms" integer,
  "avg_messages_per_conv" numeric(6,2),
  "tokens_used" integer NOT NULL DEFAULT 0,
  "positive_feedback" integer NOT NULL DEFAULT 0,
  "negative_feedback" integer NOT NULL DEFAULT 0,
  "estimated_savings_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_daily_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_tenant_date_idx"
  ON "analytics_daily" ("tenant_id", "date");

-- ─────────────────────────────────────────────────────────────
-- 4. question_clusters: clustered unanswered questions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "question_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assistant_id" uuid,
  "label" varchar(120) NOT NULL,
  "centroid" jsonb NOT NULL,
  "question_count" integer NOT NULL DEFAULT 0,
  "avg_confidence" numeric(4,3),
  "suggested_question" text,
  "suggested_answer" text,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "knowledge_item_id" uuid,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "question_clusters_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "question_clusters_assistant_id_fkey"
    FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE CASCADE,
  CONSTRAINT "question_clusters_knowledge_item_id_fkey"
    FOREIGN KEY ("knowledge_item_id") REFERENCES "knowledge_items"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "question_clusters_tenant_id_idx"
  ON "question_clusters" ("tenant_id");
CREATE INDEX IF NOT EXISTS "question_clusters_status_idx"
  ON "question_clusters" ("status");

-- ─────────────────────────────────────────────────────────────
-- 5. clustered_questions: join table for cluster members
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "clustered_questions" (
  "cluster_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "question_text" text NOT NULL,
  "similarity" numeric(5,4),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("cluster_id", "message_id"),
  CONSTRAINT "clustered_questions_cluster_id_fkey"
    FOREIGN KEY ("cluster_id") REFERENCES "question_clusters"("id") ON DELETE CASCADE,
  CONSTRAINT "clustered_questions_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE,
  CONSTRAINT "clustered_questions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "clustered_questions_message_idx"
  ON "clustered_questions" ("message_id");
CREATE INDEX IF NOT EXISTS "clustered_questions_tenant_idx"
  ON "clustered_questions" ("tenant_id");

-- ─────────────────────────────────────────────────────────────
-- 6. sar_requests: Subject-Access-Request audit log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sar_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "type" varchar(16) NOT NULL,
  "subject_email" varchar(256),
  "subject_identifier" varchar(256),
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "requested_by" uuid,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "result_path" text,
  "error_msg" text,
  "notes" text,
  CONSTRAINT "sar_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "sar_requests_tenant_id_idx"
  ON "sar_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "sar_requests_status_idx"
  ON "sar_requests" ("status");

-- ─────────────────────────────────────────────────────────────
-- 7. data_deletion_audit: GDPR Art.17 / retention erasure log
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "data_deletion_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "deletion_type" varchar(16) NOT NULL,
  "subject_email" varchar(256),
  "subject_identifier" varchar(256),
  "conversations_deleted" integer NOT NULL DEFAULT 0,
  "messages_deleted" integer NOT NULL DEFAULT 0,
  "leads_deleted" integer NOT NULL DEFAULT 0,
  "security_events_deleted" integer NOT NULL DEFAULT 0,
  "chunks_deleted" integer NOT NULL DEFAULT 0,
  "performed_at" timestamptz NOT NULL DEFAULT now(),
  "performed_by" uuid,
  "sar_request_id" uuid,
  CONSTRAINT "data_deletion_audit_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "data_deletion_audit_sar_request_id_fkey"
    FOREIGN KEY ("sar_request_id") REFERENCES "sar_requests"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "data_deletion_audit_tenant_id_idx"
  ON "data_deletion_audit" ("tenant_id");
CREATE INDEX IF NOT EXISTS "data_deletion_audit_performed_at_idx"
  ON "data_deletion_audit" ("performed_at");

COMMIT;
