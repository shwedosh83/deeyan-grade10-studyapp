import { admin, PUBLIC_Q_COLS, stripItems } from './_boardLib.js';
import classwork from './_classwork.js';

// Unbiased Fisher–Yates shuffle (sort with a random comparator keeps most of the original row order).
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Pick n questions; when several sources are present, take them alternately so "board + prelims" is an even mix.
function mixSources(rows, n) {
  const by = {};
  for (const r of shuffle(rows)) (by[r.source || 'board'] ||= []).push(r);
  const lanes = shuffle(Object.values(by));
  const out = [];
  while (out.length < n && lanes.some(l => l.length)) for (const l of lanes) if (l.length && out.length < n) out.push(l.shift());
  return shuffle(out);
}
// No source chosen = the exam papers (board + prelims). The CISCE competency item bank only appears when asked for.
const EXAM_SOURCES = ['board', 'prelim'];
const bySource = (q, source) => (source ? q.eq('source', source) : q.in('source', EXAM_SOURCES));

// Accepts `chapters` (array) or the older single `chapter`.
function chapterList(body) {
  const c = body.chapters ?? (body.chapter ? [body.chapter] : []);
  return (Array.isArray(c) ? c : [c]).filter(Boolean);
}

// POST { action, ... }
//   list    { subject }                          -> papers that have solutions, with question counts
//   paper   { paperId }                          -> paper + questions WITHOUT solutions (timed mode)
//   sprint  { subject, count, chapter }           -> random objective questions WITH the answer (instant feedback); figure questions only if their page image exists; count 0 = just the chapter list
//   applied { subject, kinds[], chapter, count, userId } -> applied questions WITHOUT solutions, unseen first
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // /api/classwork is served by this function (vercel.json rewrite) to stay within the plan's function limit.
  if (req.query?.route === 'classwork') return classwork(req, res);
  const { action } = req.body || {};
  try {
    if (action === 'list') {
      const { subject } = req.body;
      if (!subject) return res.status(400).json({ error: 'subject required' });
      const { data: papers, error } = await admin.from('board_papers').select('*').eq('subject', subject).in('source', EXAM_SOURCES).order('year', { ascending: false }).order('sem');
      if (error) throw error;
      const { data: qs } = await admin.from('board_questions').select('paper_id,mandatory,marks').eq('subject', subject).limit(5000);
      const counts = {};
      for (const q of qs || []) { const c = (counts[q.paper_id] ||= { questions: 0 }); c.questions++; }
      return res.json({ papers: (papers || []).map(p => ({ ...p, question_count: counts[p.id]?.questions || 0 })) });
    }

    if (action === 'paper') {
      const { paperId } = req.body;
      const { data: paper, error } = await admin.from('board_papers').select('*').eq('id', paperId).single();
      if (error) throw error;
      const { data: questions, error: qe } = await admin.from('board_questions').select(PUBLIC_Q_COLS + ',answer_items').eq('paper_id', paperId).order('q_order');
      if (qe) throw qe;
      return res.json({ paper, questions: questions.map(stripItems) });
    }

    if (action === 'sprint') {
      const { subject, count = 15, source = null } = req.body;   // source: 'board' | 'prelim' | 'competency' | null = board + prelim
      const chapters = chapterList(req.body);
      let query = admin.from('board_questions')
        .select(PUBLIC_Q_COLS + ',correct_option,solution,answer_items')
        .eq('subject', subject).eq('is_objective', true).or('needs_figure.eq.false,figure_url.not.is.null').limit(3000);   // figure questions only when the page image exists
      if (chapters.length) query = query.in('chapter', chapters);
      query = bySource(query, source);
      const { data, error } = await query;
      if (error) throw error;
      let allChapters;
      if (chapters.length) {
        let allQ = admin.from('board_questions').select('chapter').eq('subject', subject).eq('is_objective', true).limit(3000);
        allQ = bySource(allQ, source);
        const { data: all } = await allQ;
        allChapters = [...new Set((all || []).map(x => x.chapter).filter(Boolean))].sort();
      } else {
        allChapters = [...new Set((data || []).map(x => x.chapter).filter(Boolean))].sort();
      }
      const sources = [...new Set((data || []).map(x => x.source).filter(Boolean))].sort();
      const pool = mixSources(data || [], Math.min(count, 100));
      return res.json({ questions: pool, pool_size: (data || []).length, chapters: allChapters, sources });
    }

    if (action === 'applied') {
      const { subject, kinds = [], count = 10, userId = null, source = null } = req.body;   // source: 'board' | 'prelim' | 'competency' | null = board + prelim
      const chapters = chapterList(req.body);
      let q = admin.from('board_questions').select(PUBLIC_Q_COLS + ',answer_items').eq('subject', subject).eq('applied', true).eq('is_objective', false).not('solution', 'is', null);
      if (kinds.length) q = q.in('applied_kind', kinds);
      q = bySource(q, source);
      const { data: unfiltered, error } = await q.limit(3000);
      if (error) throw error;
      const pool = chapters.length ? (unfiltered || []).filter(x => chapters.includes(x.chapter)) : (unfiltered || []);
      let seen = new Set();
      if (userId) {
        const { data: atts } = await admin.from('board_attempts').select('id').eq('user_id', userId).eq('mode', 'applied');
        const ids = (atts || []).map(a => a.id);
        if (ids.length) {
          const { data: ans } = await admin.from('board_attempt_answers').select('question_id').in('attempt_id', ids);
          seen = new Set((ans || []).map(a => a.question_id));
        }
      }
      const n = Math.min(count, 30);
      const unseenQs = mixSources(pool.filter(x => !seen.has(x.id)), n);
      const picked = [...unseenQs, ...mixSources(pool.filter(x => seen.has(x.id)), n - unseenQs.length)].map(stripItems);
      const allChapters = [...new Set((unfiltered || []).map(x => x.chapter).filter(Boolean))].sort();
      const poolKinds = [...new Set(pool.map(x => x.applied_kind).filter(Boolean))];
      const sources = [...new Set(pool.map(x => x.source).filter(Boolean))].sort();
      return res.json({ questions: picked, pool_size: pool.length, unseen: pool.filter(x => !seen.has(x.id)).length, chapters: allChapters, kinds: poolKinds, sources });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error('boardPapers', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
