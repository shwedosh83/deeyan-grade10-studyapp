/**
 * ingestClasswork.js: helper for the /ingest-classwork Claude Code command.
 *
 *   node backend/scripts/ingestClasswork.js list                         pending uploads as JSON
 *   node backend/scripts/ingestClasswork.js download <uploadId> <dir>    fetch that upload's files from the private bucket
 *   node backend/scripts/ingestClasswork.js apply <file.json>            install a read upload (questions + marks), mark it processed
 *   node backend/scripts/ingestClasswork.js fail <uploadId> "<reason>"   mark an upload as unreadable
 *
 * apply expects the board-paper JSON shape (see .claude/skills/ingest-paper/extraction-brief.md) with
 * source "classwork", a top-level "upload_id", and on each question "got" (marks the teacher gave, or null)
 * and optional "mistake". The paper goes to backend/data/board/<paper_id>.json and is uploaded like any other.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = 'classwork';
const [cmd, a1, a2] = process.argv.slice(2);
const die = m => { console.error(m); process.exit(1); };

async function list() {
  const { data, error } = await sb.from('classwork_uploads').select('*').eq('status', 'pending').order('created_at');
  if (error) die(error.message);
  console.log(JSON.stringify(data, null, 1));
}

async function download(id, dir) {
  if (!id || !dir) die('usage: download <uploadId> <dir>');
  const { data: u, error } = await sb.from('classwork_uploads').select('*').eq('id', id).single();
  if (error) die(error.message);
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, f] of (u.files || []).entries()) {
    const { data: blob, error: e } = await sb.storage.from(BUCKET).download(f.path);
    if (e) die(`${f.name}: ${e.message}`);
    const out = path.join(dir, `${String(i + 1).padStart(2, '0')}_${f.name}`);
    fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
    console.log(out);
  }
}

async function apply(file) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (p.source !== 'classwork') die('source must be "classwork"');
  if (!p.upload_id) die('upload_id missing');
  const { data: u, error } = await sb.from('classwork_uploads').select('*').eq('id', p.upload_id).single();
  if (error) die(error.message);
  if (p.subject !== u.subject) die(`subject ${p.subject} does not match upload subject ${u.subject}`);

  const dest = path.join(__dirname, '../data/board', `${p.paper_id}.json`);
  fs.writeFileSync(dest, JSON.stringify(p, null, 1));
  execFileSync('node', [path.join(__dirname, 'uploadBoardPapers.js'), p.paper_id], { stdio: 'inherit' });

  const rows = p.questions.filter(q => q.question).map(q => ({
    upload_id: u.id, user_id: u.user_id, question_id: `${p.paper_id}_${q.q_label}`, subject: p.subject,
    chapter: q.chapter || null, topic: q.topic || null, marks: Number(q.marks) || 0,
    got: q.got === null || q.got === undefined || q.got === '' ? null : Number(q.got), mistake: q.mistake || null, test_date: u.test_date,
  }));
  let r = await sb.from('classwork_results').delete().eq('upload_id', u.id);
  if (r.error) die(r.error.message);
  r = await sb.from('classwork_results').insert(rows);
  if (r.error) die(r.error.message);
  r = await sb.from('classwork_uploads').update({ status: 'processed', status_note: null, paper_id: p.paper_id, processed_at: new Date().toISOString() }).eq('id', u.id);
  if (r.error) die(r.error.message);
  const marked = rows.filter(x => x.got !== null);
  console.log(`${p.paper_id}: ${rows.length} questions, ${marked.length} marked, ${marked.reduce((s, x) => s + x.got, 0)}/${marked.reduce((s, x) => s + x.marks, 0)} marks`);
}

async function fail(id, reason) {
  const { error } = await sb.from('classwork_uploads').update({ status: 'failed', status_note: (reason || '').slice(0, 300) }).eq('id', id);
  if (error) die(error.message);
  console.log('marked failed');
}

({ list, download, apply, fail }[cmd] || (() => die('commands: list | download <id> <dir> | apply <file.json> | fail <id> "<reason>"')))(a1, a2)
  .catch(e => die(e.message || e));
