import { admin } from './_boardLib.js';

// Error log: every lost mark, from chapter quizzes, board-paper practice (sprint / applied / timed) and marked school tests.
// Nothing is tagged by hand: the mistake type is read from what was recorded (missed marking points, marker's note,
// blank answers), and an error closes itself when aligned questions are answered correctly on two different days.
// POST { action: 'errors', userId }          -> { rows }   each row: type, status (open | improving | fixed)
// POST { action: 'fixit', userId, subject }  -> { quick: [ids], written: [ids], items: [...] }   practice aligned to open errors
const MODE = { sprint: 'Sprint', applied: 'Applied', timed: 'Timed paper', competency: 'Competency' };
const DAY = 86400000;
const FIX_DAYS = 2;            // aligned questions right on this many different days closes an error
const SET_SIZE = 12;

async function inChunks(ids, fn, size = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) { const { data } = await fn(ids.slice(i, i + size)); out.push(...(data || [])); }
  return out;
}
const missingTable = e => /classwork_results/.test(e?.message || '') && /(does not exist|schema cache|Could not find)/i.test(e?.message || '');

// The kind of mistake, read from the marking notes.
function typeFrom(text, fallback = 'concept') {
  const s = (text || '').toLowerCase();
  if (!s) return fallback;
  if (/unit|sign convention|\bsign\b/.test(s)) return 'units';
  if (/diagram|ray|arrow|label|graph|draw/.test(s)) return 'diagram';
  if (/reason|justif|explain|because/.test(s)) return 'reason';
  if (/formula|substitut|step|method|working/.test(s)) return 'method';
  if (/definition|term|wording|keyword|name the/.test(s)) return 'wording';
  if (/careless|copy|arithmetic|calculation/.test(s)) return 'careless';
  return fallback;
}

// Topic words used to decide whether two questions practise the same thing.
const STOP = new Set(('the a an of and or in on to for by with from its is are be as at which what this that between using when will has have was were its their his her into than then also following given above below correct statement statements option options true false choose find calculate state name write two one three').split(' '));
const words = (...xs) => new Set(xs.flat().filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };
const dayOf = t => String(t || '').slice(0, 10);

// MCQs: show the whole question with its options, and answers as "(c) option text", so the log can be revised from.
const optEntries = o => (o && typeof o === 'object' ? (Array.isArray(o) ? o.map((v, i) => ['abcd'[i], v]) : Object.entries(o)) : []);
const withOptions = (stem, o) => {
  const e = optEntries(o);
  if (!e.length || /\(a\)[\s\S]*\(b\)/i.test(stem || '')) return stem;   // some older questions already list the options in the stem
  return `${stem || ''}\n${e.map(([k, v]) => `(${k}) ${v}`).join('\n')}`;
};
const optionText = (letter, o) => {
  const k = String(letter || '').trim().replace(/[()\s.]/g, '').toLowerCase();
  const v = optEntries(o).find(([key]) => key === k)?.[1];
  return v ? `(${k}) ${v}` : letter;
};

