import { admin } from './_boardLib.js';

// Error log: every lost mark, from chapter quizzes, board-paper practice (sprint / applied / timed) and marked
// school tests, plus the student's own tag (mistake type, note, 3-day and 10-day redo).
// POST { action: 'errors', userId }                                   -> { rows, tagging }
// POST { action: 'errors_tag', userId, source, ref_id, loss_type, note, redo_1, redo_2 } -> { ok }
export const LOSS_TYPES = ['careless', 'concept', 'method', 'units', 'diagram', 'reason', 'wording', 'time', 'other'];
const MODE = { sprint: 'Sprint', applied: 'Applied', timed: 'Timed paper', competency: 'Competency' };

async function inChunks(ids, fn, size = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) { const { data } = await fn(ids.slice(i, i + size)); out.push(...(data || [])); }
  return out;
}
const missingTable = e => /error_log|classwork_results/.test(e?.message || '') && /(does not exist|schema cache|Could not find)/i.test(e?.message || '');

// A best guess for school-test mistakes, from the marker's note; the student can change it.
function guessType(note) {
  const s = (note || '').toLowerCase();
  if (!s) return null;
  if (/unit/.test(s)) return 'units';
  if (/sign|careless|copy|arithmetic|calculation slip/.test(s)) return 'careless';
  if (/diagram|ray|arrow|label|graph/.test(s)) return 'diagram';
  if (/reason|justif|explain/.test(s)) return 'reason';
  if (/formula|step|method|working/.test(s)) return 'method';
  if (/definition|term|wording|keyword/.test(s)) return 'wording';
  return 'concept';
}

