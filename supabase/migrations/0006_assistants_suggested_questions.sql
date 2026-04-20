-- ─────────────────────────────────────────────────────────────
-- 0006 — Assistants: suggested-question chips
--
-- Adds a per-assistant mode + list for launcher-bubble starter
-- questions. "auto" (default) = the widget config endpoint derives
-- the top-5 first user messages from conversation history on read.
-- "manual" = the business owner curates up to 5 questions stored
-- verbatim in `suggested_questions`. Additive only; existing rows
-- default to `auto` with an empty array, preserving current behavior.
-- ─────────────────────────────────────────────────────────────

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suggested_questions_mode') THEN
    CREATE TYPE "suggested_questions_mode" AS ENUM ('manual', 'auto');
  END IF;
END$$;

ALTER TABLE "assistants"
  ADD COLUMN IF NOT EXISTS "suggested_questions_mode" "suggested_questions_mode" NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "suggested_questions" text[] NOT NULL DEFAULT '{}';

COMMIT;
