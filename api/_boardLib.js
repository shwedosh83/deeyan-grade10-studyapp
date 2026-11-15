// Shared helpers for the board-paper endpoints (the leading underscore keeps Vercel from exposing this as a route).
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const GRADE_MODEL = process.env.BOARD_GRADE_MODEL || 'claude-haiku-4-5-20251001';
export const SCAN_MODEL = process.env.BOARD_SCAN_MODEL || 'claude-sonnet-5-5';

// Columns safe to send to the student before an attempt is submitted (no solution, no correct option, no rubric).
export const PUBLIC_Q_COLS =
  'id,paper_id,subject,q_label,q_order,q_main,section,type,marks,mandatory,choice_note,chapter,topic,applied,applied_kind,difficulty,question,options,is_objective,needs_figure,figure_desc,figure_url,source,school';

// answer_items without the accepted answers (safe to show before submission)
export function stripItems(q) {
  const { answer_items, ...rest } = q;
  return { ...rest, items: (answer_items || []).map(it => ({ prompt: it.prompt })) };
}

// ── Objective answers ────────────────────────────────────────────────────────
export function parseOption(text) {
  if (!text) return null;
  const m = String(text).trim().match(/^\(?\s*([a-dA-D])\s*\)?(?:[\s.:)-]|$)/);
  return m ? m[1].toLowerCase() : null;
}

export function gradeObjective(q, answerText) {
  const picked = parseOption(answerText);
  const keys = (q.correct_option || '').toLowerCase().split(/[,|]/).map(x => x.trim()).filter(Boolean);   // 'a,d' when the paper prints two identical correct options
  const ok = picked !== null && keys.includes(picked);
  return { marks_awarded: ok ? Number(q.marks) : 0, max_marks: Number(q.marks), graded_by: 'auto', picked, correct: ok };
}