async function list(userId) {
  const rows = [];

  // 1. Chapter quizzes: wrong answers
  const { data: sessions } = await admin.from('sessions').select('id, subject, chapter_name, started_at').eq('user_id', userId).limit(5000);
  const sess = Object.fromEntries((sessions || []).map(s => [s.id, s]));
  const qa = await inChunks(Object.keys(sess), ids => admin.from('session_answers').select('id, session_id, question_id, user_answer, is_correct, answered_at').in('session_id', ids).eq('is_correct', false).limit(20000));
  const qInfo = Object.fromEntries((await inChunks([...new Set(qa.map(a => a.question_id))], ids =>
    admin.from('questions').select('id, subject, chapter_name, skill, question, answer, explanation').in('id', ids))).map(q => [q.id, q]));
  for (const a of qa) {
    const s = sess[a.session_id] || {}, q = qInfo[a.question_id] || {};
    rows.push({ source: 'quiz', ref_id: String(a.id), at: a.answered_at || s.started_at, subject: q.subject || s.subject, chapter: q.chapter_name || s.chapter_name,
      where: `Chapter quiz${q.skill ? ` · ${q.skill}` : ''}`, question: q.question, your_answer: a.user_answer, correct: q.answer, why: q.explanation, lost: 1, marks: 1 });
  }

  // 2. Board-paper practice: answers that lost marks
  const { data: attempts } = await admin.from('board_attempts').select('id, subject, mode, paper_id, started_at, submitted_at').eq('user_id', userId).limit(5000);
  const att = Object.fromEntries((attempts || []).map(a => [a.id, a]));
  const ba = await inChunks(Object.keys(att), ids => admin.from('board_attempt_answers')
    .select('id, attempt_id, question_id, answer_text, marks_awarded, max_marks, points_missed, feedback, answered_at').in('attempt_id', ids).not('marks_awarded', 'is', null).limit(20000));
  const lostBa = ba.filter(a => Number(a.marks_awarded) < Number(a.max_marks));
  const bInfo = Object.fromEntries((await inChunks([...new Set(lostBa.map(a => a.question_id))], ids =>
    admin.from('board_questions').select('id, subject, chapter, q_label, question, solution, correct_option, options, source, school, paper_id').in('id', ids))).map(q => [q.id, q]));
  for (const a of lostBa) {
    const t = att[a.attempt_id] || {}, q = bInfo[a.question_id] || {};
    const paper = q.source === 'prelim' ? `${q.school || 'School'} prelim` : q.source === 'competency' ? 'CISCE competency' : q.source === 'classwork' ? (q.school || 'School test') : `ICSE ${String(q.paper_id || '').replace(/^[a-z_]+?_/, '').toUpperCase()}`;
    const correct = q.correct_option ? `(${q.correct_option}) ${q.options?.[q.correct_option] || ''}`.trim() : q.solution;
    const missed = Array.isArray(a.points_missed) ? a.points_missed.map(p => (typeof p === 'string' ? p : p?.point)).filter(Boolean).join('; ') : null;
    rows.push({ source: 'board', ref_id: String(a.id), at: a.answered_at || t.submitted_at || t.started_at, subject: q.subject || t.subject, chapter: q.chapter,
      where: `${MODE[t.mode] || 'Board practice'} · ${paper} Q${q.q_label || ''}`, question: q.question, your_answer: a.answer_text, correct,
      why: [missed && `Missed: ${missed}`, a.feedback].filter(Boolean).join(' · ') || null, lost: Number(a.max_marks) - Number(a.marks_awarded), marks: Number(a.max_marks) });
  }

  // 3. Marked school tests
  const { data: cw, error: cwErr } = await admin.from('classwork_results').select('id, upload_id, question_id, subject, chapter, marks, got, mistake, test_date, created_at').eq('user_id', userId).not('got', 'is', null).limit(5000);
  if (cwErr && !missingTable(cwErr)) throw cwErr;
  const lostCw = (cw || []).filter(r => Number(r.got) < Number(r.marks));
  const cInfo = Object.fromEntries((await inChunks([...new Set(lostCw.map(r => r.question_id).filter(Boolean))], ids =>
    admin.from('board_questions').select('id, q_label, question, solution, school').in('id', ids))).map(q => [q.id, q]));
  for (const r of lostCw) {
    const q = cInfo[r.question_id] || {};
    rows.push({ source: 'classwork', ref_id: String(r.id), at: r.test_date || r.created_at, subject: r.subject, chapter: r.chapter,
      where: `School test · ${q.school || 'class test'}${q.q_label ? ` Q${q.q_label}` : ''}`, question: q.question, your_answer: null, correct: q.solution,
      why: r.mistake, lost: Number(r.marks) - Number(r.got), marks: Number(r.marks), suggested: guessType(r.mistake) });
  }

  // The student's tags
  let tagging = true, tags = {};
  const { data: t, error: tErr } = await admin.from('error_log').select('source, ref_id, loss_type, note, redo_1, redo_2').eq('user_id', userId).limit(20000);
  if (tErr) { if (missingTable(tErr)) tagging = false; else throw tErr; }
  for (const x of t || []) tags[`${x.source}:${x.ref_id}`] = x;
  for (const r of rows) {
    const x = tags[`${r.source}:${r.ref_id}`] || {};
    r.loss_type = x.loss_type || r.suggested || null; r.note = x.note || null; r.redo_1 = !!x.redo_1; r.redo_2 = !!x.redo_2;
    r.lost = Math.round(r.lost * 2) / 2;
  }
  rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return { rows, tagging, loss_types: LOSS_TYPES };
}

export default async function errorLog(req, res) {
  const { action, userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    if (action === 'errors') return res.json(await list(userId));
    if (action === 'errors_tag') {
      const b = req.body;
      if (!['quiz', 'board', 'classwork'].includes(b.source) || !b.ref_id) return res.status(400).json({ error: 'source and ref_id required' });
      if (b.loss_type && !LOSS_TYPES.includes(b.loss_type)) return res.status(400).json({ error: 'unknown mistake type' });
      const row = { user_id: userId, source: b.source, ref_id: String(b.ref_id), loss_type: b.loss_type || null, note: (b.note || '').slice(0, 500) || null,
        redo_1: !!b.redo_1, redo_2: !!b.redo_2, updated_at: new Date().toISOString() };
      const { error } = await admin.from('error_log').upsert(row, { onConflict: 'user_id,source,ref_id' });
      if (error) { if (missingTable(error)) return res.status(503).json({ error: 'setup' }); throw error; }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error('errorLog', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
