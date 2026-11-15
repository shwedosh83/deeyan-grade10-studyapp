// Shared helpers for the board-paper practice screens.

export async function boardApi(name, body) {
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

export const SUBJECTS_WITH_BOARD = ['biology', 'chemistry', 'physics', 'geography', 'history_civics', 'maths', 'computer_applications'];

// Maths is solved on paper: no Applied mode, only timed uploads and Sprint.
export const BOARD_MODES_WITHOUT_APPLIED = ['maths'];

// Subjects that only have board papers in the app (no chapter quizzes/skills yet):
// they open straight on the Board tab and hide the empty tabs.
export const BOARD_ONLY_SUBJECTS = ['maths', 'computer_applications'];

// One-tap symbols for typing maths answers.
export const MATH_KEYS = ['√', '²', '³', 'π', '÷', '×', '±'];

export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtMarks(n) {
  const x = Number(n);
  return Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, '');
}

// ── Answers ─────────────────────────────────────────────────────────────────
export function getItems(q) {
  if (q.items && q.items.length) return q.items;
  if (q.answer_items && q.answer_items.length) return q.answer_items.map(i => ({ prompt: i.prompt }));
  return [];
}

export function isMCQ(q) {
  return q.options && Object.keys(q.options).length >= 2 && getItems(q).length === 0;
}

export function parseOption(text) {
  const m = String(text || '').trim().match(/^\(?\s*([a-dA-D])\s*\)?(?:[\s.:)-]|$)/);
  return m ? m[1].toLowerCase() : null;
}

export function parseItems(value, n) {
  let arr = [];
  try { const j = JSON.parse(value); if (Array.isArray(j)) arr = j.map(String); } catch { /* plain text */ }
  while (arr.length < n) arr.push('');
  return arr.slice(0, Math.max(n, arr.length));
}

export function hasAnswer(q, value) {
  if (!value || !String(value).trim()) return false;
  if (getItems(q).length) return parseItems(value, getItems(q).length).some(x => x.trim());
  return true;
}

// Same normalisation as the server (api/_boardLib.js) so Sprint feedback matches the final marking.
export function normAnswer(t) {
  return String(t ?? '').toLowerCase().replace(/[‘’“”'"`]/g, '').replace(/\b(the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9.+\-%\s/]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
}
function sameAnswer(a, b) {
  const x = normAnswer(a), y = normAnswer(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const num = /^[-+]?[0-9.]+(\s*[a-z%]+)?$/;
  const nx = parseFloat(x), ny = parseFloat(y);
  return !Number.isNaN(nx) && !Number.isNaN(ny) && num.test(x) && num.test(y) && nx === ny;
}

export function correctKeys(q) {
  return String(q.correct_option || '').toLowerCase().split(/[,|]/).map(s => s.trim()).filter(Boolean);
}

// Local check used by Sprint for instant feedback. Returns { correct, got, total }.
export function checkObjective(q, value) {
  const items = q.answer_items || [];
  if (items.length) {
    const given = parseItems(value, items.length);
    const flags = items.map((it, i) => (it.accepted || []).some(a => sameAnswer(given[i], a)));
    const got = flags.filter(Boolean).length;
    return { correct: got === items.length, got, total: items.length, flags };
  }
  const ok = correctKeys(q).includes(parseOption(value));
  return { correct: ok, got: ok ? 1 : 0, total: 1 };
}

// ── Choice rules ("attempt any 4 of 6") ─────────────────────────────────────
// Same rule as api/_boardLib.js: exact name first, so "Part II" never resolves to "Part I".
export function pickSection(names, target) {
  if (!target) return undefined;
  if (names.includes(target)) return target;
  const cands = names.filter(n => n && (target.startsWith(n) || n.startsWith(target)));
  return cands.sort((a, b) => Math.abs(a.length - target.length) - Math.abs(b.length - target.length))[0];
}

export function sectionOf(paper, q) {
  const name = pickSection((paper.sections || []).map(s => s.name), q.section);
  return (paper.sections || []).find(s => s.name === name) || null;
}

// Main questions grouped by section, in paper order.
export function groupMains(questions) {
  const sections = [];
  const bySec = new Map();
  for (const q of questions) {
    const key = q.section || 'All';
    if (!bySec.has(key)) { const s = { name: key, mains: [] }; bySec.set(key, s); sections.push(s); }
    const sec = bySec.get(key);
    let m = sec.mains.find(x => x.main === q.q_main);
    if (!m) { m = { main: q.q_main, rows: [] }; sec.mains.push(m); }
    m.rows.push(q);
  }
  return sections;
}

export function mainMarks(m) { return m.rows.reduce((s, r) => s + Number(r.marks), 0); }

// ── Scans: downscale a photo to a JPEG the API will accept ──────────────────
export function fileToJpegBase64(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image')); };
    img.src = url;
  });
}

// ── Question sources (real board papers vs school prelim papers) ────────────
export const SOURCE_LABELS = { '': 'Board + prelims', board: 'Board papers', prelim: 'Prelim drill', competency: 'Competency', classwork: 'School tests' };

// Caption under a question saying which paper it came from.
export function paperTag(q) {
  if (q.source === 'prelim') return `${q.school || 'School'} prelim`;
  if (q.source === 'competency') return 'CISCE competency';
  if (q.source === 'classwork') return q.school || 'School test';
  return `${String(q.paper_id || '').replace(/^[a-z_]+?_(\d{4}.*)$/, '$1').toUpperCase()} board paper`;
}

export const KIND_LABELS = {
  case: 'Case / scenario', numerical: 'Numerical', data_diagram: 'Data / diagram', reasoning: 'Reasoning',
  program: 'Program', map: 'Map work', assertion_reason: 'Assertion–reason',
};
