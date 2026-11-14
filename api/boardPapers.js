import { admin, PUBLIC_Q_COLS, stripItems } from './_boardLib.js';

// POST { action, ... }
//   list    { subject }                          -> papers that have solutions, with question counts
//   paper   { paperId }                          -> paper + questions WITHOUT solutions (timed mode)
//   sprint  { subject, count }                    -> random objective questions WITH the answer (instant feedback); figure questions only if their page image exists
//   applied { subject, kinds[], chapter, count, userId } -> applied questions WITHOUT solutions, unseen first
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action } = req.body || {};
  try {
    if (action === 'list') {
      const { subject } = req.body;
      if (!subject) return res.status(400).json({ error: 'subject required' });
      const { data: papers, error } = await admin.from('board_papers').select('*').eq('subject', subject).order('year', { ascending: false }).order('sem');
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
      const { subject, count = 15 } = req.body;
      const { data, error } = await admin.from('board_questions')
        .select(PUBLIC_Q_COLS + ',correct_option,solution,answer_items')
        .eq('subject', subject).eq('is_objective', true).or('needs_figure.eq.false,figure_url.not.is.null').limit(3000);   // figure questions only when the page image exists
      if (error) throw error;
      const pool = (data || []).sort(() => Math.random() - 0.5).slice(0, Math.min(count, 100));
      return res.json({ questions: pool, pool_size: (data || []).length });
    }

    if (action === 'applied') {
      const { subject, kinds = [], chapter = null, count = 10, userId = null } = req.body;
      let q = admin.from('board_questions').select(PUBLIC_Q_COLS + ',answer_items').eq('subject', subject).eq('applied', true).eq('is_objective', false).not('solution', 'is', null);
      if (kinds.length) q = q.in('applied_kind', kinds);
      if (chapter) q = q.eq('chapter', chapter);
      const { data: pool, error } = await q.limit(3000);
      if (error) throw error;
      let seen = new Set();
      if (userId) {
        const { data: atts } = await admin.from('board_attempts').select('id').eq('user_id', userId).eq('mode', 'applied');
        const ids = (atts || []).map(a => a.id);
        if (ids.length) {
          const { data: ans } = await admin.from('board_attempt_answers').select('question_id').in('attempt_id', ids);
          seen = new Set((ans || []).map(a => a.question_id));
        }
      }
      const shuffled = (pool || []).sort(() => Math.random() - 0.5);
      const picked = [...shuffled.filter(x => !seen.has(x.id)), ...shuffled.filter(x => seen.has(x.id))].slice(0, Math.min(count, 30)).map(stripItems);
      const chapters = [...new Set((pool || []).map(x => x.chapter).filter(Boolean))].sort();
      const poolKinds = [...new Set((pool || []).map(x => x.applied_kind).filter(Boolean))];
      return res.json({ questions: picked, pool_size: (pool || []).length, unseen: (pool || []).filter(x => !seen.has(x.id)).length, chapters, kinds: poolKinds });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error('boardPapers', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
