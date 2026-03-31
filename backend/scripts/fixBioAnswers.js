// Fix bad Biology answers in DB — clean OCR garbage and bleed-in questions
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BAD_IDS = [
  'biology_pdf_ch1_218', 'biology_pdf_ch1_225', 'biology_pdf_ch2_151',
  'biology_pdf_ch3_91', 'biology_pdf_ch3_93', 'biology_pdf_ch3_28',
  'biology_pdf_ch4_141', 'biology_pdf_ch4_143', 'biology_pdf_ch4_145',
  'biology_pdf_ch4_148', 'biology_pdf_ch4_149', 'biology_pdf_ch4_185', 'biology_pdf_ch4_213',
  'biology_pdf_ch5_134', 'biology_pdf_ch5_145', 'biology_pdf_ch5_153',
  'biology_pdf_ch5_185', 'biology_pdf_ch5_199', 'biology_pdf_ch5_210',
  'biology_pdf_ch5_215', 'biology_pdf_ch5_217',
  'biology_pdf_ch7_167', 'biology_pdf_ch7_174',
];

async function cleanAnswer(question, rawAnswer) {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are cleaning OCR-extracted biology answer text for a grade 10 ICSE student app.

QUESTION: ${question}

RAW ANSWER (may have OCR garbage, page numbers, or a next question bleeding in at the end):
${rawAnswer}

Your job:
1. Keep only the actual answer to the question above
2. Remove any page numbers like "pAgE 99", "pAgE 105", year numbers like ", 1995"
3. Remove any text that looks like the start of a DIFFERENT question (e.g. "What is...", "Name the...", "Why is...", "______ is the phenomenon...")
4. Fix obvious OCR errors (e.g. "WaooSr" → "Wall", "TurgSr" → "Turgor", "fSooSwing" → "following", "CSrrect" → "Correct")
5. Keep True/False answers intact — "False. [corrected statement]" is the correct format

Return ONLY the cleaned answer text, nothing else. No explanation, no JSON, just the clean answer.`
    }]
  });
  return res.content[0].text.trim();
}

async function main() {
  const { data, error } = await supabase
    .from('questions')
    .select('id, question, answer, type')
    .in('id', BAD_IDS);

  if (error) { console.error(error); process.exit(1); }
  console.log(`Fetched ${data.length} questions to fix\n`);

  let fixed = 0, deleted = 0, skipped = 0;

  for (const q of data) {
    console.log(`\n[${q.id}]`);
    console.log(`  Q: ${q.question.slice(0, 80)}`);
    console.log(`  Raw A: ${q.answer.slice(0, 100)}`);

    // If answer is empty or just a letter — delete
    if (!q.answer || q.answer.trim().length < 5) {
      await supabase.from('questions').delete().eq('id', q.id);
      console.log(`  → DELETED (empty answer)`);
      deleted++;
      continue;
    }

    try {
      const cleaned = await cleanAnswer(q.question, q.answer);
      console.log(`  Clean A: ${cleaned.slice(0, 100)}`);

      if (cleaned.length < 5) {
        await supabase.from('questions').delete().eq('id', q.id);
        console.log(`  → DELETED (cleaned answer too short)`);
        deleted++;
      } else if (cleaned !== q.answer) {
        await supabase.from('questions').update({ answer: cleaned }).eq('id', q.id);
        console.log(`  → UPDATED`);
        fixed++;
      } else {
        console.log(`  → NO CHANGE NEEDED`);
        skipped++;
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Done: ${fixed} fixed, ${deleted} deleted, ${skipped} skipped ===`);
}

main();