async function gather(userId) {
  // Chapter quizzes
  const { data: sessions } = await admin.from('sessions').select('id, subject, chapter_name, started_at').eq('user_id', userId).limit(5000);
  const sess = Object.fromEntries((sessions || []).map(s => [s.id, s]));
  const qa = await inChunks(Object.keys(sess), ids => admin.from('session_answers').select('id, session_id, question_id, user_answer, is_correct, answered_at').in('session_id', ids).limit(20000));
  const qInfo = Object.fromEntries((await inChunks([...new Set(qa.map(a => a.question_id))], ids =>
    admin.from('questions').select('id, subject, chapter_name, skill, question, options, answer, explanation').in('id', ids))).map(q => [q.id, { ...q, subject: String(q.subject || '').replace(/^retired_/, '') }]));   // retired questions keep their history

  // Board-paper practice
  const { data: attempts } = await admin.from('board_attempts').select('id, subject, mode, paper_id, started_at, submitted_at').eq('user_id', userId).limit(5000);
  const att = Object.fromEntries((attempts || []).map(a => [a.id, a]));
  const ba = await inChunks(Object.keys(att), ids => admin.from('board_attempt_answers')
    .select('id, attempt_id, question_id, answer_text, marks_awarded, max_marks, points_missed, feedback, answered_at').in('attempt_id', ids).not('marks_awarded', 'is', null).limit(20000));
  const bInfo = Object.fromEntries((await inChunks([...new Set(ba.map(a => a.question_id))], ids =>
    admin.from('board_questions').select('id, subject, chapter, topic, concepts, q_label, question, solution, correct_option, options, source, school, paper_id, is_objective').in('id', ids))).map(q => [q.id, q]));

  // Marked school tests
  const { data: cw, error: cwErr } = await admin.from('classwork_results').select('id, upload_id, question_id, subject, chapter, topic, marks, got, mistake, test_date, created_at').eq('user_id', userId).not('got', 'is', null).limit(5000);
  if (cwErr && !missingTable(cwErr)) throw cwErr;
  const cInfo = Object.fromEntries((await inChunks([...new Set((cw || []).map(r => r.question_id).filter(Boolean))], ids =>
    admin.from('board_questions').select('id, q_label, question, solution, school, topic, concepts, is_objective').in('id', ids))).map(q => [q.id, q]));

  const errors = [], wins = [];
  for (const a of qa) {
    const s = sess[a.session_id] || {}, q = qInfo[a.question_id] || {};
    const base = { at: a.answered_at || s.started_at, subject: q.subject || s.subject, chapter: q.chapter_name || s.chapter_name, words: words(q.question) };   // quiz 'skill' is often just the chapter name, so match on the question's own terms
    if (a.is_correct) { wins.push({ ...base, qid: `quiz:${a.question_id}` }); continue; }
    errors.push({ ...base, source: 'quiz', ref_id: String(a.id), qid: `quiz:${a.question_id}`, objective: true, type: 'concept',
      where: `Chapter quiz${q.skill ? ` · ${q.skill}` : ''}`, question: withOptions(q.question, q.options), your_answer: optionText(a.user_answer, q.options) || '(no answer)',
      correct: optionText(q.answer, q.options), why: q.explanation, lost: 1, marks: 1 });
  }
  for (const a of ba) {
    const t = att[a.attempt_id] || {}, q = bInfo[a.question_id] || {};
    const base = { at: a.answered_at || t.submitted_at || t.started_at, subject: q.subject || t.subject, chapter: q.chapter, words: words(q.topic, q.concepts) };
    if (Number(a.marks_awarded) >= Number(a.max_marks)) { wins.push({ ...base, qid: a.question_id }); continue; }
    const paper = q.source === 'prelim' ? `${q.school || 'School'} prelim` : q.source === 'competency' ? 'CISCE competency' : q.source === 'classwork' ? (q.school || 'School test') : `ICSE ${String(q.paper_id || '').replace(/^[a-z_]+?_/, '').toUpperCase()}`;
    const missed = Array.isArray(a.points_missed) ? a.points_missed.map(p => (typeof p === 'string' ? p : p?.point)).filter(Boolean).join('; ') : '';
    const blank = !String(a.answer_text || '').trim();
    errors.push({ ...base, source: 'board', ref_id: String(a.id), qid: a.question_id, objective: !!q.is_objective,
      type: blank ? 'time' : q.is_objective ? 'concept' : typeFrom(`${missed} ${a.feedback || ''}`, 'method'),
      where: `${MODE[t.mode] || 'Board practice'} · ${paper} Q${q.q_label || ''}`, question: q.is_objective ? withOptions(q.question, q.options) : q.question,
      your_answer: q.is_objective ? optionText(a.answer_text, q.options) : a.answer_text,
      correct: q.correct_option ? `(${q.correct_option}) ${q.options?.[q.correct_option] || ''}`.trim() : q.solution,
      why: [missed && `Missed: ${missed}`, a.feedback].filter(Boolean).join(' · ') || null, lost: Number(a.max_marks) - Number(a.marks_awarded), marks: Number(a.max_marks) });
  }
  for (const r of cw || []) {
    const q = cInfo[r.question_id] || {};
    const base = { at: r.test_date || r.created_at, subject: r.subject, chapter: r.chapter, words: words(r.topic || q.topic, q.concepts) };
    if (Number(r.got) >= Number(r.marks)) { wins.push({ ...base, qid: r.question_id }); continue; }
    errors.push({ ...base, source: 'classwork', ref_id: String(r.id), qid: r.question_id, objective: !!q.is_objective, type: typeFrom(r.mistake),
      where: `School test · ${q.school || 'class test'}${q.q_label ? ` Q${q.q_label}` : ''}`, question: q.question, your_answer: null, correct: q.solution,
      why: r.mistake, lost: Number(r.marks) - Number(r.got), marks: Number(r.marks) });
  }

  // Close the loop: correct answers to aligned questions after the error, counted by distinct days.
  for (const e of errors) {
    const days = new Set();
    for (const w of wins) {
      if (w.subject !== e.subject || !w.at || !e.at || w.at <= e.at) continue;
      const same = w.qid === e.qid;
      if (same || (w.chapter && w.chapter === e.chapter && overlap(e.words, w.words) >= 3)) days.add(dayOf(w.at));   // same idea: at least three shared terms
    }
    e.fixed_days = days.size;
    e.status = days.size >= FIX_DAYS ? 'fixed' : days.size ? 'improving' : 'open';
    e.lost = Math.round(e.lost * 2) / 2;
  }
  errors.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  return { errors, wins, seen: new Set(ba.map(a => a.question_id)) };
}

