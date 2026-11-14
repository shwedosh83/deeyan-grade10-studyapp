/**
 * auditPhysicsMCQ.js
 *
 * Fetches all Physics MCQ questions and flags ones where the question text
 * or answer options contain garbled formula patterns from OCR.
 *
 * Outputs:
 *   - Summary counts to stdout
 *   - Full flagged list to /tmp/physics_mcq_audit.json
 *   - Human-readable report to /tmp/physics_mcq_audit.txt
 *
 * Usage: node scripts/auditPhysicsMCQ.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Garbled formula detection ──────────────────────────────────────────────────

// Patterns that strongly indicate OCR garbling of mathematical notation
const GARBLE_PATTERNS = [
  // Superscript artifacts: variable immediately followed by digit (v2, r2, Mv2, mv2, F2, a2, n2)
  { re: /[a-zA-Z][0-9](?!\s*\w{3,})/g,    reason: 'Likely garbled superscript (e.g. v2 = v², r2 = r²)' },

  // Fraction artifacts: letter+digit+letter without operator (rMv2, mv2r, Mv2r)
  { re: /[a-z][A-Z][a-z]/g,               reason: 'Likely garbled fraction/expression (mixed case run-on)' },

  // Subscript artifacts: repeated short tokens (r r, F F, a a, v v)
  { re: /\b([a-zA-Z]{1,2})\s+\1\b/g,     reason: 'Repeated symbol (likely garbled subscript notation)' },

  // Known bad OCR sequences from Physics PDF
  { re: /\b(2ak|1ak|2bk|r\s*r\b)/gi,     reason: 'Known OCR artifact (2ak, r r, etc.)' },

  // Options that are suspiciously short and look like formula fragments (2-6 chars, no real word)
  // Handled separately in option check below

  // Ratio/fraction garble: slash replaced by juxtaposition
  { re: /\b[A-Z][a-z]?[0-9][A-Z][a-z]?[0-9]/g, reason: 'Possible garbled ratio (e.g. r1r2, F1F2)' },
];

// Short option texts that look like garbled math (not real words)
const SHORT_GARBLE_RE = /^[a-zA-Z0-9\s\+\-]{1,8}$/;
const REAL_WORD_RE = /[aeiou]{1,}/i;  // real words tend to have vowels

function checkText(text) {
  if (!text) return [];
  const hits = [];
  for (const { re, reason } of GARBLE_PATTERNS) {
    const matches = text.match(re);
    if (matches) {
      hits.push({ reason, matches: [...new Set(matches)].slice(0, 3) });
    }
  }
  return hits;
}

function checkOption(text, key) {
  if (!text) return null;
  const t = text.trim();
  // Flag short options with no vowels and no spaces that look like formula fragments
  if (t.length <= 10 && !REAL_WORD_RE.test(t) && /[0-9]/.test(t)) {
    return { reason: `Option ${key.toUpperCase()} looks like garbled formula fragment`, matches: [t] };
  }
  // Run standard garble check on option text too
  const hits = checkText(t);
  return hits.length > 0 ? { reason: hits[0].reason, matches: hits[0].matches } : null;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log('Fetching Physics MCQ questions...\n');

  // Paginate — Supabase returns max 1000 rows per request
  let allQuestions = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await admin
      .from('questions')
      .select('id, question, answer, options, chapter_name, skill')
      .eq('subject', 'physics')
      .eq('type', 'mcq')
      .range(from, from + pageSize - 1);

    if (error) { console.error('DB error:', error.message); return; }
    if (!data || data.length === 0) break;
    allQuestions = allQuestions.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Total Physics MCQs: ${allQuestions.length}\n`);

  const flagged = [];
  const clean = [];

  for (const q of allQuestions) {
    const issues = [];

    // Check question text
    const qHits = checkText(q.question);
    if (qHits.length > 0) {
      issues.push({ field: 'question', hits: qHits });
    }

    // Check answer field
    const aHits = checkText(q.answer);
    if (aHits.length > 0) {
      issues.push({ field: 'answer', hits: aHits });
    }

    // Check each option
    if (q.options && typeof q.options === 'object') {
      for (const [key, val] of Object.entries(q.options)) {
        const optIssue = checkOption(val, key);
        if (optIssue) {
          issues.push({ field: `option_${key}`, hits: [optIssue] });
        }
      }
    }

    if (issues.length > 0) {
      flagged.push({ id: q.id, chapter_name: q.chapter_name, skill: q.skill, question: q.question, answer: q.answer, options: q.options, issues });
    } else {
      clean.push(q.id);
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────────

  console.log(`✅ Clean:   ${clean.length}`);
  console.log(`⚠️  Flagged: ${flagged.length} (${Math.round(flagged.length / allQuestions.length * 100)}%)\n`);

  // Group flagged by chapter
  const byChapter = {};
  for (const q of flagged) {
    const ch = q.chapter_name || 'Unknown';
    if (!byChapter[ch]) byChapter[ch] = [];
    byChapter[ch].push(q);
  }

  console.log('── By Chapter ──────────────────────────────────────────');
  for (const [ch, qs] of Object.entries(byChapter).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${ch.padEnd(50)} ${qs.length} flagged`);
  }

  // Write JSON output
  const jsonOut = '/tmp/physics_mcq_audit.json';
  fs.writeFileSync(jsonOut, JSON.stringify({ total: allQuestions.length, clean: clean.length, flagged: flagged.length, questions: flagged }, null, 2));
  console.log(`\nFull JSON written to: ${jsonOut}`);

  // Write human-readable txt report
  const txtOut = '/tmp/physics_mcq_audit.txt';
  const lines = [];
  lines.push(`Physics MCQ Audit Report`);
  lines.push(`========================`);
  lines.push(`Total MCQs: ${allQuestions.length}  |  Clean: ${clean.length}  |  Flagged: ${flagged.length}\n`);

  for (const [ch, qs] of Object.entries(byChapter).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`\n── ${ch} (${qs.length} flagged) ──`);
    for (const q of qs.slice(0, 20)) {  // cap at 20 per chapter for readability
      lines.push(`  ID: ${q.id}`);
      lines.push(`  Q:  ${q.question.slice(0, 120)}`);
      if (q.options) {
        for (const [k, v] of Object.entries(q.options)) {
          lines.push(`      ${k.toUpperCase()}) ${v}`);
        }
      }
      lines.push(`  A:  ${q.answer?.slice(0, 80)}`);
      for (const issue of q.issues) {
        lines.push(`  ⚠️  [${issue.field}] ${issue.hits[0]?.reason} — found: ${issue.hits[0]?.matches?.join(', ')}`);
      }
      lines.push('');
    }
    if (qs.length > 20) lines.push(`  ... and ${qs.length - 20} more (see JSON file)`);
  }

  fs.writeFileSync(txtOut, lines.join('\n'));
  console.log(`Human-readable report written to: ${txtOut}`);
}

run().catch(console.error);
