-- ============================================================
-- Board paper practice: papers, questions (with solutions), attempts
-- Run in the Supabase SQL editor (the app's API key cannot create tables).
-- Safe to re-run: uses IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS board_papers (
  id               TEXT PRIMARY KEY,                 -- e.g. physics_2024, physics_2022s1
  subject          TEXT NOT NULL,                    -- app subject id: biology, physics, history_civics ...
  year             INTEGER NOT NULL,
  sem              INTEGER,                          -- 1 or 2 for the 2022 split exam, else NULL
  label            TEXT NOT NULL,                    -- "2024", "2022 Sem 1"
  max_marks        INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  reading_minutes  INTEGER NOT NULL DEFAULT 15,
  instructions     TEXT,
  sections         JSONB NOT NULL DEFAULT '[]',      -- [{name,total_marks,rule,compulsory,attempt_n,out_of}]
  has_solutions    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subject, year, sem)
);

CREATE TABLE IF NOT EXISTS board_questions (
  id             TEXT PRIMARY KEY,                   -- paperid_q label, e.g. physics_2024_3(ii)
  paper_id       TEXT NOT NULL REFERENCES board_papers(id) ON DELETE CASCADE,
  subject        TEXT NOT NULL,
  q_label        TEXT NOT NULL,                      -- "1(iii)", "5(a)(ii)"
  q_order        INTEGER NOT NULL,                   -- order within the paper
  q_main         INTEGER,                            -- main question number (1,2,3...) for grouping
  section        TEXT,
  type           TEXT,                               -- mcq | assertion_reason | match | fill_blank | short | long | numerical | program | map_work | diagram ...
  marks          NUMERIC NOT NULL,
  mandatory      TEXT NOT NULL CHECK (mandatory IN ('compulsory','choice')),
  choice_note    TEXT,                               -- e.g. "any 4 of 6 questions in Section B"
  chapter        TEXT,
  topic          TEXT,
  bloom          TEXT,                               -- recall | understand | apply
  applied        BOOLEAN NOT NULL DEFAULT FALSE,
  applied_kind   TEXT,                               -- case | numerical | data_diagram | reasoning | program | map | assertion_reason
  difficulty     INTEGER,                            -- 1-5 (model assigned)
  concepts       TEXT[],
  question       TEXT NOT NULL,                      -- FULL question text
  options        JSONB NOT NULL DEFAULT '{}',        -- {"a":"...","b":"..."} for objective types
  is_objective   BOOLEAN NOT NULL DEFAULT FALSE,     -- auto-markable: MCQ-style (correct_option) or item-style (answer_items)
  answer_items   JSONB,                              -- fill-in / name-the-term / match: [{"prompt":"...","accepted":["oesophagus","food pipe"]}], marks split equally
  correct_option TEXT,                               -- 'a'..'d' for mcq-style
  solution       TEXT,                               -- official solution text
  marking_points JSONB,                              -- [{"point":"...","marks":1}] sums to marks (subjective)
  needs_figure   BOOLEAN NOT NULL DEFAULT FALSE,     -- depends on a diagram / graph / map / toposheet
  figure_desc    TEXT,                               -- text description of the figure, when the model could tell
  figure_page    INTEGER,                            -- page in the source PDF where the question starts
  figure_url     TEXT,                               -- page image for figure questions
  UNIQUE (paper_id, q_label)
);

CREATE INDEX IF NOT EXISTS idx_bq_paper    ON board_questions(paper_id, q_order);
CREATE INDEX IF NOT EXISTS idx_bq_subject  ON board_questions(subject, applied);
CREATE INDEX IF NOT EXISTS idx_bq_objective ON board_questions(subject, is_objective);

CREATE TABLE IF NOT EXISTS board_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID,
  paper_id       TEXT REFERENCES board_papers(id),
  subject        TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('timed','sprint','applied')),
  input_method   TEXT NOT NULL DEFAULT 'typed' CHECK (input_method IN ('typed','scan')),
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  submitted_at   TIMESTAMPTZ,
  seconds_used   INTEGER,
  score          NUMERIC,
  max_score      NUMERIC,
  scan_paths     TEXT[],                             -- storage paths of uploaded scan images
  status         TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted','graded'))
);

CREATE INDEX IF NOT EXISTS idx_ba_user ON board_attempts(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS board_attempt_answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID NOT NULL REFERENCES board_attempts(id) ON DELETE CASCADE,
  question_id    TEXT NOT NULL REFERENCES board_questions(id),
  answer_text    TEXT,                               -- typed, or confirmed text read from the scan
  scan_read_text TEXT,                               -- what the model first read from the scan (for audit)
  marks_awarded  NUMERIC,
  max_marks      NUMERIC,
  points_hit     JSONB,
  points_missed  JSONB,
  feedback       TEXT,
  graded_by      TEXT,                               -- auto | ai | self
  answered_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

-- Row level security: open, matching the rest of this single-family app
ALTER TABLE board_papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_attempts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_attempt_answers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='board_papers' AND policyname='Allow all') THEN
    CREATE POLICY "Allow all" ON board_papers          FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Allow all" ON board_questions       FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Allow all" ON board_attempts        FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY "Allow all" ON board_attempt_answers FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Private storage bucket for scanned answer sheets and figure images.
-- (Skip this block if you prefer to create the bucket in the dashboard: Storage > New bucket "board-scans", private.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('board-scans', 'board-scans', false)
ON CONFLICT (id) DO NOTHING;
