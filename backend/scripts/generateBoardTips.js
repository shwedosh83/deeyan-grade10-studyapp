/**
 * generateBoardTips.js
 *
 * Generates ICSE board-specific examiner tips for every question in the DB.
 * Stored in questions.board_tips column.
 *
 * Tips cover:
 *  - Common mistakes students make on this exact topic
 *  - What ICSE examiners expect / marking scheme insight
 *  - How much detail for 2-mark vs 4-mark answers
 *  - Board-specific tricks (commonly tested, commonly confused)
 *
 * Skips questions that already have board_tips.
 * Run with: node scripts/generateBoardTips.js [subject]
 *   e.g. node scripts/generateBoardTips.js geography
 *   or   node scripts/generateBoardTips.js all
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CONCURRENCY = 12;
const BATCH_SIZE  = 1000;  // Supabase page size

const SUBJECT_CONTEXT = {
  biology:             'ICSE Grade 10 Biology (Life Processes, Genetics, Ecology)',
  history_civics:      'ICSE Grade 10 History & Civics (Indian Freedom Struggle, Civics institutions)',
  chemistry:           'ICSE Grade 10 Chemistry (Periodic Table, Acids/Bases, Organic Chemistry)',
  geography:           'ICSE Grade 10 Geography (Indian Physical Features, Climate, Resources, Industries)',
  physics:             'ICSE Grade 10 Physics (Mechanics, Light, Sound, Electricity, Magnetism)',
  english_literature:  'ICSE Grade 10 English Literature (Julius Caesar, Short Stories, Poems from Treasure Chest)',
};

const MARK_GUIDE = {
  mcq:          '1-mark MCQ',
  short_answer: '2-mark short answer',
  long_answer:  '4-mark long answer',
};

async function generateTips(q) {
  const subjectCtx = SUBJECT_CONTEXT[q.subject] || `ICSE Grade 10 ${q.subject}`;
  const markCtx    = MARK_GUIDE[q.type] || '2-mark';

  const prompt = `You are an experienced ICSE examiner for ${subjectCtx}.

Question (${markCtx}): ${q.question.slice(0, 250)}
Model Answer: ${q.answer.slice(0, 350)}

Write exactly 3 bullet points of ICSE board examiner tips for this specific question. Cover:
• A common mistake students make that costs marks on THIS question
• What the examiner's marking scheme expects (key terms or points that must appear)
• How much detail is needed — ${q.type === 'long_answer' ? 'for 4 marks, name the specific points required' : q.type === 'mcq' ? 'explain the trap option students fall for' : 'for 2 marks, what is the minimum acceptable answer'}

Rules:
- Be specific to THIS question, not generic advice
- Use plain bullet points starting with •
- Max 70 words total
- No intro line, just the 3 bullets`;

  const res = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages:   [{ role: 'user', content: prompt }],
  });

  return res.content[0].text.trim();
}

async function processSubject(subject) {
  console.log(`\n── ${subject.toUpperCase()} ──`);

  // Fetch all questions without board_tips
  let allQ = [];
  let from  = 0;

  while (true) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, subject, question, answer, type, chapter_name')
      .eq('subject', subject)
      .is('board_tips', null)
      .range(from, from + BATCH_SIZE - 1);

    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    allQ = allQ.concat(data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  if (allQ.length === 0) {
    console.log(`  All ${subject} questions already have tips — skipping.`);
    return;
  }

  console.log(`  Generating tips for ${allQ.length} questions...`);
  let done = 0, errors = 0;

  for (let i = 0; i < allQ.length; i += CONCURRENCY) {
    const batch = allQ.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async q => {
      try {
        const tips = await generateTips(q);
        const { error: upErr } = await supabase
          .from('questions')
          .update({ board_tips: tips })
          .eq('id', q.id);
        if (upErr) errors++;
        else done++;
      } catch {
        errors++;
      }
    }));

    process.stdout.write(
      `\r  ${subject}: ${Math.min(i + CONCURRENCY, allQ.length)}/${allQ.length}` +
      `  done=${done}  errors=${errors}`
    );
  }

  console.log(`\n  ✓ ${subject} complete. Generated: ${done}, Errors: ${errors}`);
}

async function run() {
  const arg = process.argv[2] || 'all';
  const targets = arg === 'all'
    ? ['biology', 'history_civics', 'chemistry', 'geography']
    : [arg];

  console.log(`Generating ICSE board tips for: ${targets.join(', ')}`);
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  for (const subject of targets) {
    await processSubject(subject);
  }

  // Final counts
  console.log('\n── Final counts ──');
  for (const subject of targets) {
    const { count } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('subject', subject)
      .not('board_tips', 'is', null);
    console.log(`  ${subject}: ${count} with tips`);
  }
}

run();
