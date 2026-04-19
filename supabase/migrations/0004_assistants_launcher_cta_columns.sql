-- ─────────────────────────────────────────────────────────────
-- 0004 — Assistants: launcher CTA configuration columns
--
-- Adds the launcher_animation enum and three per-assistant columns
-- that drive the configurable launcher CTA (animation mode, accent
-- color, replay interval). Additive only — existing rows get the
-- "none" animation with default interval, matching today's static
-- launcher behavior exactly.
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1. Enum type used by launcher_animation column
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'launcher_animation') THEN
    CREATE TYPE "launcher_animation" AS ENUM ('none', 'pulse', 'bounce', 'attention_flash');
  END IF;
END$$;

-- 2. Launcher CTA columns on assistants
ALTER TABLE "assistants"
  ADD COLUMN IF NOT EXISTS "launcher_animation"              "launcher_animation" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "launcher_accent_color"           varchar(7),
  ADD COLUMN IF NOT EXISTS "launcher_animation_interval_sec" integer NOT NULL DEFAULT 8;

COMMIT;
