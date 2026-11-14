/**
 * uploadPhysics.js
 *
 * Uploads /tmp/physics_questions.json to Supabase questions table.
 * Maps to schema columns only. MCQ answers formatted as "(x) text — Thus (x) is correct".
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BATCH = 100;

async function run() {
  const raw = JSON.parse(fs.readFileSync('/tmp/physics_questions.json', 'utf8'));
  console.log(`Loaded ${raw.length} questions`);

  // Deduplicate by id — keep last occurrence
  const dedupMap = new Map();
  raw.forEach(q => dedupMap.set(q.id, q));
  const deduped = [...dedupMap.values()];
  console.log(`After dedup: ${deduped.length} unique questions (removed ${raw.length - deduped.length} dupes)`);

  const rows = deduped.map(q => ({
    id:           q.id,
    subject:      'physics',
    chapter_id:   q.chapter_id,
    chapter_name: q.chapter_name,
    question:     q.question,
    answer:       q.answer,
    options:      q.options || {},
    type:         q.type,
    skill:        q.chapter_name,   // default skill = chapter name; tagSkills.js will refine later
    explanation:  null,
  }));

  let inserted = 0, errors = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('questions')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Batch ${i}–${i + BATCH} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    process.stdout.write(`\r  Uploaded: ${Math.min(i + BATCH, rows.length)}/${rows.length}  errors=${errors}`);
  }

  console.log(`\n\nDone. Inserted/updated: ${inserted}, Errors: ${errors}`);

  // Verify count
  const { count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject', 'physics');
  console.log(`Physics questions in DB: ${count}`);
}

run();