// ── Item-style objectives (fill in the blank, name the term, match the column) ──
export function normAnswer(t) {
  return String(t ?? '').toLowerCase().replace(/[\u2018\u2019\u201c\u201d'"`]/g, '').replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9.+\-%\s/]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
}
function sameAnswer(a, b) {
  const x = normAnswer(a), y = normAnswer(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const nx = parseFloat(x), ny = parseFloat(y);
  if (!Number.isNaN(nx) && !Number.isNaN(ny) && /^[-+]?[0-9.]+(\s*[a-z%]+)?$/.test(x) && /^[-+]?[0-9.]+(\s*[a-z%]+)?$/.test(y)) return nx === ny;
  return false;
}
// answerText is a JSON array of strings (one per item) or a single string for one-item questions
export function gradeItems(q, answerText) {
  const items = q.answer_items || [];
  let given = [];
  try { const j = JSON.parse(answerText); given = Array.isArray(j) ? j : [String(j)]; } catch { given = [String(answerText ?? '')]; }
  const per = Number(q.marks) / items.length;
  const detail = items.map((it, i) => ({ prompt: it.prompt, given: given[i] ?? '', accepted: it.accepted, correct: (it.accepted || []).some(a => sameAnswer(given[i], a)) }));
  const right = detail.filter(d => d.correct).length;
  return { marks_awarded: Math.round(right * per * 100) / 100, max_marks: Number(q.marks), graded_by: 'auto', item_results: detail,
    points_hit: detail.filter(d => d.correct).map(d => d.prompt), points_missed: detail.filter(d => !d.correct).map(d => `${d.prompt}: ${d.accepted[0]}`) };
}

// Matches a question's section label to a paper section name. "Part II" must not resolve to "Part I",
// so an exact name wins, then the prefix match whose length is closest to the target.
export function pickSection(names, target) {
  if (!target) return undefined;
  if (names.includes(target)) return target;
  const cands = names.filter(n => n && (target.startsWith(n) || n.startsWith(target)));
  return cands.sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length))[0];
}

// ── Choice rules ("attempt any 4 of 6") ──────────────────────────────────────
// Only the first `attempt_n` answered main questions in a choice section count; for internal OR
// alternatives only the first answered alternative counts. Returns Set of question ids that count.
export function countedQuestionIds(paper, questions, answeredIds) {
  const answered = new Set(answeredIds);
  const counted = new Set();
  const secByName = {};
  for (const s of paper.sections || []) secByName[s.name] = s;
  const bySection = {};
  for (const q of questions) (bySection[q.section] ||= []).push(q);

  for (const [secName, qs] of Object.entries(bySection)) {
    const sec = secByName[pickSection(Object.keys(secByName), secName)];
    const choiceQs = qs.filter(q => q.mandatory === 'choice');
    // compulsory rows always count when answered
    for (const q of qs) if (q.mandatory === 'compulsory' && answered.has(q.id)) counted.add(q.id);

    // OR alternatives: first answered alternative per (main question, parent label)
    const orSeen = new Set();
    const eligible = [];
    for (const q of choiceQs.sort((a, b) => a.q_order - b.q_order)) {
      if (!answered.has(q.id)) continue;
      if (/\bOR\b|alternative/i.test(q.choice_note || '')) {
        const key = `${q.q_main}|${q.q_label.replace(/\((?:a|b)\)$/i, '')}`;
        if (orSeen.has(key)) continue;
        orSeen.add(key);
      }
      eligible.push(q);
    }
    const n = sec?.attempt_n;
    if (!n) { eligible.forEach(q => counted.add(q.id)); continue; }
    const mains = [];
    for (const q of eligible) if (!mains.includes(q.q_main)) mains.push(q.q_main);
    const allowed = new Set(mains.slice(0, n));
    eligible.filter(q => allowed.has(q.q_main)).forEach(q => counted.add(q.id));
  }
  return counted;
}

// ── Subjective grading against the marking points ────────────────────────────
function gradePrompt(q, studentAnswer) {
  const pts = (q.marking_points || []).map((p, i) => `${i}. [${p.marks}] ${p.point}`).join('\n');
  return `You are an ICSE Class 10 ${q.subject} examiner marking ONE answer strictly against the official marking points.

QUESTION (${q.marks} marks): ${q.question}

OFFICIAL SOLUTION:
${q.solution}

MARKING POINTS (index. [marks] point):
${pts}

STUDENT'S ANSWER:
${studentAnswer}

Rules:
- Award marks per point, 0 up to that point's marks (partial credit allowed where a point is partly there).
- Accept correct synonyms, paraphrase, lay terms and British/American spelling. Exact textbook wording is not required.
- Numericals: award method marks for correct formula and substitution even if the final number is wrong; a correct final answer without its unit loses only the unit mark if there is one.
- Programs: accept any correct logic; do not penalise trivial syntax slips unless the point is about syntax.
- A factual error contradicts a point: give 0 for that point and list it in "wrong".
- The student answer may come from handwriting recognition; ignore obvious transcription noise.
- Never award marks for a point the student did not cover. Total cannot exceed ${q.marks}.

Respond ONLY with JSON:
{"points":[{"i":0,"awarded":0}],"missing":["short statement of each point or fact the student did not give, using textbook wording"],"wrong":["each factual error, if any"],"feedback":"one encouraging sentence"}`;
}

export async function gradeSubjective(q, studentAnswer) {
  const max = Number(q.marks);
  if (!studentAnswer || !studentAnswer.trim()) {
    return { marks_awarded: 0, max_marks: max, graded_by: 'ai', points_hit: [], points_missed: (q.marking_points || []).map(p => p.point), feedback: 'Not attempted.' };
  }
  if (!q.marking_points || !q.marking_points.length) {
    return { marks_awarded: null, max_marks: max, graded_by: 'self', feedback: 'No marking scheme available for this question, so mark yourself against the solution.' };
  }
  try {
    const msg = await anthropic.messages.create({
      model: GRADE_MODEL, max_tokens: 900, messages: [{ role: 'user', content: gradePrompt(q, studentAnswer) }],
    });
    const text = msg.content.map(b => b.text || '').join('').trim();
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    return foldGrade(q, j);
  } catch (e) {
    console.error('grade error', q.id, e.message);
    return { marks_awarded: null, max_marks: max, graded_by: 'self', feedback: 'Automatic marking was unavailable, so mark yourself against the solution.' };
  }
}

// Turns the model's per-point marks into a clamped total + hit/missed lists (pure, unit-tested).
export function foldGrade(q, j) {
  const max = Number(q.marks);
  const pts = q.marking_points || [];
  const awarded = {};
  for (const p of j.points || []) awarded[p.i] = Math.max(0, Number(p.awarded) || 0);
  let total = 0; const hit = []; const missed = [];
  pts.forEach((p, i) => {
    const a = Math.min(awarded[i] ?? 0, Number(p.marks));
    total += a;
    (a >= Number(p.marks) - 1e-9 ? hit : a > 0 ? hit : missed).push(p.point + (a > 0 && a < Number(p.marks) ? ` (${a}/${p.marks})` : ''));
  });
  total = Math.min(Math.round(total * 100) / 100, max);
  return {
    marks_awarded: total, max_marks: max, graded_by: 'ai', points_hit: hit,
    points_missed: (j.missing && j.missing.length ? j.missing : missed), points_wrong: j.wrong || [], feedback: j.feedback || '',
  };
}

export async function mapPool(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
