-- Spaced repetition: queue wrong answers to review in 3 days
CREATE TABLE IF NOT EXISTS review_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL,
  subject       TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, question_id)
);

ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_review_queue" ON review_queue;
CREATE POLICY "users_own_review_queue" ON review_queue
  FOR ALL USING (auth.uid() = user_id);

-- Index for fast lookup of due reviews
CREATE INDEX IF NOT EXISTS idx_review_queue_user_scheduled
  ON review_queue (user_id, scheduled_for)
  WHERE completed_at IS NULL;
