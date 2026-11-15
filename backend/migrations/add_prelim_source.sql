-- ============================================================
-- Prelim papers as a second source in the board bank.
-- Run in the Supabase SQL editor (the app's API key cannot ALTER tables).
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================================

ALTER TABLE board_papers    ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'board';  -- 'board' | 'prelim'
ALTER TABLE board_papers    ADD COLUMN IF NOT EXISTS school     TEXT;                           -- "Villa Theresa High School" (prelims only)
ALTER TABLE board_papers    ADD COLUMN IF NOT EXISTS exam_label TEXT;                           -- "Prelim 1", "Pre-prelim", "Mock 2" ...

ALTER TABLE board_questions ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'board';
ALTER TABLE board_questions ADD COLUMN IF NOT EXISTS school     TEXT;

CREATE INDEX IF NOT EXISTS idx_bq_source ON board_questions(subject, source);
