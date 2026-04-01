// Upload parsed chemistry questions to Supabase, then run full audit
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const JSON_PATH = '/tmp/chemistry_questions.json';
const BATCH_SIZE = 50;

// ─── Upload ────────────────────────────────────────────────────────────────────

async function upload() {
  const questions = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`Uploading ${questions.length} chemistry questions...`);

  // Clear existing chemistry questions first
  const { error: delErr } = await supabase.from('questions').delete().eq('subject', 'chemistry');
  if (delErr) console.error('Delete error:', delErr.message);
  else console.log('Cleared existing chemistry questions');

  // Fix NOT NULL constraints
  questions.forEach(q => {
    if (!q.skill) q.skill = DEFAULT_SKILL_BY_CHAPTER[q.chapter_id] || 'Chemistry';
    if (q.options === null || q.options === undefined) q.options = {};
  });

  let uploaded = 0;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('questions').insert(batch);
    if (error) {
      console.error(`Batch ${i}-${i+BATCH_SIZE} error:`, error.message);
    } else {
      uploaded += batch.length;
      process.stdout.write(`\rUploaded: ${uploaded}/${questions.length}`);
    }
  }
  console.log(`\nUpload complete: ${uploaded}/${questions.length}`);
  return uploaded;
}

// ─── Audit & Fix ──────────────────────────────────────────────────────────────

async function checkRelevance(question, answer) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Does this answer actually answer this question? Reply YES or NO only.\nQ: ${question.slice(0, 200)}\nA: ${answer.slice(0, 200)}`
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
      content: `You are an ICSE Chemistry teacher for grade 10. Write a clear, accurate model answer for this question from the chapter "${chapterName}".

Question: ${question}

Write only the answer, 1-3 sentences, factually correct, no fluff. Include chemical equations where relevant.`
    }]
  });
  return res.content[0].text.trim();
}

async function audit() {
  console.log('\n=== Starting audit of chemistry short/long answers ===');

  const { data, error } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, type, question, answer')
    .eq('subject', 'chemistry')
    .in('type', ['short_answer', 'long_answer'])
    .order('chapter_id');

  if (error) { console.error(error); return; }
  console.log(`Auditing ${data.length} short/long answer questions...\n`);

  const bad = [];
  const AUDIT_BATCH = 10;

  for (let i = 0; i < data.length; i += AUDIT_BATCH) {
    const batch = data.slice(i, i + AUDIT_BATCH);
    const results = await Promise.all(batch.map(async (q) => {
      const ok = await checkRelevance(q.question, q.answer);
      return { ...q, ok };
    }));
    for (const r of results) {
      if (!r.ok) {
        bad.push(r);
        console.log(`[BAD] ${r.id} | Ch${r.chapter_id}`);
        console.log(`  Q: ${r.question.slice(0, 80)}`);
        console.log(`  A: ${r.answer.slice(0, 80)}\n`);
      }
    }
    process.stdout.write(`\rAudited: ${Math.min(i + AUDIT_BATCH, data.length)}/${data.length} | Bad: ${bad.length}`);
  }

  console.log(`\n\n=== Audit complete: ${bad.length} bad answers found ===`);

  if (bad.length === 0) {
    console.log('All answers look correct!');
    return;
  }

  // Fix bad answers
  console.log('\nFixing bad answers...\n');
  let fixed = 0;
  for (const q of bad) {
    try {
      const newAnswer = await generateCorrectAnswer(q.question, q.chapter_name);
      console.log(`Fixing: ${q.id}`);
      console.log(`  Old: ${q.answer.slice(0, 70)}`);
      console.log(`  New: ${newAnswer.slice(0, 70)}\n`);
      const { error: updateErr } = await supabase.from('questions').update({ answer: newAnswer }).eq('id', q.id);
      if (updateErr) console.error(`  ERROR: ${updateErr.message}`);
      else fixed++;
    } catch (e) {
      console.error(`Error fixing ${q.id}: ${e.message}`);
    }
  }
  console.log(`\n=== Fixed: ${fixed}/${bad.length} answers ===`);
}

// ─── Also fix bare-term questions ─────────────────────────────────────────────

async function fixBareTerms() {
  console.log('\n=== Fixing bare-term questions ===');
  const ACTION_WORDS = /define|explain|state|describe|name|give|write|differentiate|distinguish|compare|why|how|what|draw|list|mention|account|suggest|identify|classify|calculate|balance|complete|fill/i;

  const { data } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, question, type')
    .eq('subject', 'chemistry')
    .in('type', ['short_answer', 'long_answer']);

  const bare = data.filter(q =>
    !ACTION_WORDS.test(q.question) &&
    q.question.trim().length < 100 &&
    !q.question.endsWith('?')
  );

  console.log(`Found ${bare.length} bare-term questions`);
  let fixed = 0;

  for (const q of bare) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `You are an ICSE Grade 10 Chemistry exam question writer for the chapter "${q.chapter_name}".

