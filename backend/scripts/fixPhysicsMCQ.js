/**
 * fixPhysicsMCQ.js
 *
 * Reads the 40 genuinely-garbled Physics MCQs from the audit JSON,
 * sends each to Claude Haiku to clean OCR artifacts in the question,
 * options and answer, then updates the DB records.
 *
 * Usage: node scripts/fixPhysicsMCQ.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const admin     = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Identify genuinely garbled IDs (same logic as audit) ─────────────────────
function isGenuinelyGarbled(q) {
  const raw = JSON.stringify(q);
  return (
    /ms\s*[12]-|ms\s*-[12]|\bms-[12]\b/i.test(raw)    ||   // unit notation
    /10\s+[3-9]|10[3-9](?!\s*[a-z])/i.test(raw)        ||   // powers of 10
    /\b(rMv|Mv2|mv2|r\s+r\b|2ak|1ak|rr\b|v2r|Mv2r)\b/i.test(raw) ||  // formula run-ons
    /1[0-9]{2}\s*th\b/.test(raw)                             // fraction OCR
  );
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(q) {
  const opts = q.options || {};
  const optLines = Object.entries(opts)
    .map(([k, v]) => `${k.toUpperCase()}) ${v}`)
    .join('\n');

  return `You are fixing OCR artifacts in a Physics MCQ from an ICSE Grade 10 textbook.
The question was scanned via OCR and has garbled mathematical notation. Fix it carefully.

Common OCR artifacts to fix:
- "ms 1-" / "ms1-" / "ms -1"  →  ms⁻¹
- "ms 2-" / "ms2-" / "ms -2"  →  ms⁻²
- "10 7" / "107" (standalone)  →  10⁷  (use correct superscript digit)
- "10 3-" / "10-3"             →  10⁻³
- "v2" (physics context)       →  v²
- "r2" (physics context)       →  r²
- "m2" (physics context)       →  m²
- "Mv2" / "mv2"                →  Mv² or Mv²/r depending on context
- "r r" or "r1r2"              →  r₁/r₂
- "r1" / "r2" as subscripts    →  r₁ / r₂
- "F1" / "F2" as subscripts    →  F₁ / F₂
- "114 th" / "1 4 th"         →  ¼  (one-quarter)
- "12" as subscript            →  ½  (one-half)
- Negative exponents written as "3-" → superscript ⁻³
- Preserve the physics meaning exactly — only fix notation

Raw question text (may have options embedded at the end):
${q.question}

Current options (may be garbled):
${optLines}

Current answer field: ${q.answer}

Return ONLY valid JSON — no markdown, no explanation:
{
  "question": "cleaned question text, WITHOUT the (a)(b)(c)(d) options at the end",
  "options": { "a": "...", "b": "...", "c": "...", "d": "..." },
  "answer": "x"
}
Where "answer" is ONLY a single lowercase letter (a/b/c/d).`;
}

// ── Fix one question ──────────────────────────────────────────────────────────
async function fixQuestion(q) {
  const prompt = buildPrompt(q);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0].text.trim();

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`JSON parse failed: ${raw.slice(0, 200)}`);
  }

  // Validate shape
  if (!parsed.question || !parsed.options || !parsed.answer) {
    throw new Error(`Missing fields in response: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  // Normalise answer to lowercase single letter
  const answerLetter = parsed.answer.trim().toLowerCase().replace(/[^a-d]/g, '');
  if (!answerLetter) throw new Error(`Bad answer letter: ${parsed.answer}`);

  // Normalise options keys to lowercase
  const options = {};
  for (const [k, v] of Object.entries(parsed.options)) {
    options[k.toLowerCase()] = v;
  }

  return { question: parsed.question, options, answer: answerLetter };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const auditData = JSON.parse(fs.readFileSync('/tmp/physics_mcq_audit.json', 'utf8'));
  const candidates = auditData.questions.filter(isGenuinelyGarbled);

  console.log(`Fixing ${candidates.length} genuinely garbled Physics MCQs...\n`);

  let fixed = 0, errors = 0;
  const log = [];

  for (let i = 0; i < candidates.length; i++) {
    const q = candidates[i];
    process.stdout.write(`  [${i + 1}/${candidates.length}] ${q.id}... `);

    try {
      const result = await fixQuestion(q);

      // Update DB
      const { error: dbErr } = await admin
        .from('questions')
        .update({
          question: result.question,
          options:  result.options,
          answer:   result.answer,
        })
        .eq('id', q.id);

      if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

      fixed++;
      process.stdout.write(`✅\n`);
      log.push({ id: q.id, status: 'fixed', before: { question: q.question, options: q.options, answer: q.answer }, after: result });

    } catch (err) {
      errors++;
      process.stdout.write(`❌ ${err.message.slice(0, 80)}\n`);
      log.push({ id: q.id, status: 'error', error: err.message });
    }

    // Small delay to avoid rate limits
    if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n── Done ──`);
  console.log(`  Fixed:  ${fixed}`);
  console.log(`  Errors: ${errors}`);

  fs.writeFileSync('/tmp/physics_mcq_fix_log.json', JSON.stringify(log, null, 2));
  console.log(`\nFull log written to: /tmp/physics_mcq_fix_log.json`);
}

run().catch(console.error);
