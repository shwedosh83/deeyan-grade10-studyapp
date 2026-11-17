// Definitions / memory drill: data loading and the student's self-marks.
// The items (questions + model answers) are built by backend/scripts/buildMemoryDrill.mjs into
// src/data/memoryDrill.json and loaded on demand. Self-marks live in this browser (localStorage).

export const MEMORY_SUBJECTS = ['chemistry', 'biology', 'physics'];

export const KIND_LABEL = {
  define: 'Define', law: 'State the law', term: 'Name the term', explain: 'Explain the term', meaning: 'What it means', unit: 'Units',
};
export const HOW_LABEL = {
  define: 'define', state: 'state', name: 'name the term', mcq: 'MCQ', explain: 'explain', meaning: 'meaning',
};

let cache = null;
export async function loadMemoryItems(subject) {
  if (!cache) cache = import('../data/memoryDrill.json').then(m => m.default || m);
  const data = await cache;
  return data.items.filter(i => i.subject === subject);
}

// marks: { [itemId]: { last: 'got'|'nearly'|'missed', got: n, tries: n, at: ms } }
const key = userId => `fm.memoryDrill.v1.${userId || 'anon'}`;
export function readMarks(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '{}') || {}; } catch { return {}; }
}
export function saveMark(userId, itemId, mark) {
  const all = readMarks(userId);
  const prev = all[itemId] || { got: 0, tries: 0 };
  all[itemId] = { last: mark, got: prev.got + (mark === 'got' ? 1 : 0), tries: prev.tries + 1, at: Date.now() };
  try { localStorage.setItem(key(userId), JSON.stringify(all)); } catch { /* storage full or blocked: the round still works */ }
  return all;
}

// A round mixes review and new cards: up to half are ones he missed or nearly got (least recently
// tried first), the rest are cards he hasn't tried (most-asked first, shuffled within ties), then
// learnt ones least recently seen. So a short round never just repeats the last one.
export function orderForDrill(items, marks, size = 0) {
  const jitter = new Map(items.map(i => [i.id, Math.random()]));
  const at = i => marks[i.id]?.at || 0;
  const review = items.filter(i => ['missed', 'nearly'].includes(marks[i.id]?.last)).sort((a, b) => at(a) - at(b) || jitter.get(a.id) - jitter.get(b.id));
  const fresh = items.filter(i => !marks[i.id]).sort((a, b) => b.papers - a.papers || jitter.get(a.id) - jitter.get(b.id));
  const learnt = items.filter(i => marks[i.id]?.last === 'got').sort((a, b) => at(a) - at(b) || jitter.get(a.id) - jitter.get(b.id));
  if (!size) return [...review, ...fresh, ...learnt];
  const nReview = Math.min(review.length, Math.max(Math.ceil(size / 2), size - fresh.length - learnt.length));
  const picked = [...review.slice(0, nReview), ...fresh, ...learnt, ...review.slice(nReview)].slice(0, size);
  return picked;
}
