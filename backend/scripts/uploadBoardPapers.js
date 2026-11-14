/**
 * uploadBoardPapers.js
 *
 * Uploads backend/data/board/*.json (produced by extractBoardPapers.py) into
 * board_papers + board_questions. Run backend/migrations/add_board_papers.sql first.
 *
 * Usage:  node scripts/uploadBoardPapers.js [paper_id ...]      (no args = every file)
 *         node scripts/uploadBoardPapers.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DIR = path.join(__dirname, '../data/board');
const dry = process.argv.includes('--dry-run');
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

function paperRow(p) {
  return {
    id: p.paper_id, subject: p.subject, year: p.year, sem: p.sem, label: p.label,
    max_marks: p.max_marks, duration_minutes: p.duration_minutes, reading_minutes: p.reading_minutes,
    instructions: p.instructions, sections: p.sections, has_solutions: p.has_solutions,
  };
}

function questionRow(p, q) {
  return {
    id: `${p.paper_id}_${q.q_label}`, paper_id: p.paper_id, subject: p.subject,
    q_label: q.q_label, q_order: q.q_order, q_main: q.q_main, section: q.section, type: q.type,
    marks: q.marks, mandatory: q.mandatory, choice_note: q.choice_note, chapter: q.chapter, topic: q.topic,
    bloom: q.bloom, applied: !!q.applied, applied_kind: q.applied_kind, difficulty: q.difficulty, concepts: q.concepts,
    question: q.question, options: q.options || {}, is_objective: !!q.is_objective, correct_option: q.correct_option, answer_items: q.answer_items || null,
    solution: q.solution, marking_points: q.marking_points || [],
    needs_figure: !!q.needs_figure, figure_desc: q.figure_desc || null, figure_page: q.page || null, figure_url: q.figure_url || null,
  };
}

async function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).filter(f => !only.length || only.includes(f.replace('.json', '')));
  if (!files.length) { console.log('No paper files found in', DIR); return; }
  const sb = dry ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  let nq = 0;
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const rows = p.questions.filter(q => q.question).map(q => questionRow(p, q));
    console.log(`${p.paper_id}: ${rows.length} questions, ${rows.filter(r => r.is_objective).length} objective, ${rows.filter(r => r.solution).length} with solutions`);
    if (dry) continue;
    let r = await sb.from('board_papers').upsert(paperRow(p), { onConflict: 'id' });
    if (r.error) { console.error('  paper error:', r.error.message); continue; }
    for (let i = 0; i < rows.length; i += 50) {
      r = await sb.from('board_questions').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
      if (r.error) { console.error('  question error:', r.error.message); break; }
    }
    nq += rows.length;
  }
  console.log(dry ? 'dry run only' : `uploaded ${nq} questions from ${files.length} papers`);
}
main().catch(e => { console.error(e); process.exit(1); });
