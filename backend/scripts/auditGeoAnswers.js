/**
 * auditGeoAnswers.js
 * For every Geography question:
 *  1. Generate a Claude Haiku model answer
 *  2. Compare it with the PDF answer already in the DB
 *  3. If PDF answer is significantly worse or irrelevant → replace with Claude answer
 *     Otherwise keep PDF answer (it's likely more detailed/specific)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONCURRENCY = 8;

async function generateModelAnswer(question, chapterName, type) {
  const lengthGuide = type === 'short_answer'
    ? '1-2 sentences, factual, concise.'
    : '3-5 sentences, covering key points with geographic reasons/examples.';

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `You are an ICSE Grade 10 Geography teacher. Write a model answer for:

Chapter: ${chapterName}
Question: ${question}

Instructions: ${lengthGuide} Use correct geographical terminology. No bullet points — write in flowing sentences.`
    }]
  });
  return res.content[0].text.trim();
}

async function compareAndAudit(question, pdfAnswer, claudeAnswer) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `For this ICSE Geography question, which answer is better for a Grade 10 student?

Question: ${question.slice(0, 200)}

Answer A (from textbook): ${pdfAnswer.slice(0, 300)}
Answer B (Claude model): ${claudeAnswer.slice(0, 300)}

Reply with ONLY: "A" if textbook answer is better or equally good, "B" if Claude model is clearly better.`
    }]
  });
  return res.content[0].text.trim().startsWith('B') ? 'B' : 'A';
}

async function run() {
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question, answer, chapter_name, type')
    .eq('subject', 'geography')
    .neq('type', 'mcq');

  if (error) { console.error(error.message); return; }
  console.log(`Processing ${questions.length} Geography short/long answer questions...`);
  console.log('Strategy: generate Claude model answer, keep whichever is better.\n');

  let keptPDF = 0, replacedWithClaude = 0, errors = 0;

  for (let i = 0; i < questions.length; i += CONCURRENCY) {
    const batch = questions.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async q => {
      try {
        const claudeAns = await generateModelAnswer(q.question, q.chapter_name, q.type);
        const winner = await compareAndAudit(q.question, q.answer, claudeAns);

        if (winner === 'B') {
          const { error: upErr } = await supabase
            .from('questions')
            .update({ answer: claudeAns })
            .eq('id', q.id);
          if (!upErr) replacedWithClaude++;
          else errors++;
        } else {
          keptPDF++;
        }
      } catch (e) {
        errors++;
      }
    }));

    process.stdout.write(
      `\rProcessed: ${Math.min(i + CONCURRENCY, questions.length)}/${questions.length}  ` +
      `Kept PDF: ${keptPDF}  Upgraded to Claude: ${replacedWithClaude}  Errors: ${errors}`
    );
  }

  console.log('\n\nDone!');
  console.log(`PDF answers kept:         ${keptPDF}`);
  console.log(`Upgraded to Claude answer: ${replacedWithClaude}`);
  console.log(`Errors:                    ${errors}`);

  // Final DB count
  const { count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject', 'geography');
  console.log(`\nFinal DB count: ${count}`);
}

run();
