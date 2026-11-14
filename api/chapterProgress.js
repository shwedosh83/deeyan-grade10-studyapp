import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, subject } = req.body;
  if (!subject) return res.status(400).json({ error: 'subject required' });

  // ── 1. Try the SQL RPC first (fast, single query) ──────────────────────────
  if (userId) {
    const { data: rpcData, error: rpcErr } = await admin.rpc('get_chapter_progress', {
      p_user_id: userId,
      p_subject: subject,
    });

    if (!rpcErr && rpcData) {
      return res.json({ progress: rpcData });
    }
    // If RPC doesn't exist yet, fall through to JS implementation below
  }

  // ── 2. JS fallback: compute progress from raw tables ──────────────────────

  // Fetch all questions for subject (excluding prelim chapter 99)
  const { data: questions, error: qErr } = await admin
    .from('questions')
    .select('id, chapter_id, chapter_name')
    .eq('subject', subject)
    .neq('chapter_id', 99);

  if (qErr) return res.status(500).json({ error: qErr.message });

  // Build chapter totals map
  const chapterMap = {}; // chapter_id → { chapter_name, total, questionIds }
  for (const q of questions || []) {
    if (!chapterMap[q.chapter_id]) {
      chapterMap[q.chapter_id] = { chapter_name: q.chapter_name, total: 0, questionIds: new Set() };
    }
    chapterMap[q.chapter_id].total++;
    chapterMap[q.chapter_id].questionIds.add(q.id);
  }

  // If no userId, return totals only with 0 answered
  if (!userId) {
    const progress = Object.entries(chapterMap).map(([cid, ch]) => ({
      chapter_id:         parseInt(cid),
      chapter_name:       ch.chapter_name,
      total_questions:    ch.total,
      answered_questions: 0,
      completion_pct:     0,
    }));
    return res.json({ progress });
  }

  // Fetch user's session IDs for this subject
  const { data: sessions } = await admin
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('subject', subject);

  const sessionIds = (sessions || []).map(s => s.id);

  // Fetch answered question IDs
  let answeredIds = new Set();
  if (sessionIds.length > 0) {
    const { data: answers } = await admin
      .from('session_answers')
      .select('question_id')
      .in('session_id', sessionIds);

    for (const a of answers || []) answeredIds.add(a.question_id);
  }

  // Compute per-chapter progress
  const progress = Object.entries(chapterMap)
    .map(([cid, ch]) => {
      const answered = [...ch.questionIds].filter(id => answeredIds.has(id)).length;
      const pct = ch.total > 0 ? Math.round((answered / ch.total) * 1000) / 10 : 0;
      return {
        chapter_id:         parseInt(cid),
        chapter_name:       ch.chapter_name,
        total_questions:    ch.total,
        answered_questions: answered,
        completion_pct:     pct,
      };
    })
    .sort((a, b) => a.chapter_id - b.chapter_id);

  return res.json({ progress });
}
