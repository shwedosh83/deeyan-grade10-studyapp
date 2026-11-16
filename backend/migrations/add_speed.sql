-- Speed-up: lookup indexes for the history tables, plus the chapter-progress shortcut used by the Practice tab.
-- Safe to run more than once. Run in the Supabase SQL editor.

CREATE INDEX IF NOT EXISTS idx_sessions_user_subject      ON sessions(user_id, subject);
CREATE INDEX IF NOT EXISTS idx_session_answers_session    ON session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_answers_question   ON session_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_board_attempts_user        ON board_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_board_attempt_answers_att  ON board_attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject_chapter  ON questions(subject, chapter_id);
CREATE INDEX IF NOT EXISTS idx_questions_subject_type     ON questions(subject, type);
CREATE INDEX IF NOT EXISTS idx_bq_subject_objective       ON board_questions(subject, is_objective);

CREATE OR REPLACE FUNCTION get_chapter_progress(
  p_user_id uuid,
  p_subject  text
)
RETURNS TABLE (
  chapter_id          int,
  chapter_name        text,
  total_questions     bigint,
  answered_questions  bigint,
  completion_pct      numeric
)
LANGUAGE sql
STABLE
AS $func$
  SELECT
    q.chapter_id,
    q.chapter_name,
    COUNT(DISTINCT q.id)                          AS total_questions,
    COUNT(DISTINCT sa.question_id)                AS answered_questions,
    ROUND(
      COUNT(DISTINCT sa.question_id)::numeric
      / NULLIF(COUNT(DISTINCT q.id), 0) * 100,
      1
    )                                             AS completion_pct
  FROM questions q
  LEFT JOIN session_answers sa
         ON sa.question_id = q.id
        AND sa.session_id IN (
              SELECT id FROM sessions
              WHERE user_id = p_user_id
                AND subject  = p_subject
            )
  WHERE q.subject    = p_subject
    AND q.chapter_id <> 99          -- exclude prelim papers
  GROUP BY q.chapter_id, q.chapter_name
  ORDER BY q.chapter_id;
$func$;
