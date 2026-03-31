require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function go() {
  console.log('Generating The Cell questions...');
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
    messages: [{
      role: 'user',
      content: `Generate grade 10 biology questions on "The Cell". Cover: nucleus, mitochondria, chloroplast, ER, Golgi apparatus, ribosomes, vacuoles, lysosomes, cell membrane, cell wall, plant vs animal cells, prokaryotic vs eukaryotic cells, cell theory.

Generate exactly 20 MCQ and 15 short answer questions.
Rules: questions start with capital letter, MCQ options are complete phrases, short answers are 1-3 full sentences, no fill-in-the-blank.

Return ONLY valid JSON (no markdown fences):
{"mcq":[{"question":"","options":{"a":"","b":"","c":"","d":""},"answer":"a","explanation":""}],"short_answer":[{"question":"","answer":"","explanation":""}]}`
    }]
  });

  const text = msg.content[0].text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(text);
  const ts = Date.now();
  const rows = [];

  (parsed.mcq || []).forEach((q, i) => rows.push({
    id: `ai_ch15_mcq_${i}_${ts}`, subject: 'biology', chapter_id: 15,
    chapter_name: 'The Cell', skill: 'The Cell', type: 'mcq',
    year_tag: 'AI Generated', question: q.question, options: q.options,
    answer: q.answer, explanation: q.explanation || ''
  }));

  (parsed.short_answer || []).forEach((q, i) => rows.push({
    id: `ai_ch15_sa_${i}_${ts}`, subject: 'biology', chapter_id: 15,
    chapter_name: 'The Cell', skill: 'The Cell', type: 'short_answer',
    year_tag: 'AI Generated', question: q.question, options: {},
    answer: q.answer, explanation: q.explanation || ''
  }));

  console.log(`MCQ: ${rows.filter(r => r.type==='mcq').length}, SA: ${rows.filter(r => r.type==='short_answer').length}`);
  const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) { console.error('Upload error:', error.message); return; }
  console.log(`Uploaded ${rows.length} questions for "The Cell"`);
}

go().catch(console.error);
