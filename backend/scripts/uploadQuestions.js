// Upload biology questions (MCQ + short answer) to Supabase
// Run: npm run upload
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const QUESTION_BANK_PATH = '/Users/shwetadoshi/Downloads/biology_questions_usable.json';
const SUBJECT = 'biology'; // change this when uploading other subjects

// OCR artifact patterns to reject
const OCR_GARBAGE = /[A-Z]{5,}|UUTIIUE|EQUESTION|[^\x00-\x7F]{3,}/;

// Fragment / bad-sentence patterns (from scanQuestions.js findings)
const STARTS_LOWERCASE    = /^[a-z]/;
const STARTS_PUNCTUATION  = /^[.,;:()\-]/;
const MID_SENTENCE        = /^(and|or|but|with|by|of|the|a |an |in |on |at |to |through |from |because )\s*/i;
const BLEEDING_CONTEXT    = /^\(i+\)|^which of the following|^class and/i;

function isCleanQuestion(text) {
  const t = text.trim();
  if (t.length < 20) return false;
  if (OCR_GARBAGE.test(t)) return false;
  if (STARTS_LOWERCASE.test(t)) return false;
  if (STARTS_PUNCTUATION.test(t)) return false;
  if (MID_SENTENCE.test(t)) return false;
  if (BLEEDING_CONTEXT.test(t)) return false;
  return true;
}

function isValidMCQ(q) {
  if (q.type !== 'mcq') return false;
  if (!q.question || !isCleanQuestion(q.question)) return false;
  if (!q.options || !q.options.a || !q.options.b || !q.options.c || !q.options.d) return false;
  if (!['a', 'b', 'c', 'd'].includes(q.answer)) return false;
  if (!q.skill || !q.chapter_name) return false;
  return true;
}

function isValidShortAnswer(q) {
  if (q.type !== 'short_answer') return false;
  if (!q.question || !isCleanQuestion(q.question)) return false;
  if (!/[?:]/.test(q.question)) return false; // must end with a real question
  if (!q.answer || q.answer.trim().length < 10) return false;
  if (!q.skill || !q.chapter_name) return false;
  return true;
}

function mapQuestion(q) {
  return {
    id: `${SUBJECT}_${q.id}`,
    subject: SUBJECT,
    chapter_id: q.chapter_id,
    chapter_name: q.chapter_name,
    type: q.type,
    skill: q.skill,
    year_tag: q.year_tag || null,
    question: q.question.trim(),
    options: q.options || {},
    answer: q.answer.trim(),
    explanation: q.explanation ? q.explanation.trim() : null,
  };
}

async function uploadQuestions() {
  console.log(`Cleaning up existing ${SUBJECT} data...`);
  // Delete session_answers (no subject column — delete all; just practice history)
  await supabase.from('session_answers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: delError } = await supabase
    .from('questions')
    .delete()
    .eq('subject', SUBJECT);
  if (delError) { console.error('Delete error:', delError.message); process.exit(1); }
  console.log('Cleaned up. Reading question bank...');
  const raw = fs.readFileSync(QUESTION_BANK_PATH, 'utf8');
  const all = JSON.parse(raw);

  const seen = new Set();
  const questions = all
    .filter((q) => isValidMCQ(q) || isValidShortAnswer(q))
    .filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    })
    .map(mapQuestion);

  const mcqCount = questions.filter((q) => q.type === 'mcq').length;
  const saCount = questions.filter((q) => q.type === 'short_answer').length;
  console.log(`Found ${all.length} total → uploading ${questions.length} valid questions (${mcqCount} MCQ, ${saCount} short answer)...`);

  const batchSize = 50;
  let uploaded = 0;

  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);
    const { error } = await supabase.from('questions').upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, error.message);
    } else {
      uploaded += batch.length;
      console.log(
        `Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(questions.length / batchSize)} (${uploaded} total)`
      );
    }
  }

  // Chapter breakdown by type
  const chapters = {};
  questions.forEach((q) => {
    if (!chapters[q.chapter_name]) chapters[q.chapter_name] = { mcq: 0, short_answer: 0 };
    chapters[q.chapter_name][q.type] = (chapters[q.chapter_name][q.type] || 0) + 1;
  });
  console.log('\nChapter breakdown:');
  Object.entries(chapters).forEach(([name, counts]) =>
    console.log(`  ${name}: ${counts.mcq || 0} MCQ, ${counts.short_answer || 0} short answer`)
  );
  console.log(`\nDone! ${uploaded} questions uploaded.`);
}

uploadQuestions().catch(console.error);
