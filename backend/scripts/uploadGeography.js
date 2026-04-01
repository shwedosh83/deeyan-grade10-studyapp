// Upload Geography questions to Supabase, then run full AI audit
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JSON_PATH = '/tmp/geography_questions.json';
const BATCH_SIZE = 50;

// Default skill tags per chapter (will be refined by tagGeoSkills later)
const DEFAULT_SKILL = {
  301: 'Topographical Maps',
  303: 'Location and Physical Features',
  304: 'Climate and Monsoon',
  305: 'Soil Types and Conservation',
  306: 'Natural Vegetation',
  307: 'Water Resources and Irrigation',
  308: 'Mineral Resources',
  309: 'Energy Resources',
  310: 'Agriculture and Crops',
  311: 'Manufacturing Industries',
  312: 'Transport',
  313: 'Waste Management',
};

// ─── Upload ──────────────────────────────────────────────────────────────────

async function upload() {
  const questions = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`Uploading ${questions.length} geography questions...`);

  // Clear existing geography questions
  const { error: delErr } = await supabase.from('questions').delete().eq('subject', 'geography');
  if (delErr) console.error('Delete error:', delErr.message);
  else console.log('Cleared existing geography questions');

  // Map to schema columns only (questions table has no correct_option/marks/source_* cols)
  const rows = questions.map(q => {
    // For MCQs: prepend "(x) - " to answer so evaluator knows the correct option
    let answer = q.answer || '';
    if (q.type === 'mcq' && q.correct_option && q.options) {
      const optText = q.options[q.correct_option] || '';
      answer = `(${q.correct_option}) ${optText}`.trim() + (answer ? ' — ' + answer : '');
    }

    return {
      id:           q.id,
      subject:      q.subject,
      chapter_id:   q.chapter_id,
      chapter_name: q.chapter_name,
      type:         q.type,
      skill:        q.skill || DEFAULT_SKILL[q.chapter_id] || 'Geography',
      year_tag:     q.source_year ? String(q.source_year) : null,
      question:     q.question,
      options:      q.options || {},
      answer:       answer,
    };
  });

  let uploaded = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('questions').insert(batch);
    if (error) {
      console.error(`\nBatch ${i}–${i + BATCH_SIZE} error:`, error.message);
      console.error('First item:', JSON.stringify(batch[0], null, 2));
      break;
    }
    uploaded += batch.length;
    process.stdout.write(`\rUploaded: ${uploaded}/${rows.length}`);
  }
  console.log(`\nUpload complete: ${uploaded}/${rows.length}`);
  return uploaded;
}

// ─── AI Audit ────────────────────────────────────────────────────────────────

async function checkRelevance(question, answer) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Does this answer actually answer this question for ICSE Grade 10 Geography? Reply YES or NO only.\nQ: ${question.slice(0, 200)}\nA: ${answer.slice(0, 200)}`
    }]
  });
  return res.content[0].text.trim().toUpperCase().startsWith('YES');
}

async function generateAnswer(question, chapterName) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Write a concise ICSE Grade 10 Geography answer for: "${question}" (Chapter: ${chapterName}). Max 3 sentences.`
    }]
  });
  return res.content[0].text.trim();
}

async function audit() {
  console.log('\nRunning AI audit on uploaded questions...');
  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, question, answer, chapter_name, type')
    .eq('subject', 'geography')
    .neq('type', 'mcq');  // MCQs already have verified correct options

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`Auditing ${questions.length} non-MCQ questions...`);

  let fixed = 0, skipped = 0;
  const CONCURRENCY = 10;

  for (let i = 0; i < questions.length; i += CONCURRENCY) {
    const batch = questions.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async q => {
      if (!q.answer || q.answer.length < 10) {
        const newAns = await generateAnswer(q.question, q.chapter_name);
        const { error: upErr } = await supabase.from('questions').update({ answer: newAns }).eq('id', q.id);
        if (!upErr) fixed++;
        return;
      }
      const ok = await checkRelevance(q.question, q.answer);
      if (!ok) {
        const newAns = await generateAnswer(q.question, q.chapter_name);
        const { error: upErr } = await supabase.from('questions').update({ answer: newAns }).eq('id', q.id);
        if (!upErr) fixed++;
      } else {
        skipped++;
      }
    }));
    process.stdout.write(`\rAudited: ${Math.min(i + CONCURRENCY, questions.length)}/${questions.length}  Fixed: ${fixed}`);
  }
  console.log(`\nAudit complete. Fixed: ${fixed}, Already good: ${skipped}`);
}

// ─── Final count ─────────────────────────────────────────────────────────────

async function finalCount() {
  const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('subject', 'geography');
  console.log(`\nFinal DB count for geography: ${count}`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

(async () => {
  await upload();
  await audit();
  await finalCount();
})();
