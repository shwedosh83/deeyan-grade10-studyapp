// Load .env manually (dotenv.config has quirks in some environments)
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env');
const envParsed = require('dotenv').parse(fs.readFileSync(envPath));
Object.assign(process.env, envParsed);

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CHAPTERS = [
  { id: 1,  name: 'Cell Cycle and Structure of Chromosomes' },
  { id: 2,  name: 'Genetics' },
  { id: 3,  name: 'Absorption by Roots' },
  { id: 4,  name: 'Transpiration' },
  { id: 5,  name: 'Photosynthesis' },
  { id: 6,  name: 'Chemical Coordination in Plants' },
  { id: 7,  name: 'The Circulatory System' },
  { id: 8,  name: 'The Excretory System' },
  { id: 9,  name: 'Nervous System and Sense Organs' },
  { id: 10, name: 'The Endocrine System' },
  { id: 11, name: 'The Reproductive System' },
  { id: 12, name: 'Human Population' },
  { id: 13, name: 'Human Evolution' },
  { id: 14, name: 'Pollution' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateQuestionsForChapter(chapter) {
  const prompt = `You are a biology teacher creating exam questions for the chapter "${chapter.name}" for high school students.

Generate exactly:
- 15 MCQ questions (multiple choice with 4 options a/b/c/d and a correct answer)
- 10 short answer questions (with a model answer of 2-4 sentences)

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "mcq": [
    {
      "question": "...",
      "options": {"a": "...", "b": "...", "c": "...", "d": "..."},
      "answer": "a",
      "explanation": "..."
    }
  ],
  "short_answer": [
    {
      "question": "...",
      "answer": "..."
    }
  ]
}

Make sure:
- All 15 MCQ entries are present
- All 10 short_answer entries are present
- The "answer" field for MCQ contains only the letter (a, b, c, or d)
- Questions are relevant and accurate for the chapter "${chapter.name}"`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content[0].text.trim();

  // Strip markdown code fences if present
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error(`  [ERROR] Failed to parse JSON for chapter ${chapter.id} (${chapter.name}): ${err.message}`);
    console.error('  Raw response snippet:', rawText.slice(0, 300));
    return null;
  }

  return parsed;
}

async function uploadQuestions(chapter, questions) {
  const timestamp = Date.now();
  const rows = [];

  // Build MCQ rows
  if (Array.isArray(questions.mcq)) {
    questions.mcq.forEach((q, i) => {
      rows.push({
        id: `ai_ch${chapter.id}_mcq_${i + 1}_${timestamp}`,
        subject: 'biology',
        chapter_id: chapter.id,
        chapter_name: chapter.name,
        type: 'mcq',
        question: q.question,
        options: q.options || {},
        answer: q.answer,
        explanation: q.explanation || null,
        skill: chapter.name,
        year_tag: 'AI Generated',
      });
    });
  }

  // Build short answer rows
  if (Array.isArray(questions.short_answer)) {
    questions.short_answer.forEach((q, i) => {
      rows.push({
        id: `ai_ch${chapter.id}_sa_${i + 1}_${timestamp}`,
        subject: 'biology',
        chapter_id: chapter.id,
        chapter_name: chapter.name,
        type: 'short_answer',
        question: q.question,
        options: {},
        answer: q.answer,
        explanation: null,
        skill: chapter.name,
        year_tag: 'AI Generated',
      });
    });
  }

  if (rows.length === 0) {
    console.error(`  [ERROR] No rows to upload for chapter ${chapter.id}`);
    return;
  }

  const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error(`  [ERROR] Supabase upsert failed for chapter ${chapter.id}: ${error.message}`);
  } else {
    const mcqCount = questions.mcq ? questions.mcq.length : 0;
    const saCount = questions.short_answer ? questions.short_answer.length : 0;
    console.log(`  Uploaded ${rows.length} questions (${mcqCount} MCQ + ${saCount} short answer)`);
  }
}

async function main() {
  console.log('Starting biology question generation...\n');

  for (const chapter of CHAPTERS) {
    console.log(`Processing chapter ${chapter.id}/14: ${chapter.name}`);

    let questions = null;
    try {
      questions = await generateQuestionsForChapter(chapter);
    } catch (err) {
      console.error(`  [ERROR] Anthropic API call failed for chapter ${chapter.id}: ${err.message}`);
    }

    if (questions) {
      await uploadQuestions(chapter, questions);
    } else {
      console.log(`  Skipping upload for chapter ${chapter.id} due to earlier error.`);
    }

    if (chapter.id < CHAPTERS.length) {
      console.log('  Waiting 2 seconds before next chapter...');
      await sleep(2000);
    }
  }

  console.log('\nDone! All chapters processed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
