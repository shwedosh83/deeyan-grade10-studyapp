import { createClient } from '@supabase/supabase-js';

// Unbiased Fisher–Yates shuffle (sort with a random comparator keeps most of the original row order).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { subject, source, chapters, questionType, limit: reqLimit, userId } = req.body;
  const limit = Math.min(reqLimit || 10, 500);

  if (!subject) return res.status(400).json({ error: 'subject required' });

  // ── 1. Find the pool by id only (light), then fetch full text just for the questions picked ──
  const FULL = 'id, subject, chapter_id, chapter_name, question, answer, options, type, skill, year_tag, board_tips, explanation';
  const withDetails = async picked => {
    if (!picked.length) return [];
    const { data } = await admin.from('questions').select(FULL).in('id', picked.map(q => q.id));
    const byId = Object.fromEntries((data || []).map(q => [q.id, q]));
    return picked.map(q => byId[q.id]).filter(Boolean);
  };
  let query = admin
    .from('questions')
    .select('id')
    .eq('subject', subject);

  if (chapters && chapters.length > 0 && source !== 'prelim') {
    query = query.in('chapter_id', chapters);
  }
  if (questionType) {
    query = query.eq('type', questionType);
  }
  if (source === 'prelim') {
    query = query.eq('skill', 'Prelim 2025-26');
  } else if (source === 'board') {
    query = query
      .not('year_tag', 'is', null)
      .neq('year_tag', 'AI Generated')
      .neq('skill', 'Prelim 2025-26');
  } else if (source === 'ai') {
    query = query.eq('year_tag', 'AI Generated');
  }

  const { data: pool, error: poolErr } = await query.limit(2000);
  if (poolErr) return res.status(500).json({ error: poolErr.message });
  if (!pool || pool.length === 0) return res.json({ questions: [] });

  // ── 2. No userId → plain shuffle, no spaced repetition ───────────────────
  if (!userId) {
    const shuffled = shuffle(pool).slice(0, limit);
    return res.json({ questions: await withDetails(shuffled) });
  }

  // ── 3. Fetch user's answer history for this subject ───────────────────────
  // Get sessions belonging to this user + subject (session ids → answers)
  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('subject', subject);

  const sessionIds = (sessions || []).map(s => s.id);

  let answerHistory = [];
  if (sessionIds.length > 0) {
    const { data: answers } = await admin
      .from('session_answers')
      .select('question_id, is_correct, answered_at')
      .in('session_id', sessionIds);
    answerHistory = answers || [];
  }

  // ── 4. Build per-question summary: most recent answer ─────────────────────
  // Map: question_id → { is_correct, answered_at }
  const lastAnswer = {};
  for (const a of answerHistory) {
    const existing = lastAnswer[a.question_id];
    if (!existing || new Date(a.answered_at) > new Date(existing.answered_at)) {
      lastAnswer[a.question_id] = a;
    }
  }

  // ── 5. Bucket questions by priority ──────────────────────────────────────
  // Priority 1: Never seen
  // Priority 2: Last answer was WRONG  (needs retry soonest)
  // Priority 3: Last answer was CORRECT (serve oldest-answered first = longest gap)
  const unseen  = [];
  const wrong   = [];
  const correct = [];

  for (const q of pool) {
    const hist = lastAnswer[q.id];
    if (!hist) {
      unseen.push(q);
    } else if (!hist.is_correct) {
      wrong.push({ q, answeredAt: hist.answered_at });
    } else {
      correct.push({ q, answeredAt: hist.answered_at });
    }
  }

  // Unseen first (shuffled). Then mistakes, oldest first, then correct ones, longest ago first.
  // Anything answered in the last 24 hours goes to the very end, so a new round never repeats
  // what he just did while the bank still has other questions.
  const DAY = 24 * 60 * 60 * 1000, now = Date.now();
  const recent = x => now - new Date(x.answeredAt).getTime() < DAY;
  unseen.splice(0, unseen.length, ...shuffle(unseen));
  const byOldest = (a, b) => new Date(a.answeredAt) - new Date(b.answeredAt);
  wrong.sort(byOldest);
  correct.sort(byOldest);

  // ── 6. Fill up to `limit` from each bucket in order ──────────────────────
  const picked = [];
  const addFrom = (bucket, isWrapped) => {
    for (const item of bucket) {
      if (picked.length >= limit) break;
      picked.push(isWrapped ? item.q : item);
    }
  };

  addFrom(unseen, false);
  addFrom(wrong.filter(x => !recent(x)), true);
  addFrom(correct.filter(x => !recent(x)), true);
  addFrom([...wrong, ...correct].filter(recent).sort(byOldest), true);

  return res.json({
    questions: await withDetails(picked),
    meta: {
      unseen:  Math.min(unseen.length, limit),
      wrong:   wrong.length,
      correct: correct.length,
      total_pool: pool.length,
    }
  });
}
