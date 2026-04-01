/**
 * auditGeoAnswers.js  — v2
 *
 * Strategy: PDF answers are the baseline. Claude only intervenes when:
 *   1. Answer is empty / too short (< 20 chars)
 *   2. Answer is factually wrong or completely off-topic
 *   3. Answer is too brief for the marks (missing key points)
 *
 * Claude NEVER replaces a PDF answer just because its prose sounds cleaner.
 * The PDF answers come from a published ICSE question bank — they are the
 * examiner-aligned baseline.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONCURRENCY = 8;

/**
 * Returns A (keep), B (factually wrong → replace), or C (too brief → enrich)
 */
async function checkAnswer(question, answer, marks) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `ICSE Grade 10 Geography. Marks: ${marks}.

Question: ${question.slice(0, 200)}
Answer: ${answer.slice(0, 400)}

Is this answer:
(A) Correct and sufficient for ${marks} mark${marks > 1 ? 's' : ''} — keep it
(B) Factually wrong or completely off-topic — needs replacement
(C) Correct but too brief — missing key points for ${marks} marks

Reply ONLY with A, B, or C.`
    }]
  });
  return res.content[0].text.trim().toUpperCase()[0];
}

/**
 * Generate a fix. For C: enrich existing answer. For B: write fresh answer.
 */
async function fixAnswer(question, existingAnswer, verdict, chapterName, marks) {
  const prompt = verdict === 'C'
    ? `ICSE Grade 10 Geography, Chapter: ${chapterName}.
The answer below is correct but too brief for ${marks} marks. Keep what is right and ADD the missing points only. Do not rewrite.

Question: ${question}
Existing answer: ${existingAnswer}

Extended answer (add missing points):`
    : `ICSE Grade 10 Geography, Chapter: ${chapterName}.
Write a correct model answer for ${marks} mark${marks > 1 ? 's' : ''}. Be specific — use correct geographic facts, terminology and examples. ${marks <= 2 ? '1-2 sentences.' : '3-5 sentences.'}

Question: ${question}
Answer:`;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    messages: [{ role: 'user', content: prompt }]
  });
  return res.content[0].text.trim();
}

async function run() {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question, answer, chapter_name, type')
    .eq('subject', 'geography')
    .neq('type', 'mcq');

  if (error) { console.error(error.message); return; }
  console.log(`Auditing ${questions.length} Geography short/long answer questions`);
  console.log('Rule: PDF is baseline. Only fix factually wrong or too-brief answers.\n');

  let keptA = 0, fixedB = 0, enrichedC = 0, errors = 0;

  for (let i = 0; i < questions.length; i += CONCURRENCY) {
    const batch = questions.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async q => {
      try {
        const marks = q.type === 'short_answer' ? 2 : 4;

        // Empty/very short → fix directly without wasting an audit call
        if (!q.answer || q.answer.length < 20) {
          const fixed = await fixAnswer(q.question, q.answer || '', 'B', q.chapter_name, marks);
          await supabase.from('questions').update({ answer: fixed }).eq('id', q.id);
          fixedB++;
          return;
        }

        const verdict = await checkAnswer(q.question, q.answer, marks);

        if (verdict === 'B') {
          const fixed = await fixAnswer(q.question, q.answer, 'B', q.chapter_name, marks);
          await supabase.from('questions').update({ answer: fixed }).eq('id', q.id);
          fixedB++;
        } else if (verdict === 'C') {
          const enriched = await fixAnswer(q.question, q.answer, 'C', q.chapter_name, marks);
          await supabase.from('questions').update({ answer: enriched }).eq('id', q.id);
          enrichedC++;
        } else {
          keptA++;
        }
      } catch {
        errors++;
      }
    }));

    process.stdout.write(
      `\rProcessed: ${Math.min(i + CONCURRENCY, questions.length)}/${questions.length}  ` +
      `Kept: ${keptA}  Fixed(wrong): ${fixedB}  Enriched(brief): ${enrichedC}  Errors: ${errors}`
    );
  }

  console.log('\n\n=== Audit Complete ===');
  console.log(`PDF answers kept as-is:     ${keptA}`);
  console.log(`Replaced (factually wrong): ${fixedB}`);
  console.log(`Enriched (too brief):       ${enrichedC}`);
  console.log(`Errors:                     ${errors}`);

  const { count } = await supabase
    .from('questions').select('*', { count: 'exact', head: true }).eq('subject', 'geography');
  console.log(`\nFinal DB count: ${count}`);
}

run();
