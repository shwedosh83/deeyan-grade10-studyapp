/**
 * Upload PDF-parsed biology questions to Supabase.
 * These are questions parsed from Biology 10th.pdf (Nodia ICSE question bank).
 * IDs are prefixed with "pdf_ch{N}_" to avoid collision with existing "biology_N" IDs.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const SUBJECT = 'biology';
const INPUT_FILE = '/tmp/bio_pdf_questions.json';
const BATCH_SIZE = 50;

function formatForSupabase(q) {
  return {
    id: `${SUBJECT}_${q.id}`,
    subject: SUBJECT,
    chapter_id: q.chapter_id,
    chapter_name: q.chapter_name,
    question: q.question,
    type: q.type === 'MCQ' ? 'mcq' : 'short_answer',
    skill: q.skill,
    year_tag: q.year_tag || null,
    options: q.options || {},
    answer: q.correctAnswer,
    explanation: q.explanation || null,
  };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('Run parsePDF.py first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Loaded ${raw.length} questions from ${INPUT_FILE}`);

  // Dedup by id (same question num can appear in both columns)
  const seenIds = new Set();
  const rows = raw.map(formatForSupabase).filter(r => {
    if (seenIds.has(r.id)) return false;
    seenIds.add(r.id);
    return true;
  });

  const mcqCount = rows.filter(r => r.type === 'mcq').length;
  const saCount = rows.filter(r => r.type === 'short_answer').length;
  console.log(`MCQ: ${mcqCount} | Short Answer: ${saCount}`);

  let uploaded = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('questions')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
      errors++;
    } else {
      uploaded += batch.length;
      process.stdout.write(`\r  Uploaded ${uploaded}/${rows.length}...`);
    }
  }

  console.log(`\nDone! Uploaded: ${uploaded}, Errors: ${errors}`);
}

main().catch(console.error);
