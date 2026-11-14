import { admin, gradeObjective, gradeItems, gradeSubjective, countedQuestionIds, mapPool } from './_boardLib.js';

// POST (default)  { userId, subject, mode, paperId?, inputMethod, secondsUsed, answers:[{questionId,text,scanReadText?}] }
//   -> grades, saves the attempt, returns per-question marks + solutions + section totals
// POST            { action:'selfmark', attemptId, marks:[{questionId, marks}] }
//   -> records the student's own marks for questions the app could not mark (no rubric / AI unavailable)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (req.body?.action === 'selfmark') return await selfMark(req, res);

    const { userId = null, subject, mode, paperId = null, inputMethod = 'typed', secondsUsed = null, answers = [] } = req.body || {};
    if (!subject || !mode) return res.status(400).json({ error: 'subject and mode required' });

    const ansBy = new Map(answers.map(a => [a.questionId, a]));
    let paper = null; let questions = [];
    if (mode === 'timed') {
      if (!paperId) return res.status(400).json({ error: 'paperId required for timed mode' });
      ({ data: paper } = await admin.from('board_papers').select('*').eq('id', paperId).single());
      ({ data: questions } = await admin.from('board_questions').select('*').eq('paper_id', paperId).order('q_order'));
    } else {
      ({ data: questions } = await admin.from('board_questions').select('*').in('id', answers.map(a => a.questionId)));
    }
    if (!questions?.length) return res.status(404).json({ error: 'questions not found' });

    const answeredIds = [...ansBy.entries()].filter(([, a]) => a.text && a.text.trim()).map(([id]) => id);
    const counted = mode === 'timed' ? countedQuestionIds(paper, questions, answeredIds) : new Set(answeredIds);

    const toGrade = questions.filter(q => ansBy.has(q.id));
    const graded = await mapPool(toGrade, 6, async q => {
      const a = ansBy.get(q.id);
      const text = a.text || '';
      if (mode === 'timed' && text.trim() && !counted.has(q.id)) {
        return { q, g: { marks_awarded: 0, max_marks: Number(q.marks), graded_by: 'auto', feedback: 'Not counted: you answered more questions than the paper allows in this section, so only the first ones count.', not_counted: true } };
      }
      const g = q.answer_items?.length ? gradeItems(q, text) : q.is_objective ? gradeObjective(q, text) : await gradeSubjective(q, text);
      return { q, g };
    });

    // Persist
    const score = graded.reduce((s, { q, g }) => s + (g.marks_awarded && !g.not_counted ? Number(g.marks_awarded) : 0), 0);
    const maxScore = mode === 'timed'
      ? Number(paper.max_marks)
      : graded.reduce((s, { q }) => s + Number(q.marks), 0);
    const pending = graded.filter(({ g }) => g.marks_awarded === null).map(({ q }) => q.id);

    const { data: attempt, error: ae } = await admin.from('board_attempts').insert({
      user_id: userId, paper_id: paperId, subject, mode, input_method: inputMethod, submitted_at: new Date().toISOString(),
      seconds_used: secondsUsed, score, max_score: maxScore, status: pending.length ? 'submitted' : 'graded',
    }).select().single();
    if (ae) throw ae;

    const rows = graded.map(({ q, g }) => ({
      attempt_id: attempt.id, question_id: q.id, answer_text: ansBy.get(q.id).text || '', scan_read_text: ansBy.get(q.id).scanReadText || null,
      marks_awarded: g.marks_awarded, max_marks: g.max_marks, points_hit: g.points_hit || null,
      points_missed: g.points_missed || null, feedback: g.feedback || null, graded_by: g.graded_by,
    }));
    if (rows.length) {
      const { error: re } = await admin.from('board_attempt_answers').insert(rows);
      if (re) console.error('answers insert', re.message);
    }

    // Section totals (timed)
    const sections = {};
    for (const { q, g } of graded) {
      const s = (sections[q.section || 'All'] ||= { got: 0, counted_max: 0 });
      if (g.marks_awarded && !g.not_counted) s.got += Number(g.marks_awarded);
    }
    for (const q of questions) {
      const s = (sections[q.section || 'All'] ||= { got: 0, counted_max: 0 });
      if (q.mandatory === 'compulsory') s.counted_max += Number(q.marks);
    }
    for (const sec of paper?.sections || []) {
      const key = Object.keys(sections).find(k => k && (k.startsWith(sec.name) || sec.name.startsWith(k)));
      if (key) sections[key].counted_max = Number(sec.total_marks);
    }

    const results = graded.map(({ q, g }) => ({
      questionId: q.id, q_label: q.q_label, section: q.section, chapter: q.chapter, marks: Number(q.marks), answer_text: ansBy.get(q.id)?.text || '', ...g,
      solution: q.solution, marking_points: q.marking_points, correct_option: q.correct_option, options: q.options, item_results: g.item_results || null,
    }));
    return res.json({ attemptId: attempt.id, score, maxScore, pendingSelfMark: pending, sections, results });
  } catch (e) {
    console.error('boardGrade', e.message || e);
    return res.status(500).json({ error: e.message || 'grading failed' });
  }
}

async function selfMark(req, res) {
  const { attemptId, marks = [] } = req.body;
  for (const m of marks) {
    await admin.from('board_attempt_answers').update({ marks_awarded: m.marks, graded_by: 'self' }).eq('attempt_id', attemptId).eq('question_id', m.questionId);
  }
  const { data: rows } = await admin.from('board_attempt_answers').select('marks_awarded').eq('attempt_id', attemptId);
  const score = (rows || []).reduce((s, r) => s + (Number(r.marks_awarded) || 0), 0);
  const stillPending = (rows || []).some(r => r.marks_awarded === null);
  await admin.from('board_attempts').update({ score, status: stillPending ? 'submitted' : 'graded' }).eq('id', attemptId);
  return res.json({ attemptId, score, pending: stillPending });
}
