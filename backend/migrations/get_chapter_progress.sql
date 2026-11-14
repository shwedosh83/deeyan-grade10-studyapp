-- Run this in Supabase Dashboard → SQL Editor
-- Creates the get_chapter_progress RPC used for chapter completion tracking

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
