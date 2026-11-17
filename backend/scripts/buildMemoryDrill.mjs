// Builds the definitions / memory drill data for the app.
//   node backend/scripts/buildMemoryDrill.mjs
// Reads the hand-written items (backend/data/memory_drill/items.mjs), checks that every source
// question really exists in board_questions as a board or prelim question of the same subject,
// tags each source with its paper (year / school) and writes frontend/src/data/memoryDrill.json.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { ITEMS } from '../data/memory_drill/items.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(here, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const OUT = path.join(here, '../../frontend/src/data/memoryDrill.json');
const KINDS = ['define', 'law', 'term', 'explain', 'meaning', 'unit'];
const HOWS = ['define', 'state', 'name', 'mcq', 'explain', 'meaning'];

const errors = [];
const ids = [...new Set(ITEMS.flatMap(it => it.asked.map(a => a[0])))];
const qs = {};
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db.from('board_questions').select('id,paper_id,subject,q_label,source,school').in('id', ids.slice(i, i + 200));
  if (error) throw error;
  for (const q of data) qs[q.id] = q;
}
const { data: papers, error: pe } = await db.from('board_papers').select('id,year,sem,label,source,school');
if (pe) throw pe;
const paperById = Object.fromEntries(papers.map(p => [p.id, p]));

function paperLabel(p) {
  if (p.source === 'board') return `Board ${p.label}`;          // "Board 2022 Sem 2", "Board 2024"
  return p.label.replace(/^Prelim\s*·\s*/, 'Prelim · ');       // "Prelim · Cathedral"
}

const seen = new Set();
const items = ITEMS.map(it => {
  if (seen.has(it.id)) errors.push(`duplicate id ${it.id}`); seen.add(it.id);
  if (!KINDS.includes(it.kind)) errors.push(`${it.id}: bad kind ${it.kind}`);
  for (const f of ['prompt', 'answer', 'chapter']) if (!it[f]) errors.push(`${it.id}: missing ${f}`);
  const asked = [];
  const papersSeen = new Set();
  for (const [qid, how] of it.asked) {
    const q = qs[qid];
    if (!q) { errors.push(`${it.id}: question ${qid} not in board_questions`); continue; }
    if (q.subject !== it.subject) errors.push(`${it.id}: ${qid} is ${q.subject}`);
    if (!['board', 'prelim'].includes(q.source)) errors.push(`${it.id}: ${qid} source ${q.source}`);
    if (!HOWS.includes(how)) errors.push(`${it.id}: bad how ${how}`);
    const p = paperById[q.paper_id];
    if (!p) { errors.push(`${it.id}: paper ${q.paper_id} missing`); continue; }
    papersSeen.add(p.id);
    asked.push({ q: qid, paper: p.id, label: paperLabel(p), q_label: q.q_label, source: p.source, year: p.year, how });
  }
  // board first (newest first), then prelims
  asked.sort((a, b) => (a.source === b.source ? (b.year - a.year) || a.label.localeCompare(b.label) : a.source === 'board' ? -1 : 1));
  return {
    id: it.id, subject: it.subject, chapter: it.chapter, kind: it.kind,
    prompt: it.prompt, answer: it.answer, keywords: it.keywords || [], tip: it.tip || null,
    papers: papersSeen.size, board: asked.some(a => a.source === 'board'), asked,
  };
});

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ version: 1, built: new Date().toISOString().slice(0, 10), items }, null, 1) + '\n');
const by = s => items.filter(i => i.subject === s);
for (const s of ['chemistry', 'biology', 'physics']) {
  const list = by(s);
  console.log(`${s}: ${list.length} items, ${list.filter(i => i.papers > 1).length} asked in 2+ papers, top: ${list.sort((a, b) => b.papers - a.papers).slice(0, 3).map(i => `${i.id}(${i.papers})`).join(', ')}`);
}
console.log('wrote', path.relative(process.cwd(), OUT));
