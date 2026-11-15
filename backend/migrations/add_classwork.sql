-- School class tests and worksheets uploaded by the student or parent.
-- Files live in the private storage bucket `classwork`; /ingest-classwork (Claude Code) reads pending uploads,
-- adds their questions to board_questions (source 'classwork') and records the marks he actually got.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS classwork_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  subject       TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'class_test',      -- class_test | worksheet | other
  title         TEXT,
  test_date     DATE,
  marks_scored  NUMERIC,                                  -- as written on the paper, optional
  marks_max     NUMERIC,
  files         JSONB NOT NULL DEFAULT '[]',              -- [{ path, name, type, size }]
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',          -- pending | processed | failed
  status_note   TEXT,
  paper_id      TEXT,                                     -- board_papers.id once processed
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cw_uploads_user ON classwork_uploads(user_id, created_at DESC);

-- One row per marked question: what the teacher awarded.
CREATE TABLE IF NOT EXISTS classwork_results (
  id            BIGSERIAL PRIMARY KEY,
  upload_id     UUID NOT NULL REFERENCES classwork_uploads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  question_id   TEXT,                                     -- board_questions.id
  subject       TEXT NOT NULL,
  chapter       TEXT,
  topic         TEXT,
  marks         NUMERIC NOT NULL,
  got           NUMERIC,                                  -- null when the paper was not marked
  mistake       TEXT,                                     -- short note on what went wrong, if anything
  test_date     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cw_results_user ON classwork_results(user_id, subject);

-- The app reads and writes these only through its server API (service key), like the board tables.
ALTER TABLE classwork_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE classwork_results ENABLE ROW LEVEL SECURITY;
