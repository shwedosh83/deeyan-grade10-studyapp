/**
 * Fix OCR spacing artifacts in Chemistry questions & answers using Haiku AI
 * Handles all patterns like "o xide", "carb on", "hydr oxide", etc.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Quick regex pre-screen — only send to AI if text looks like it has OCR splits
function hasOCRSplits(text) {
  if (!text) return false;
  // Pattern: short chunk (1-6 chars), space, short chunk (1-6 chars) that together form a word
  // e.g. "o xide", "carb on", "sulph ate", "hydr oxide"
  return /\b[a-zA-Z]{1,6}\s+[a-zA-Z]{1,5}\b/.test(text) &&
    /\b(?:o\s+xide|carb\s+on|hydr\s+o|sulph\s+|nitr\s+|chlor\s+|ammon\s+|electr\s+|phosph\s+|precip\s+|solut\s+|react\s+|period\s+|valenc\s+|coval\s+|ionic\s+|metal\s+|organ\s+|activ\s+|alk\s+ali|oxid\s+|reduc\s+|neutr\s+|concent\s+|decomp\s+|combust\s+|crystall\s+|saturat\s+|dissol\s+|miscib\s+|immiscib\s+|temper\s+|molecul\s+|empir\s+|stoich\s+|cathod\s+|anod\s+|electrolys\s+|electrolyt\s+|electroplat\s+)/i.test(text);
}

async function fixWithAI(text) {
  if (!text || !hasOCRSplits(text)) return text;

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Fix OCR spacing errors in this chemistry text. Words are sometimes incorrectly split with spaces in the middle, e.g. "o xide" should be "oxide", "carb on" should be "carbon", "hydr oxide" should be "hydroxide", "sulph ate" should be "sulphate", "Alk ali" should be "Alkali", "electr olysis" should be "electrolysis", etc.

ONLY fix OCR word-split errors. Do not change chemical formulas, numbers, punctuation, or correct text.
Return ONLY the fixed text with no explanation.

Text:
${text}`
    }]
  });

  return resp.content[0].text.trim();
}

async function main() {
  console.log('Fetching all chemistry questions...');
  let questions = [];
  let from = 0;
  const PAGE = 500;
  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, answer')
      .eq('subject', 'chemistry')
      .range(from, from + PAGE - 1);
    if (error) { console.error(error); process.exit(1); }
    questions = questions.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${questions.length} questions`);

  // Pre-screen: only process ones with likely OCR splits
  const toFix = questions.filter(q => hasOCRSplits(q.question) || hasOCRSplits(q.answer));
  console.log(`Questions with likely OCR splits: ${toFix.length}`);

  let fixed = 0;
  for (let i = 0; i < toFix.length; i++) {
    const q = toFix[i];
    try {
      const newQ = await fixWithAI(q.question);
      const newA = await fixWithAI(q.answer);

      if (newQ !== q.question || newA !== q.answer) {
        const { error } = await supabase
          .from('questions')
          .update({ question: newQ, answer: newA })
          .eq('id', q.id);
        if (error) console.error(`Error updating ${q.id}:`, error.message);
        else fixed++;
      }
    } catch (err) {
      console.error(`Error on ${q.id}:`, err.message);
    }

    if ((i + 1) % 10 === 0) process.stdout.write(`\rProcessed: ${i+1}/${toFix.length} | Fixed: ${fixed}`);
  }

  console.log(`\n\n✅ Done! Fixed OCR spacing in ${fixed}/${toFix.length} screened questions`);
}

main();
