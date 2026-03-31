// Check Biology short/long answer questions in DB for quality issues
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Fetching Biology short/long answer questions from DB...\n');

  const { data, error } = await supabase
    .from('questions')
    .select('id, chapter_id, chapter_name, type, question, answer, skill')
    .eq('subject', 'biology')
    .in('type', ['short_answer', 'long_answer'])
    .order('chapter_id');

  if (error) { console.error(error); process.exit(1); }
  console.log(`Total short/long answer questions: ${data.length}\n`);

  const issues = [];

  for (const q of data) {
    const flags = [];
    const ans = (q.answer || '').trim();
    const ques = (q.question || '').trim();

    // Answer contains a question mark (answer IS a question)
    if (ans.endsWith('?')) flags.push('answer_is_question');

    // Answer is identical or nearly identical to the question
    if (ans.toLowerCase() === ques.toLowerCase()) flags.push('answer_equals_question');

    // Answer is too short (less than 5 chars — essentially empty)
    if (ans.length < 5) flags.push('answer_too_short');

    // Answer starts with "Q:" or "Question:" — copied wrong field
    if (/^(q:|question:|q\.)/i.test(ans)) flags.push('answer_has_q_prefix');

    // Answer contains the question text verbatim (first 30 chars)
    if (ans.includes(ques.slice(0, 30)) && ques.length > 30) flags.push('answer_contains_question');

    // Answer is suspiciously short for a long_answer type
    if (q.type === 'long_answer' && ans.split(' ').length < 10) flags.push('long_answer_too_brief');

    if (flags.length > 0) {
      issues.push({ id: q.id, chapter: q.chapter_name, type: q.type, flags, question: ques.slice(0, 100), answer: ans.slice(0, 150) });
    }
  }

  console.log(`=== Issues found: ${issues.length} / ${data.length} ===\n`);

  // Group by flag type
  const byFlag = {};
  for (const i of issues) {
    for (const f of i.flags) {
      byFlag[f] = (byFlag[f] || 0) + 1;
    }
  }
  console.log('--- By issue type ---');
  Object.entries(byFlag).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  console.log('\n--- Sample bad questions (first 30) ---');
  issues.slice(0, 30).forEach((q, i) => {
    console.log(`\n[${i+1}] ID: ${q.id} | Chapter: ${q.chapter} | Type: ${q.type}`);
    console.log(`  Flags: ${q.flags.join(', ')}`);
    console.log(`  Q: "${q.question}"`);
    console.log(`  A: "${q.answer}"`);
  });

  // Print all IDs with issues for bulk delete/fix
  if (issues.length > 0) {
    console.log(`\n--- All bad IDs (${issues.length}) ---`);
    console.log(issues.map(i => i.id).join(', '));
  }
}

main();
