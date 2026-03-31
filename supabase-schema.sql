-- ============================================================
-- Deeyan Study App - Supabase Schema (multi-subject)
-- Run this in Supabase SQL Editor
-- ============================================================

-- Questions table (populated from JSON via upload script)
CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT 'biology',
  chapter_id INTEGER NOT NULL,
  chapter_name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'mcq',
  skill TEXT NOT NULL,
  year_tag TEXT,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '{}',
  answer TEXT NOT NULL,
  explanation TEXT
);

CREATE INDEX idx_questions_subject ON questions(subject);
CREATE INDEX idx_questions_chapter ON questions(subject, chapter_id);
CREATE INDEX idx_questions_skill ON questions(subject, skill);
CREATE INDEX idx_questions_type ON questions(type);

-- Quiz sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL DEFAULT 'biology',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  chapter_id INTEGER,
  chapter_name TEXT,
  total_questions INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0
);

CREATE INDEX idx_sessions_subject ON sessions(subject);

-- Individual answers within a session
CREATE TABLE session_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES questions(id),
  user_answer TEXT,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_answers_session ON session_answers(session_id);

-- Skill scores (aggregated per subject+skill combination)
CREATE TABLE skill_scores (
  subject TEXT NOT NULL DEFAULT 'biology',
  skill TEXT NOT NULL,
  chapter_id INTEGER NOT NULL,
  chapter_name TEXT NOT NULL,
  total_attempts INTEGER DEFAULT 0,
  correct_attempts INTEGER DEFAULT 0,
  last_attempted TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (subject, skill)
);

CREATE INDEX idx_skill_scores_subject ON skill_scores(subject);

-- Weekly summaries (one per subject per week)
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL DEFAULT 'biology',
  week_start DATE NOT NULL,
  summary_text TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (subject, week_start)
);

-- ============================================================
-- Row Level Security (open for now — single user app)
-- ============================================================
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON session_answers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON skill_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON weekly_summaries FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: Atomic skill score upsert (subject-aware)
-- ============================================================
CREATE OR REPLACE FUNCTION update_skill_score(
  p_subject TEXT,
  p_skill TEXT,
  p_chapter_id INTEGER,
  p_chapter_name TEXT,
  p_is_correct BOOLEAN
) RETURNS VOID AS $$
BEGIN
  INSERT INTO skill_scores (subject, skill, chapter_id, chapter_name, total_attempts, correct_attempts, last_attempted, updated_at)
  VALUES (p_subject, p_skill, p_chapter_id, p_chapter_name, 1, CASE WHEN p_is_correct THEN 1 ELSE 0 END, NOW(), NOW())
  ON CONFLICT (subject, skill) DO UPDATE SET
    total_attempts = skill_scores.total_attempts + 1,
    correct_attempts = skill_scores.correct_attempts + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    last_attempted = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Get random MCQ questions for a quiz session (subject-aware)
-- ============================================================
CREATE OR REPLACE FUNCTION get_random_questions(
  p_subject TEXT DEFAULT 'biology',
  p_chapter_id INTEGER DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
) RETURNS SETOF questions AS $$
BEGIN
  RETURN QUERY
    SELECT * FROM questions
    WHERE subject = p_subject
      AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id)
      AND (p_type IS NULL OR type = p_type)
    ORDER BY RANDOM()
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC: Get weak skills for a subject (lowest accuracy, min 3 attempts)
-- ============================================================
CREATE OR REPLACE FUNCTION get_weak_skills(
  p_subject TEXT DEFAULT 'biology',
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE(skill TEXT, chapter_name TEXT, accuracy NUMERIC, total_attempts INTEGER) AS $$
BEGIN
  RETURN QUERY
    SELECT
      s.skill,
      s.chapter_name,
      ROUND((s.correct_attempts::NUMERIC / s.total_attempts) * 100, 1) AS accuracy,
      s.total_attempts
    FROM skill_scores s
    WHERE s.subject = p_subject
      AND s.total_attempts >= 3
    ORDER BY accuracy ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