The following is a bare term from a past paper (the instruction like "Define:" was on a separate line and got lost):
"${q.question}"

Rewrite it as a clear, complete exam question. Reply with ONLY the rewritten question.`
        }]
      });
      const newQ = res.content[0].text.trim();
      console.log(`  [${q.id}] "${q.question}" → "${newQ}"`);
      await supabase.from('questions').update({ question: newQ }).eq('id', q.id);
      fixed++;
    } catch (e) {
      console.error(`Error: ${e.message}`);
    }
  }
  console.log(`Fixed ${fixed}/${bare.length} bare-term questions`);
}

// ─── Tag skills ───────────────────────────────────────────────────────────────

const DEFAULT_SKILL_BY_CHAPTER = {
  201: 'Periodic Table & Properties',
  202: 'Chemical Bonding',
  203: 'Acids, Bases & Salts',
  204: 'Analytical Chemistry',
  205: 'Mole Concept & Stoichiometry',
  206: 'Electrolysis',
  207: 'Metallurgy',
  208: 'Study of Compounds',
  209: 'Study of Compounds',
  210: 'Study of Compounds',
  211: 'Study of Compounds',
  212: 'Organic Chemistry',
};

const CHEMISTRY_SKILLS = [
  'Periodic Table & Properties',
  'Chemical Bonding',
  'Acids, Bases & Salts',
  'Analytical Chemistry',
  'Mole Concept & Stoichiometry',
  'Electrolysis',
  'Metallurgy',
  'Study of Compounds',
  'Organic Chemistry',
  'Diagrams & Experiments',
];

async function tagSkills() {
  console.log('\n=== Tagging skills ===');
  const { data } = await supabase.from('questions').select('id, question, answer').eq('subject', 'chemistry');
  console.log(`Tagging ${data.length} questions...`);

  const BATCH = 15;
  let tagged = 0;

  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (q) => {
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{
          role: 'user',
          content: `Classify this ICSE grade 10 Chemistry exam question into exactly one skill. Reply with ONLY the skill name.

Skills: ${CHEMISTRY_SKILLS.join(' | ')}

Question: ${q.question.slice(0, 200)}
Answer: ${q.answer ? q.answer.slice(0, 100) : ''}`
        }]
      });
      const skill = res.content[0].text.trim();
      const matched = CHEMISTRY_SKILLS.find(s => skill.toLowerCase().includes(s.toLowerCase().split(' ')[0])) || skill;
      return { id: q.id, skill: matched };
    }));

    await Promise.all(results.map(r =>
      supabase.from('questions').update({ skill: r.skill }).eq('id', r.id)
    ));

    tagged += batch.length;
    process.stdout.write(`\rTagged: ${Math.min(tagged, data.length)}/${data.length}`);
  }
  console.log(`\nSkill tagging complete`);
}

// ─── Run pipeline ─────────────────────────────────────────────────────────────

async function main() {
  await upload();
  await audit();
  await fixBareTerms();
  await tagSkills();
  console.log('\n\n✅ Chemistry pipeline complete!');
}

main().catch(console.error);
