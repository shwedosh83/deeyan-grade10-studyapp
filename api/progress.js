// POST { userId } → the student's learning progress, computed only from their real activity:
// chapter-quiz sessions/answers and board-practice attempts/answers. Nothing here is estimated or invented;
// the rules (XP, levels, streaks, badges, time) are listed in RULES and shown to the student in the app.
import { createClient } from '@supabase/supabase-js';
import errorLog from './_errorLog.js';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const RULES = {
  xp: 'You earn 10 XP for every mark you score (a correct quiz answer is 1 mark) and 2 XP for every question you attempt.',
  streak: 'Your streak counts consecutive days (India time) on which you answered at least one question.',
  goal: 'Daily goal: answer 20 questions in a day.',
  time: 'Time is measured from your answers: a quiz session runs from its first to its last answer (plus 30 seconds for the last one); a board attempt uses its recorded time. Gaps over 10 minutes inside a session are not counted.',
};
export const DAILY_GOAL = 20;
export const LEVELS = [
  { name: 'Beginner', min: 0 }, { name: 'Explorer', min: 300 }, { name: 'Challenger', min: 1000 },
  { name: 'Expert', min: 2500 }, { name: 'Master', min: 5000 },
];

const IST = 330 * 60 * 1000;                       // India time, +05:30
const day = (t) => new Date(new Date(t).getTime() + IST).toISOString().slice(0, 10);
const todayIST = () => day(Date.now());
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const pct = (c, n) => (n ? Math.round((c / n) * 100) : null);

async function inChunks(ids, fetcher, size = 300) {
  const slices = [];
  for (let i = 0; i < ids.length; i += size) slices.push(ids.slice(i, i + size));
  const results = await Promise.all(slices.map(fetcher));   // chunks in parallel
  const out = [];
  for (const { data, error } of results) { if (error) throw error; out.push(...(data || [])); }
  return out;
}

function levelFor(xp) {
  let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i], next = LEVELS[i + 1] || null;
  return { name: cur.name, index: i, min: cur.min, next: next ? next.name : null, next_min: next ? next.min : null,
    progress: next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100 };
}

