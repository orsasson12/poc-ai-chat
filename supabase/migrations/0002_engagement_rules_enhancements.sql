-- Migration: 0002_engagement_rules_enhancements
--
-- Backfills the engagement_rules / leads / lead_events tables (missing from
-- the live DB even though they're in the Drizzle schema) AND adds the new
-- frequency-cap + rich-message columns for the engagement-rules feature bundle.
--
-- Idempotent: uses IF NOT EXISTS everywhere + DO $$ guarded enum creation.
-- Safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Enums required by the new tables
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "engagement_trigger" AS ENUM (
    'time_on_page', 'scroll_depth', 'exit_intent', 'return_visitor', 'url_pattern'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "lead_intent" AS ENUM ('high', 'medium', 'low', 'unknown');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. engagement_rules — create if missing, then add new columns
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "engagement_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assistant_id" uuid NOT NULL,
  "name" varchar(256) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "trigger" engagement_trigger NOT NULL,
  "delay_seconds" integer DEFAULT 15,
  "scroll_percent" integer DEFAULT 50,
  "url_pattern" varchar(512),
  "proactive_message" text NOT NULL,
  "qualifying_questions" jsonb DEFAULT '[]'::jsonb,
  "priority" integer NOT NULL DEFAULT 100,
  "max_per_session" integer NOT NULL DEFAULT 0,
  "max_per_visitor" integer NOT NULL DEFAULT 0,
  "cooldown_seconds" integer NOT NULL DEFAULT 0,
  "message_image" text,
  "message_cta" jsonb,
  "message_buttons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "impressions" integer NOT NULL DEFAULT 0,
  "engagements" integer NOT NULL DEFAULT 0,
  "leads_generated" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "engagement_rules_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "engagement_rules_assistant_id_fkey"
    FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "engagement_rules_tenant_id_idx"
  ON "engagement_rules" ("tenant_id");
CREATE INDEX IF NOT EXISTS "engagement_rules_assistant_id_idx"
  ON "engagement_rules" ("assistant_id");

-- If the table existed in a pre-bundle state, these ADDs fill in the gaps.
ALTER TABLE "engagement_rules"
  ADD COLUMN IF NOT EXISTS "max_per_session" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_per_visitor" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cooldown_seconds" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "message_image" text,
  ADD COLUMN IF NOT EXISTS "message_cta" jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "message_buttons" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- 3. leads — full create
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assistant_id" uuid NOT NULL,
  "visitor_id" varchar(128) NOT NULL,
  "email" varchar(256),
  "phone" varchar(64),
  "name" varchar(256),
  "intent" lead_intent NOT NULL DEFAULT 'unknown',
  "status" lead_status NOT NULL DEFAULT 'new',
  "tags" text[] NOT NULL DEFAULT '{}',
  "qualification_answers" jsonb DEFAULT '{}'::jsonb,
  "source_url" text,
  "source_trigger" engagement_trigger,
  "engagement_rule_id" uuid,
  "language" varchar(10),
  "device" varchar(64),
  "referrer" text,
  "total_page_views" integer NOT NULL DEFAULT 0,
  "total_conversations" integer NOT NULL DEFAULT 0,
  "total_messages" integer NOT NULL DEFAULT 0,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "leads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "leads_assistant_id_fkey"
    FOREIGN KEY ("assistant_id") REFERENCES "assistants"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "leads_tenant_id_idx" ON "leads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "leads_visitor_id_idx" ON "leads" ("visitor_id");
CREATE INDEX IF NOT EXISTS "leads_intent_idx" ON "leads" ("intent");
CREATE INDEX IF NOT EXISTS "leads_email_idx" ON "leads" ("email");

-- ─────────────────────────────────────────────────────────────
-- 4. lead_events — full create
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "lead_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb,
  "page_url" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lead_events_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "lead_events_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lead_events_lead_id_idx" ON "lead_events" ("lead_id");
CREATE INDEX IF NOT EXISTS "lead_events_tenant_id_idx" ON "lead_events" ("tenant_id");

-- ─────────────────────────────────────────────────────────────
-- 5. conversations.engagement_rule_id — the dead column we're waking up
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "engagement_rule_id" uuid;

COMMIT;
