// Full audit of all Biology short/long answers — checks if answer actually answers the question
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BATCH_SIZE = 10; // parallel requests
const REPORT_PATH = '/tmp/bio_audit_report.json';

async function checkRelevance(question, answer) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Does this answer actually answer this question? Reply YES or NO only.
Q: ${question.slice(0, 200)}
A: ${answer.slice(0, 200)}`
    }]
  });
  return res.content[0].text.trim().toUpperCase().startsWith('YES');
}

async function generateCorrectAnswer(question, chapterName) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are an ICSE Biology teacher for grade 10. Write a clear, accurate model answer for this question from the chapter "${chapterName}".

Question: ${question}

Write only the answer, 1-3 sentences, factually correct, no fluff.`
    }]
  });
  return res.content[0].text.trim();
}

async function processBatch(batch) {
  return Promise.all(batch.map(async (q) => {
    const isRelevant = await checkRelevance(q.question, q.answer);
    return { ...q, isRelevant };
  }));
}

async function main() {
  console.log('Fetching all Biology short/long answer questions...');
  const { data, error } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, type, question, answer')
    .eq('subject', 'biology')
    .in('type', ['short_answer', 'long_answer'])
    .order('chapter_id');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Total: ${data.length} questions\n`);

  const bad = [];
  let processed = 0;

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const results = await processBatch(batch);

    for (const r of results) {
      if (!r.isRelevant) {
        bad.push(r);
        console.log(`[BAD] ${r.id} | Ch${r.chapter_id}`);
        console.log(`  Q: ${r.question.slice(0, 80)}`);
        console.log(`  A: ${r.answer.slice(0, 80)}\n`);
      }
    }

    processed += batch.length;
    process.stdout.write(`\rProcessed: ${processed}/${data.length} | Bad so far: ${bad.length}`);
  }

  console.log(`\n\n=== Audit complete: ${bad.length} mismatched answers found ===\n`);

  if (bad.length === 0) {
    console.log('All answers look correct!');
    return;
  }

  // Save report before fixing
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ total: data.length, bad }, null, 2));
  console.log(`Report saved to ${REPORT_PATH}`);

  // Fix each bad answer using Claude
  console.log('\nGenerating correct answers for bad questions...\n');
  let fixed = 0;

  for (const q of bad) {
    try {
      const newAnswer = await generateCorrectAnswer(q.question, q.chapter_name);
      console.log(`Fixing: ${q.id}`);
      console.log(`  Old: ${q.answer.slice(0, 70)}`);
      console.log(`  New: ${newAnswer.slice(0, 70)}\n`);

      const { error: updateError } = await supabase
        .from('questions')
        .update({ answer: newAnswer })
        .eq('id', q.id);

      if (updateError) console.error(`  ERROR updating: ${updateError.message}`);
      else fixed++;
    } catch (e) {
      console.error(`Error fixing ${q.id}: ${e.message}`);
    }
  }

  console.log(`\n=== Done: ${fixed}/${bad.length} answers fixed ===`);
}

main();
