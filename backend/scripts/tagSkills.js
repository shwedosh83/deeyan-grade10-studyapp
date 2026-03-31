// Tag all questions with proper skill sub-topics using Claude Haiku
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── SKILL TAXONOMY ────────────────────────────────────────────────────────────

const BIOLOGY_SKILLS = [
  'Cell Biology',
  'Genetics & Heredity',
  'Plant Physiology',
  'Human Physiology',
  'Nervous System & Coordination',
  'Reproduction',
  'Ecology & Environment',
  'Diagrams & Experiments',
];

const HC_SKILLS = [
  'Indian Freedom Struggle',
  'Gandhi & Mass Movements',
  'Independence & Partition',
  'World Wars & Fascism',
  'International Organisations',
  'Indian Constitution',
  'Executive & Parliament',
  'Judiciary',
];

// ── CLASSIFIER ────────────────────────────────────────────────────────────────

async function classifyQuestion(question, answer, subject) {
  const skills = subject === 'biology' ? BIOLOGY_SKILLS : HC_SKILLS;

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 20,
    messages: [{
      role: 'user',
      content: `Classify this ICSE grade 10 ${subject === 'biology' ? 'Biology' : 'History & Civics'} exam question into exactly one skill. Reply with ONLY the skill name, nothing else.

Skills: ${skills.join(' | ')}

Question: ${question.slice(0, 200)}
Answer: ${answer.slice(0, 100)}`
    }]
  });

  const skill = res.content[0].text.trim();
  // Validate — return closest match or first skill
  return skills.find(s => skill.toLowerCase().includes(s.toLowerCase().split(' ')[0])) || skill;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const subjects = ['biology', 'history_civics'];

  for (const subject of subjects) {
    console.log(`\n=== Processing ${subject} ===`);
    const { data, error } = await supabase
      .from('questions')
      .select('id, chapter_id, question, answer')
      .eq('subject', subject)
      .order('chapter_id');

    if (error) { console.error(error); continue; }
    console.log(`Total: ${data.length} questions`);

    const BATCH = 15;
    let updated = 0;

    for (let i = 0; i < data.length; i += BATCH) {
      const batch = data.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (q) => {
        const skill = await classifyQuestion(q.question, q.answer, subject);
        return { id: q.id, skill };
      }));

      // Bulk update
      await Promise.all(results.map(r =>
        r.skill
          ? supabase.from('questions').update({ skill: r.skill }).eq('id', r.id)
          : Promise.resolve()
      ));

      updated += results.filter(r => r.skill).length;
      process.stdout.write(`\r  ${subject}: ${Math.min(i + BATCH, data.length)}/${data.length} | Updated: ${updated}`);
    }
    console.log(`\n  Done: ${updated}/${data.length} tagged`);
  }

  console.log('\n\n=== All skills tagged ===');
}

main().catch(console.error);
