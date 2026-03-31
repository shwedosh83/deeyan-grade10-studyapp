require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const OCR_GARBAGE = /[^\x20-\x7E\n]|[|}{\\]{2,}|\bfig\b|www\.|\.jpg|\.png/i;
const META_PHRASES = /^(question|answer|example|note|q:|a:)\s*:/i;

function isClean(q) {
  const text = (q.question || '').trim();
  const answer = (q.answer || '').trim();
  const options = q.options || {};

  if (text.length < 15)                return { ok: false, reason: 'question too short' };
  if (/^[a-z]/.test(text))             return { ok: false, reason: 'starts with lowercase' };
  if (/^[^A-Za-z0-9"'([]/.test(text))  return { ok: false, reason: 'starts with punctuation' };
  if (OCR_GARBAGE.test(text))          return { ok: false, reason: 'OCR/garbage in question' };
  if (text.includes('___'))            return { ok: false, reason: 'fill-in-the-blank' };
  if (META_PHRASES.test(text))         return { ok: false, reason: 'meta phrase in question' };

  if (q.type === 'mcq') {
    // Answer should be a valid option key
    if (!/^[a-dA-D]$/.test(answer))
      return { ok: false, reason: 'MCQ answer not a valid key (a/b/c/d)' };
    for (const k of ['a','b','c','d']) {
      const val = options[k];
      if (!val || String(val).trim().length < 2)
        return { ok: false, reason: `MCQ option "${k}" missing/blank` };
    }
    // Check option texts for garbage
    for (const k of ['a','b','c','d']) {
      if (OCR_GARBAGE.test(String(options[k])))
        return { ok: false, reason: `OCR/garbage in option "${k}"` };
    }
  } else {
    // Short/long answer — check answer text
    if (answer.length < 8)             return { ok: false, reason: 'answer too short' };
    if (OCR_GARBAGE.test(answer))      return { ok: false, reason: 'OCR/garbage in answer' };
    if (/^[a-dA-D]$/.test(answer))    return { ok: false, reason: 'answer is just a letter' };
  }

  return { ok: true };
}

async function run() {
  console.log('Fetching AI-generated questions...');
  let all = [], from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('questions').select('id,question,type,answer,options,chapter_name')
      .eq('year_tag','AI Generated').range(from, from + 999);
    if (error) { console.error(error.message); process.exit(1); }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log(`Fetched: ${all.length}`);
  const bad = [], good = [];
  for (const q of all) {
    const { ok, reason } = isClean(q);
    (ok ? good : bad).push({ ...q, reason });
  }

  console.log(`Good: ${good.length} | Bad: ${bad.length}`);
  if (bad.length === 0) { console.log('All clean!'); return; }

  const byReason = {};
  bad.forEach(q => byReason[q.reason] = (byReason[q.reason]||0)+1);
  console.log('\nIssue breakdown:');
  Object.entries(byReason).sort((a,b)=>b[1]-a[1]).forEach(([r,c])=>console.log(`  ${c}x — ${r}`));

  console.log('\nSample bad:');
  bad.slice(0,6).forEach(q=>console.log(`  [${q.type}][${q.chapter_name}] ${q.reason}\n    Q: "${(q.question||'').slice(0,80)}"\n    A: "${(q.answer||'').slice(0,60)}"`));

  const ids = bad.map(q=>q.id);
  console.log(`\nDeleting ${ids.length} bad questions (clearing session_answers first)...`);

  // Delete session_answers references first to avoid FK violations
  for (let i=0; i<ids.length; i+=100) {
    await supabase.from('session_answers').delete().in('question_id', ids.slice(i,i+100));
  }
  // Now delete questions
  let deleted = 0;
  for (let i=0; i<ids.length; i+=100) {
    const { error } = await supabase.from('questions').delete().in('id', ids.slice(i,i+100));
    if (error) console.error('Delete error:', error.message);
    else deleted += Math.min(100, ids.length - i);
  }
  console.log(`Deleted ${deleted}. ${good.length} AI questions remain.`);
}
run();