// Active seconds from a list of answer timestamps: first→last, ignoring gaps > 10 min, +30 s for the last answer.
function activeSeconds(times) {
  const t = times.map(x => new Date(x).getTime()).filter(Boolean).sort((a, b) => a - b);
  if (!t.length) return 0;
  let s = 30;
  for (let i = 1; i < t.length; i++) { const gap = (t[i] - t[i - 1]) / 1000; if (gap > 0 && gap <= 600) s += gap; else s += 30; }
  return Math.round(s);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // The error log is served by this function to stay within the plan's function limit.
  if (req.body?.action === 'errors' || req.body?.action === 'fixit') return errorLog(req, res);
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // ── raw activity: quiz history and board-practice history are fetched in parallel ──
    const quizSide = (async () => {
      const { data: sessions, error } = await admin.from('sessions')
        .select('id, subject, started_at, ended_at, chapter_name').eq('user_id', userId).limit(5000);
      if (error) throw error;
      const sessById = Object.fromEntries((sessions || []).map(s => [s.id, s]));
      const quizAnswers = await inChunks(Object.keys(sessById), ids =>
        admin.from('session_answers').select('session_id, question_id, is_correct, answered_at').in('session_id', ids).limit(20000));
      const qIds = [...new Set(quizAnswers.map(a => a.question_id))];
      const qInfo = Object.fromEntries((await inChunks(qIds, ids =>
        admin.from('questions').select('id, subject, chapter_name, skill').in('id', ids))).map(q => [q.id, { ...q, subject: String(q.subject || '').replace(/^retired_/, '') }]));   // retired questions keep their history
      return { sessById, quizAnswers, qInfo };
    })();
    const boardSide = (async () => {
      const { data: attempts, error } = await admin.from('board_attempts')
        .select('id, subject, mode, paper_id, started_at, submitted_at, seconds_used, score, max_score, status').eq('user_id', userId).limit(5000);
      if (error) throw error;
      const attById = Object.fromEntries((attempts || []).map(a => [a.id, a]));
      const boardAnswers = await inChunks(Object.keys(attById), ids =>
        admin.from('board_attempt_answers').select('attempt_id, question_id, marks_awarded, max_marks, answered_at').in('attempt_id', ids).limit(20000));
      const bIds = [...new Set(boardAnswers.map(a => a.question_id))];
      const bInfo = Object.fromEntries((await inChunks(bIds, ids =>
        admin.from('board_questions').select('id, subject, chapter, difficulty, source').in('id', ids))).map(q => [q.id, q]));
      return { attempts, attById, boardAnswers, bInfo };
    })();
    const schoolSide = admin.from('classwork_results').select('subject, chapter, marks, got, test_date').eq('user_id', userId).not('got', 'is', null).limit(5000);
    const [{ sessById, quizAnswers, qInfo }, { attempts, attById, boardAnswers, bInfo }, { data: cwRows }] = await Promise.all([quizSide, boardSide, schoolSide]);

    // ── one unified event list: every answered question ──────────────────────
    const events = [];
    for (const a of quizAnswers) {
      const s = sessById[a.session_id], q = qInfo[a.question_id] || {};
      events.push({ kind: 'quiz', subject: q.subject || s?.subject, chapter: q.chapter_name || s?.chapter_name, skill: q.skill || null,
        at: a.answered_at || s?.started_at, marks: a.is_correct ? 1 : 0, max: 1, correct: !!a.is_correct, difficulty: null });
    }
    for (const a of boardAnswers) {
      const t = attById[a.attempt_id], q = bInfo[a.question_id] || {};
      if (a.marks_awarded === null || a.marks_awarded === undefined) continue;          // not yet marked
      const max = Number(a.max_marks) || 1, got = Number(a.marks_awarded) || 0;
      events.push({ kind: 'board', mode: t?.mode, subject: q.subject || t?.subject, chapter: q.chapter || null, skill: null,
        at: a.answered_at || t?.submitted_at || t?.started_at, marks: got, max, correct: got >= max - 1e-9, difficulty: q.difficulty || null });
    }

    // ── totals, XP, level ────────────────────────────────────────────────────
    const answered = events.length, correct = events.filter(e => e.correct).length;
    const marks = events.reduce((s, e) => s + e.marks, 0);
    const xp = Math.round(marks * 10 + answered * 2);

    // ── time spent ──────────────────────────────────────────────────────────
    const bySession = {};
    for (const a of quizAnswers) (bySession[a.session_id] ||= []).push(a.answered_at);
    let seconds = Object.values(bySession).reduce((s, ts) => s + activeSeconds(ts), 0);
    const secondsByDay = {};
    for (const ts of Object.values(bySession)) { const d = day(ts.filter(Boolean).sort()[0]); secondsByDay[d] = (secondsByDay[d] || 0) + activeSeconds(ts); }
    for (const t of attempts || []) {
      let s = Number(t.seconds_used) || 0;
      if (!s && t.started_at && t.submitted_at) s = (new Date(t.submitted_at) - new Date(t.started_at)) / 1000;
      s = Math.max(0, Math.min(s, 3.5 * 3600));
      seconds += s;
      if (s) { const d = day(t.submitted_at || t.started_at); secondsByDay[d] = (secondsByDay[d] || 0) + s; }
    }
    seconds = Math.round(seconds);

    // ── days, streaks, today ─────────────────────────────────────────────────
    const perDay = {};
    for (const e of events) { if (!e.at) continue; const d = day(e.at); const p = (perDay[d] ||= { answered: 0, correct: 0 }); p.answered++; if (e.correct) p.correct++; }
    const days = Object.keys(perDay).sort();
    const today = todayIST();
    let current = 0;
    for (let d = perDay[today] ? today : addDays(today, -1); perDay[d]; d = addDays(d, -1)) current++;
    let best = 0, run = 0, prev = null;
    for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const todayAnswered = perDay[today]?.answered || 0;

    // ── last 7 days ─────────────────────────────────────────────────────────
    const week = [];
    for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); week.push({ date: d, answered: perDay[d]?.answered || 0, correct: perDay[d]?.correct || 0, minutes: Math.round((secondsByDay[d] || 0) / 60) }); }
    const span = (from, to) => events.filter(e => e.at && day(e.at) >= from && day(e.at) <= to);
    const thisWk = span(addDays(today, -6), today), lastWk = span(addDays(today, -13), addDays(today, -7));
    const accThis = pct(thisWk.filter(e => e.correct).length, thisWk.length), accLast = pct(lastWk.filter(e => e.correct).length, lastWk.length);

    // ── subjects, chapters, skills ─────────────────────────────────────────
    const subj = {};
    for (const e of events) {
      if (!e.subject) continue;
      const S = (subj[e.subject] ||= { subject: e.subject, answered: 0, correct: 0, last_active: null, chapters: {}, skills: {} });
      S.answered++; if (e.correct) S.correct++;
      if (e.at && (!S.last_active || e.at > S.last_active)) S.last_active = e.at;
      if (e.chapter) { const C = (S.chapters[e.chapter] ||= { chapter: e.chapter, answered: 0, correct: 0 }); C.answered++; if (e.correct) C.correct++; }
      if (e.skill) { const K = (S.skills[e.skill] ||= { skill: e.skill, answered: 0, correct: 0 }); K.answered++; if (e.correct) K.correct++; }
    }
    const subjects = Object.values(subj).map(S => ({
      subject: S.subject, answered: S.answered, correct: S.correct, accuracy: pct(S.correct, S.answered), last_active: S.last_active,
      chapters: Object.values(S.chapters).map(C => ({ ...C, accuracy: pct(C.correct, C.answered) })).sort((a, b) => b.answered - a.answered),
      skills: Object.values(S.skills).map(K => ({ ...K, accuracy: pct(K.correct, K.answered) })).sort((a, b) => b.answered - a.answered),
    })).sort((a, b) => (b.last_active || '').localeCompare(a.last_active || ''));

    // ── school class tests (marks the teacher gave; kept apart from XP, streaks and time) ──
    // The table appears only after backend/migrations/add_classwork.sql; until then this is simply empty.
    const schoolMap = {};
    for (const r of cwRows || []) {
      const S = (schoolMap[r.subject] ||= {}), k = r.chapter || 'Other';
      const C = (S[k] ||= { chapter: k, got: 0, marks: 0, questions: 0, last_test: null });
      C.got += Number(r.got) || 0; C.marks += Number(r.marks) || 0; C.questions++;
      if (r.test_date && (!C.last_test || r.test_date > C.last_test)) C.last_test = r.test_date;
    }
    const school = Object.entries(schoolMap).map(([subject, cs]) => ({ subject,
      chapters: Object.values(cs).map(C => ({ ...C, got: Math.round(C.got * 10) / 10, accuracy: pct(C.got, C.marks) })).sort((a, b) => a.accuracy - b.accuracy) }));

    // ── revision list & next challenge (weakest real chapters, enough attempts to be meaningful) ──
    // App practice needs 5+ answers; a school test needs 4+ marks on the chapter. Both under 70%.
    const chapters = subjects.flatMap(S => S.chapters.map(C => ({ subject: S.subject, ...C })));
    const schoolWeak = school.flatMap(S => S.chapters.filter(C => C.chapter !== 'Other' && C.marks >= 4 && C.accuracy < 70)
      .map(C => ({ subject: S.subject, chapter: C.chapter, from: 'school', got: C.got, marks: C.marks, answered: C.questions, accuracy: C.accuracy })));
    const revision = [...chapters.filter(c => c.answered >= 5 && c.accuracy < 70), ...schoolWeak]
      .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered).slice(0, 8);
    let next_challenge = null;
    if (revision.length) { const r = revision[0]; next_challenge = { type: 'revise', subject: r.subject, chapter: r.chapter, accuracy: r.accuracy, answered: r.answered, from: r.from || 'app', got: r.got, marks: r.marks }; }
    else if (subjects.length) { const stale = [...subjects].sort((a, b) => (a.last_active || '').localeCompare(b.last_active || ''))[0]; next_challenge = { type: 'revisit', subject: stale.subject, last_active: stale.last_active }; }

    // ── accuracy by difficulty (board questions carry a 1–5 difficulty) ──────
    const byDiff = {};
    for (const e of events) if (e.difficulty) { const D = (byDiff[e.difficulty] ||= { difficulty: e.difficulty, answered: 0, correct: 0 }); D.answered++; if (e.correct) D.correct++; }
    const difficulty = Object.values(byDiff).map(D => ({ ...D, accuracy: pct(D.correct, D.answered) })).sort((a, b) => a.difficulty - b.difficulty);

    // ── badges: real milestones only ─────────────────────────────────────────
    const strongChapters = chapters.filter(c => c.answered >= 15 && c.accuracy >= 80);
    const sprintBest = (attempts || []).filter(a => a.mode === 'sprint' && Number(a.max_score) >= 10).map(a => Number(a.score) / Number(a.max_score));
    const timedDone = (attempts || []).filter(a => a.mode === 'timed' && a.status !== 'in_progress').length;
    const badge = (id, name, desc, have, need) => ({ id, name, desc, earned: have >= need, progress: Math.min(have, need), goal: need });
    const badges = [
      badge('first_steps', 'First steps', 'Answer your first 10 questions', answered, 10),
      badge('streak_3', 'On a roll', 'Practise 3 days in a row', best, 3),
      badge('streak_7', 'Week warrior', 'Practise 7 days in a row', best, 7),
      badge('century', 'Century', 'Get 100 questions right', correct, 100),
      badge('five_hundred', 'Half a thousand', 'Get 500 questions right', correct, 500),
      badge('chapter_champ', 'Chapter champion', 'Score 80%+ on a chapter (15+ questions)', strongChapters.length, 1),
      badge('sharp_shooter', 'Sharp shooter', 'Score 90%+ in a sprint of 10+ questions', sprintBest.some(r => r >= 0.9) ? 1 : 0, 1),
      badge('board_ready', 'Board ready', 'Complete a timed board paper', timedDone, 1),
      badge('marathon', 'Marathon', 'Spend 10 hours answering questions', Math.floor(seconds / 3600), 10),
    ];

    return res.json({
      rules: RULES, daily_goal: DAILY_GOAL, levels: LEVELS,
      totals: { answered, correct, accuracy: pct(correct, answered), marks: Math.round(marks * 10) / 10, xp, seconds, active_days: days.length },
      level: levelFor(xp),
      streak: { current, best, active_today: !!perDay[today] },
      today: { date: today, answered: todayAnswered, goal: DAILY_GOAL, done: todayAnswered >= DAILY_GOAL },
      week, improvement: { this_week: accThis, last_week: accLast, answered_this_week: thisWk.length, answered_last_week: lastWk.length },
      subjects, school, revision, next_challenge, difficulty, badges,
    });
  } catch (e) {
    console.error('progress', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
