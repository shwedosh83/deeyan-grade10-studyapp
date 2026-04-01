// Fix Chemistry questions that are bare reaction descriptions with no action verb
// e.g. "Silver nitrate solution and sodium chloride solution."
// → "Write a balanced chemical equation and state your observation when silver nitrate solution is mixed with sodium chloride solution."
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTION_WORDS = /\b(define|explain|state|describe|name|give|write|differentiate|distinguish|compare|why|how|what|draw|list|mention|account|suggest|identify|classify|outline|comment|evaluate|justify|select|choose|tick|match|fill|calculate|determine|find|show|prove|deduce|predict|complete|balance|convert|derive|construct)\b/i;

async function rewriteQuestion(bareQ, chapterName) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: `You are an ICSE Grade 10 Chemistry exam question writer for the chapter "${chapterName}".

The following text appears to be a reaction description with no instruction (the instruction line was lost during PDF extraction):
"${bareQ}"

Rewrite it as a clear, complete exam question. Use the most appropriate format:
- If it describes two reacting chemicals → "Write a balanced chemical equation and state your observation when [A] is mixed/reacted with [B]."
- If it describes a single chemical process → "Write the equation for the reaction of [X]."
- If it describes a heating/physical action → "Write the equation when [X] is heated / treated with [Y]."
- If it has fill-in-the-blank or multiple choice options already embedded → keep the format but add "Choose the correct option:" or "Fill in the blank:"

Reply with ONLY the rewritten question. Keep it concise.`
    }]
  });
  return res.content[0].text.trim();
}

async function main() {
  console.log('Fetching all Chemistry short/long answer questions...');
  const { data, error } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, question, type')
    .eq('subject', 'chemistry')
    .in('type', ['short_answer', 'long_answer'])
    .order('chapter_id');

  if (error) { console.error(error); process.exit(1); }

  // Find bare reaction questions: no action verb
  const bare = data.filter(q => {
    const text = q.question.trim();
    // Remove leading question number if present (e.g. "221. ")
    const stripped = text.replace(/^\d+\.\s*/, '');
    return !ACTION_WORDS.test(stripped);
  });

  console.log(`Found ${bare.length} bare-instruction questions out of ${data.length} total\n`);

  let fixed = 0;
  for (const q of bare) {
    try {
      const newQ = await rewriteQuestion(q.question, q.chapter_name);
      console.log(`[Ch${q.chapter_id}] ${q.id}`);
      console.log(`  Old: ${q.question.slice(0, 100)}`);
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

  console.log(`\n=== Done: ${fixed}/${bare.length} bare-reaction questions rewritten ===`);
}

main();
