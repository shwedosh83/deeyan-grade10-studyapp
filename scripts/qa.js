#!/usr/bin/env node
/**
 * QA smoke-test suite — run before every production deploy.
 * Usage:
 *   node scripts/qa.js                  # tests production
 *   node scripts/qa.js http://localhost:5173  # tests local
 */

const BASE = process.argv[2] || 'https://deeyan-grade10-studyapp.vercel.app';

let passed = 0;
let failed = 0;
const failures = [];

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function check(name, fn) {
  try {
    const result = await fn();
    if (result.ok) {
      console.log(`  ✅  ${name}`);
      passed++;
    } else {
      console.log(`  ❌  ${name} — ${result.reason}`);
      failures.push({ name, reason: result.reason });
      failed++;
    }
  } catch (e) {
    console.log(`  ❌  ${name} — ${e.message}`);
    failures.push({ name, reason: e.message });
    failed++;
  }
}

function ok()             { return { ok: true }; }
function fail(reason)     { return { ok: false, reason }; }

async function run() {
  console.log(`\n🧪  QA tests → ${BASE}\n`);

  // ── /api/questions ───────────────────────────────────────────────────────
  console.log('  /api/questions');

  await check('Prelim Papers (geography) returns questions', async () => {
    const d = await post('/api/questions', { subject: 'geography', source: 'prelim', chapters: [], limit: 5 });
    if (d.error) return fail(d.error);
    if (!Array.isArray(d.questions) || d.questions.length === 0) return fail('empty array');
    if (!d.questions[0].question) return fail('missing question field');
    return ok();
  });

  await check('Board Papers (geography) returns questions', async () => {
    const d = await post('/api/questions', { subject: 'geography', source: 'board', chapters: [], limit: 5 });
    if (d.error) return fail(d.error);
    if (!Array.isArray(d.questions) || d.questions.length === 0) return fail('empty array');
    return ok();
  });

  await check('All Sources (physics) returns questions', async () => {
    const d = await post('/api/questions', { subject: 'physics', source: null, chapters: [], limit: 5 });
    if (d.error) return fail(d.error);
    if (!Array.isArray(d.questions) || d.questions.length === 0) return fail('empty array');
    return ok();
  });

  await check('All Sources (biology) returns questions', async () => {
    const d = await post('/api/questions', { subject: 'biology', source: null, chapters: [], limit: 5 });
    if (d.error) return fail(d.error);
    if (!Array.isArray(d.questions) || d.questions.length === 0) return fail('empty array');
    return ok();
  });

  await check('Chapter filter (geography, specific chapter) returns questions', async () => {
    // Fetch a chapter_id first via a general call
    const all = await post('/api/questions', { subject: 'geography', source: null, chapters: [], limit: 5 });
    if (!all.questions?.length) return fail('no questions to derive chapter from');
    const cid = all.questions[0].chapter_id;
    const d = await post('/api/questions', { subject: 'geography', source: null, chapters: [cid], limit: 5 });
    if (d.error) return fail(d.error);
    if (!Array.isArray(d.questions) || d.questions.length === 0) return fail('empty array');
    return ok();
  });

  await check('Board Papers (physics) returns no error (year_tag may be null)', async () => {
    const d = await post('/api/questions', { subject: 'physics', source: 'board', chapters: [], limit: 5 });
    if (d.error) return fail(d.error);
    // 0 results is acceptable for physics board (no year_tags) — just no crash
    return ok();
  });

  // ── /api/evaluate ────────────────────────────────────────────────────────
  console.log('\n  /api/evaluate');

  await check('Evaluate endpoint responds', async () => {
    const d = await post('/api/evaluate', {
      question: 'What is photosynthesis?',
      modelAnswer: 'Photosynthesis is the process by which plants use sunlight to make food.',
      studentAnswer: 'Plants use sunlight to make food.',
      skill: 'test',
      type: 'short_answer',
      marks: 2,
      subject: 'biology',
    });
    if (d.error) return fail(d.error);
    if (typeof d.score === 'undefined') return fail('missing score field');
    return ok();
  });

  // ── /api/tutor ───────────────────────────────────────────────────────────
  console.log('\n  /api/tutor');

  await check('Tutor explains a concept (biology)', async () => {
    const d = await post('/api/tutor', {
      subject: 'biology',
      question: 'Explain osmosis',
      history: [],
    });
    if (d.error) return fail(d.error);
    if (!d.message) return fail('missing message field');
    if (!d.message.includes('🔍')) return fail('response missing expected structure');
    return ok();
  });

  await check('Tutor handles follow-up (with history)', async () => {
    const d = await post('/api/tutor', {
      subject: 'physics',
      question: 'Give me an example',
      history: [
        { role: 'user', content: 'Explain Bernoulli\'s principle' },
        { role: 'assistant', content: '🔍 CORE IDEA\nBernoulli\'s principle states...' },
      ],
    });
    if (d.error) return fail(d.error);
    if (!d.message) return fail('missing message field');
    return ok();
  });

  // ── /api/coach ───────────────────────────────────────────────────────────
  console.log('\n  /api/coach');

  await check('Coach hint endpoint responds', async () => {
    const d = await post('/api/coach', {
      type: 'hint',
      data: { question: 'What is erosion?', correctAnswer: 'Wearing away of soil', subject: 'geography', skill: 'Soil Resources' },
    });
    if (d.error) return fail(d.error);
    if (!d.message) return fail('missing message field');
    return ok();
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\n  Failures:');
    failures.forEach(f => console.log(`    • ${f.name}: ${f.reason}`));
    console.log('\n❌  QA FAILED — fix issues before deploying\n');
    process.exit(1);
  }

  console.log('\n✅  All QA checks passed — safe to deploy\n');
}

run();
