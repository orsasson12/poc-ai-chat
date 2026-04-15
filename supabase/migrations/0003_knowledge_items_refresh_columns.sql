-- ─────────────────────────────────────────────────────────────
-- 0003 — Knowledge items: freshness / refresh tracking columns
--
-- The Drizzle schema at apps/web/lib/db/schema.ts declares refresh
-- tracking columns on knowledge_items that were never migrated to
-- the database. Every insert into knowledge_items was failing with
-- Postgres error 42703 ("column 'refresh_schedule' ... does not exist")
-- because Drizzle's generated INSERT includes the full column list
-- from the schema definition with DEFAULT markers for unprovided
-- columns.
--
-- This migration adds the missing enum, columns and index so the
-- database matches the application schema. Additive only — safe to
-- run against existing data.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1. Enum type used by refresh_schedule column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refresh_schedule') THEN
    CREATE TYPE "refresh_schedule" AS ENUM ('manual', 'daily', 'weekly', 'monthly');
  END IF;
END$$;

-- 2. Freshness tracking columns on knowledge_items
ALTER TABLE "knowledge_items"
  ADD COLUMN IF NOT EXISTS "refresh_schedule"    "refresh_schedule" NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "last_refreshed_at"   timestamptz,
  ADD COLUMN IF NOT EXISTS "next_refresh_at"     timestamptz,
  ADD COLUMN IF NOT EXISTS "refresh_status"      varchar(32),
  ADD COLUMN IF NOT EXISTS "last_refresh_error"  text,
  ADD COLUMN IF NOT EXISTS "content_hash"        varchar(64),
  ADD COLUMN IF NOT EXISTS "version_count"       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "pending_change_id"   uuid;

-- 3. Index used by the refresh scheduler to find due items
CREATE INDEX IF NOT EXISTS "knowledge_items_next_refresh_idx"
  ON "knowledge_items" ("next_refresh_at");

COMMIT;
