-- Error log: the student's own tag for each lost mark (the lost marks themselves come from
-- session_answers, board_attempt_answers and classwork_results). Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS error_log (
  user_id     UUID NOT NULL,
  source      TEXT NOT NULL,                 -- quiz | board | classwork
  ref_id      TEXT NOT NULL,                 -- id of the answer row in that source table
  loss_type   TEXT,                          -- careless | concept | method | units | diagram | reason | wording | time | other
  note        TEXT,
  redo_1      BOOLEAN NOT NULL DEFAULT false, -- redone after 3 days
  redo_2      BOOLEAN NOT NULL DEFAULT false, -- redone after 10 days
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source, ref_id)
);

-- Read and written only through the app's server API (service key), like the other tables.
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