const publicRow = ({ words: _w, qid: _q, ...r }) => r;

// Practice aligned to the open errors of one subject: exact redos of board questions (3+ days later) and similar questions.
async function fixit(userId, subject) {
  const { errors, seen } = await gather(userId);
  const open = errors.filter(e => e.subject === subject && e.status !== 'fixed');
  if (!open.length) return { items: [], quick: [], written: [], open: 0 };
  const now = Date.now();
  // Recent and costly errors first; an error's pull halves every 14 days.
  for (const e of open) e.weight = e.lost * Math.pow(0.5, (now - new Date(e.at).getTime()) / (14 * DAY)) + 0.01 * e.lost;
  open.sort((a, b) => b.weight - a.weight);

  const { data: pool } = await admin.from('board_questions')
    .select('id, chapter, topic, concepts, is_objective, difficulty, source, paper_id, q_label, needs_figure, figure_url')
    .eq('subject', subject).in('source', ['board', 'prelim', 'competency', 'classwork']).limit(5000);
  const cands = (pool || []).filter(q => !q.needs_figure || q.figure_url).map(q => ({ ...q, w: words(q.topic, q.concepts) }));
  const picked = new Map();

  for (const e of open) {
    if (picked.size >= SET_SIZE) break;
    const reason = { where: e.where, question: (e.question || '').slice(0, 140), type: e.type };
    // Exact redo of a board/school question, once it is at least 3 days old
    if (e.source !== 'quiz' && e.qid && !picked.has(e.qid) && now - new Date(e.at).getTime() >= 3 * DAY && cands.some(c => c.id === e.qid)) {
      const c = cands.find(x => x.id === e.qid); picked.set(c.id, { id: c.id, objective: c.is_objective, kind: 'redo', chapter: c.chapter, reason });
    }
    const scored = cands.filter(c => c.chapter === e.chapter && c.id !== e.qid && !picked.has(c.id)).map(c => ({
      c, s: overlap(e.w ?? e.words, c.w) * 3 + (c.is_objective === e.objective ? 1 : 0) + (seen.has(c.id) ? 0 : 2) + (c.source === 'board' ? 1 : 0) + Math.random() * 0.5,
    })).sort((a, b) => b.s - a.s);
    for (const { c } of scored.slice(0, 2)) {
      if (picked.size >= SET_SIZE) break;
      picked.set(c.id, { id: c.id, objective: c.is_objective, kind: 'similar', chapter: c.chapter, reason });
    }
  }
  const items = [...picked.values()];
  return { items, quick: items.filter(i => i.objective).map(i => i.id), written: items.filter(i => !i.objective).map(i => i.id), open: open.length };
}

export default async function errorLog(req, res) {
  const { action, userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    if (action === 'errors') { const { errors } = await gather(userId); return res.json({ rows: errors.map(publicRow) }); }
    if (action === 'fixit') { if (!req.body.subject) return res.status(400).json({ error: 'subject required' }); return res.json(await fixit(userId, req.body.subject)); }
    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    console.error('errorLog', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
