-- ============================================================
-- Multi-user support: add user_id to all user-data tables
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Add user_id columns
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE skill_scores
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE weekly_summaries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enable Row Level Security
ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies: users can only see/edit their own data

-- sessions
DROP POLICY IF EXISTS "users_own_sessions" ON sessions;
CREATE POLICY "users_own_sessions" ON sessions
  FOR ALL USING (auth.uid() = user_id);

-- session_answers (linked via sessions)
DROP POLICY IF EXISTS "users_own_session_answers" ON session_answers;
CREATE POLICY "users_own_session_answers" ON session_answers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions WHERE sessions.id = session_answers.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- skill_scores
DROP POLICY IF EXISTS "users_own_skill_scores" ON skill_scores;
CREATE POLICY "users_own_skill_scores" ON skill_scores
  FOR ALL USING (auth.uid() = user_id);

-- weekly_summaries
DROP POLICY IF EXISTS "users_own_weekly_summaries" ON weekly_summaries;
CREATE POLICY "users_own_weekly_summaries" ON weekly_summaries
  FOR ALL USING (auth.uid() = user_id);

-- questions table: readable by all authenticated users
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "questions_readable" ON questions;
CREATE POLICY "questions_readable" ON questions
  FOR SELECT USING (auth.role() = 'authenticated');

-- 4. Update the update_skill_score RPC to scope by user_id
CREATE OR REPLACE FUNCTION update_skill_score(
  p_subject TEXT,
  p_skill TEXT,
  p_chapter_id INT,
  p_chapter_name TEXT,
  p_is_correct BOOLEAN
) RETURNS VOID AS $$
BEGIN
  INSERT INTO skill_scores (user_id, subject, skill, chapter_id, chapter_name, total_attempts, correct_attempts)
    VALUES (auth.uid(), p_subject, p_skill, p_chapter_id, p_chapter_name, 1, CASE WHEN p_is_correct THEN 1 ELSE 0 END)
  ON CONFLICT (user_id, subject, skill, chapter_id)
  DO UPDATE SET
    total_attempts   = skill_scores.total_attempts   + 1,
    correct_attempts = skill_scores.correct_attempts + CASE WHEN p_is_correct THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update skill_scores unique constraint to include user_id
-- Drop old constraint first if it exists without user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'skill_scores_subject_skill_chapter_id_key'
  ) THEN
    ALTER TABLE skill_scores DROP CONSTRAINT skill_scores_subject_skill_chapter_id_key;
  END IF;
END $$;

ALTER TABLE skill_scores
  DROP CONSTRAINT IF EXISTS skill_scores_user_subject_skill_chapter_key;

ALTER TABLE skill_scores
  ADD CONSTRAINT skill_scores_user_subject_skill_chapter_key
  UNIQUE (user_id, subject, skill, chapter_id);

-- 6. Update get_weak_skills RPC to scope by user_id
CREATE OR REPLACE FUNCTION get_weak_skills(p_subject TEXT, p_limit INT DEFAULT 3)
RETURNS TABLE(skill TEXT, chapter_name TEXT, accuracy NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT ss.skill, ss.chapter_name,
         ROUND(ss.correct_attempts::NUMERIC / NULLIF(ss.total_attempts, 0) * 100) AS accuracy
  FROM skill_scores ss
  WHERE ss.subject = p_subject
    AND ss.user_id = auth.uid()
    AND ss.total_attempts >= 3
  ORDER BY accuracy ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
