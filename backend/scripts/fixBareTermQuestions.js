// Fix questions that are just bare terms with no instruction verb
// e.g. "Osmotic pressure" → "Define and explain osmotic pressure."
// e.g. "Wall pressure and turgor pressure." → "Differentiate between wall pressure and turgor pressure."
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTION_WORDS = /define|explain|state|describe|name|give|write|differentiate|distinguish|compare|why|how|what|draw|list|mention|account|suggest|identify|classify|outline|comment|evaluate|justify|select|choose|tick|match|fill/i;

async function rewriteQuestion(bareQ, chapterName) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `You are an ICSE Grade 10 exam question writer for the chapter "${chapterName}".

The following is a bare term from a past paper (the instruction like "Define:" was on a separate line and got lost):
"${bareQ}"

Rewrite it as a clear, complete exam question. Common formats:
- If it's a single term → "Define [term]." or "Explain [term]."
- If it compares two terms → "Differentiate between [A] and [B]."
- If it's a process → "Explain the process of [X]."

Reply with ONLY the rewritten question, nothing else. Keep it short and direct.`
    }]
  });
  return res.content[0].text.trim();
}

async function main() {
  console.log('Fetching all Biology short/long answer questions...');
  const { data, error } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, question, type')
    .eq('subject', 'biology')
    .in('type', ['short_answer', 'long_answer'])
    .order('chapter_id');

  if (error) { console.error(error); process.exit(1); }

  // Find bare-term questions: no action verb, short, no question mark
  const bare = data.filter(q => {
    const q_text = q.question.trim();
    return (
      !ACTION_WORDS.test(q_text) &&
      q_text.length < 100 &&
      !q_text.endsWith('?')
    );
  });

  console.log(`Found ${bare.length} bare-term questions out of ${data.length} total\n`);

  let fixed = 0;
  for (const q of bare) {
    try {
      const newQ = await rewriteQuestion(q.question, q.chapter_name);
      console.log(`[Ch${q.chapter_id}] ${q.id}`);
      console.log(`  Old: ${q.question.slice(0, 80)}`);
      console.log(`  New: ${newQ}\n`);

      const { error: updateErr } = await supabase
        .from('questions')
        .update({ question: newQ })
        .eq('id', q.id);

      if (updateErr) console.error(`  ERROR: ${updateErr.message}`);
      else fixed++;
    } catch (e) {
      console.error(`Error fixing ${q.id}: ${e.message}`);
    }
  }

  console.log(`\n=== Done: ${fixed}/${bare.length} bare-term questions rewritten ===`);
}

main();
