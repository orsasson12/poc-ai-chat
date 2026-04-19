-- ─────────────────────────────────────────────────────────────
-- 0005 — Assistants: launcher icon selection column
--
-- Adds a launcher_icon enum + column so tenants can swap the
-- default speech-bubble SVG on their widget launcher for one of
-- six preset icons, or use their uploaded avatar image instead.
-- Additive only — existing rows default to "chat" (today's icon).
-- ─────────────────────────────────────────────────────────────

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'launcher_icon') THEN
    CREATE TYPE "launcher_icon" AS ENUM ('chat', 'help', 'sparkle', 'bolt', 'heart', 'phone', 'avatar');
  END IF;
END$$;

ALTER TABLE "assistants"
  ADD COLUMN IF NOT EXISTS "launcher_icon" "launcher_icon" NOT NULL DEFAULT 'chat';

COMMIT;
