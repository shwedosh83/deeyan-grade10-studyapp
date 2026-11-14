/**
 * generateEnglishLit.js
 *
 * Generates ICSE Grade 10 English Literature questions and uploads them to Supabase.
 *
 * Chapters:
 *   Julius Caesar — Act III  (id: 401)
 *   Julius Caesar — Act IV   (id: 402)
 *   Julius Caesar — Act V    (id: 403)
 *   Short Story: A Face in the Dark — Ruskin Bond              (id: 404)
 *   Short Story: Hearts and Hands — O. Henry                   (id: 405)
 *   Short Story: A Horse and Two Goats — R.K. Narayan          (id: 406)
 *   Short Story: The Gold Cadillac — Mildred D. Taylor         (id: 407)
 *   Short Story: The Blue Bead — Norah Burke                   (id: 408)
 *   Poem: The Patriot — Robert Browning                        (id: 409)
 *   Poem: If — Rudyard Kipling                                 (id: 410)
 *   Poem: Ozymandias — Percy Bysshe Shelley                    (id: 411)
 *   Poem: The Seven Ages — William Shakespeare                 (id: 412)
 *   Poem: Abu Ben Adhem — Leigh Hunt                           (id: 413)
 *
 * Run: node scripts/generateEnglishLit.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUBJECT = 'english_literature';

const CHAPTERS = [
  {
    id: 401,
    name: 'Julius Caesar — Act III',
    type: 'drama',
    context: `Act III covers: Caesar's assassination on the Ides of March, Brutus's speech to the crowd justifying the assassination, Mark Antony's famous funeral oration ("Friends, Romans, countrymen..."), the mob turning against the conspirators, Antony's soliloquy over Caesar's body, the arrival of Octavius. Key themes: manipulation vs honour, the power of rhetoric, loyalty and betrayal.`,
  },
  {
    id: 402,
    name: 'Julius Caesar — Act IV',
    type: 'drama',
    context: `Act IV covers: The Second Triumvirate (Antony, Octavius, Lepidus) drawing up proscription lists, the quarrel between Brutus and Cassius in the tent, Portia's death, Cassius apologising and reconciling, military planning for the battle of Philippi, the ghost of Caesar appearing to Brutus. Key themes: deteriorating friendship, guilt, consequences of conspiracy.`,
  },
  {
    id: 403,
    name: 'Julius Caesar — Act V',
    type: 'drama',
    context: `Act V covers: The battle of Philippi, Cassius's death by his own sword (after mistaking events), Titinius's death, Brutus's final stand, Brutus dying on his sword ("Caesar, now be still"), Antony's tribute to Brutus as "the noblest Roman of them all." Key themes: fate vs free will, honour in death, the tragic downfall of Brutus.`,
  },
  {
    id: 404,
    name: 'Short Story: A Face in the Dark — Ruskin Bond',
    type: 'short_story',
    context: `A supernatural story set in Simla hills. Mr. Oliver, an English teacher at a boys' school, encounters a boy crying on a dark forest path. When he shines his torch, the boy has no face. He runs to a nearby watchman, who also has no face. Key themes: the supernatural, isolation, fear of the unknown. The story is notable for its twist ending and atmosphere.`,
  },
  {
    id: 405,
    name: 'Short Story: Hearts and Hands — O. Henry',
    type: 'short_story',
    context: `A short story set on a train. Miss Fairchild, a beautiful and fashionable young woman, encounters her old acquaintance Mr. Easton who appears to be handcuffed to a rough-looking man. Easton claims to be a marshal transporting a prisoner. In a twist, the rough man is actually the marshal and Easton is the prisoner — he lied to protect Miss Fairchild from embarrassment. Key themes: sacrifice, pride, appearance vs reality, chivalry.`,
  },
  {
    id: 406,
    name: 'Short Story: A Horse and Two Goats — R.K. Narayan',
    type: 'short_story',
    context: `Set in the fictional village of Kritam, India. Muni, a poor old man who tends two scrawny goats, meets an American tourist. They cannot understand each other's language but carry on a long "conversation." The tourist buys the large clay horse statue near which Muni sits, thinking he has bought Muni's property. Muni takes the money thinking he has sold his goats. Key themes: miscommunication, cultural differences, poverty, comic irony.`,
  },
  {
    id: 407,
    name: 'Short Story: The Gold Cadillac — Mildred D. Taylor',
    type: 'short_story',
    context: `Set in 1950s America. Wilbert buys a gold Cadillac, but his wife Dee is upset that he spent savings meant for a house. He decides to drive the family to Mississippi to visit grandparents. The journey reveals racial segregation and danger — they are stopped by police, the car is searched, and the family fears for their safety. Key themes: racial discrimination, family unity, materialism vs safety, the American dream's limits.`,
  },
  {
    id: 408,
    name: 'Short Story: The Blue Bead — Norah Burke',
    type: 'short_story',
    context: `Set on the banks of a river in rural India. Sibia, a young girl, accompanies her mother to cut grass. At the river crossing, a woman is about to be attacked by a mugger crocodile. Sibia, though terrified, distracts the crocodile with a blow from her sickle, saving the woman. While the woman is saved, Sibia's only discovery of a blue glass bead seems a small reward. Key themes: courage, selflessness, the ordinary heroism of children, poverty, nature's danger.`,
  },
  {
    id: 409,
    name: 'Poem: The Patriot — Robert Browning',
    type: 'poem',
    context: `A dramatic monologue by Robert Browning. The speaker was once welcomed as a triumphant hero with roses and cheers ("It was roses, roses, all the way"). A year later, he is led to his execution, scorned by the same crowd. He reflects that God will reward him in heaven even though men have failed him. Key themes: ingratitude, the fickle nature of public opinion, martyrdom, divine justice vs human judgment. Figures of speech: anaphora, irony, alliteration.`,
  },
  {
    id: 410,
    name: 'Poem: If — Rudyard Kipling',
    type: 'poem',
    context: `A didactic poem by Rudyard Kipling addressed to his son. The poem outlines the qualities of an ideal man: keeping calm in adversity, maintaining honesty, not being swayed by praise or hate, persevering, and not being too proud. The final couplet: "you'll be a Man, my son!" Key themes: ideal manhood, perseverance, self-control, humility, moral strength. Structure: 4 stanzas, conditional "If" clauses building throughout. Figures of speech: anaphora, personification, metaphor.`,
  },
  {
    id: 411,
    name: 'Poem: Ozymandias — Percy Bysshe Shelley',
    type: 'poem',
    context: `A sonnet by Percy Bysshe Shelley. A traveller describes a ruined statue in the desert: only two legs remain, and a shattered face lies in the sand. The pedestal reads "My name is Ozymandias, King of Kings; Look on my Works, ye Mighty, and despair!" But around the statue is only vast, empty desert. Key themes: the transience of power, the futility of pride, the inevitable decay of all human achievement, irony. The poem is a reflection on how all empires fall.`,
  },
  {
    id: 412,
    name: 'Poem: The Seven Ages — William Shakespeare',
    type: 'poem',
    context: `An extract from "As You Like It" (Act II, Scene 7), spoken by Jaques. He compares the world to a stage and human life to a play with seven acts/ages: infant, schoolboy, lover, soldier, justice (middle-aged man), old man, and final dotage ("second childishness"). Key themes: the brevity and futility of life, the cycle of human existence, theatricality of life. Extended metaphor of life as theatre. Notable for its pessimistic but truthful observation.`,
  },
  {
    id: 413,
    name: 'Poem: Abu Ben Adhem — Leigh Hunt',
    type: 'poem',
    context: `A short lyric poem. Abu Ben Adhem wakes from a "deep dream of peace" to find an angel writing in a golden book. He asks if his name is among those who love God; the angel says no. He asks to be recorded as one who loves his fellow men. Next night the angel returns with the names of those God had blessed — Abu Ben Adhem's name leads all the rest. Key themes: the supremacy of love for humanity over religious piety, service to fellow man is the highest form of worship. Tone: peaceful, spiritual, affirming.`,
  },
];

// ── Question templates per chapter type ──────────────────────────────────────

function buildPrompt(chapter) {
  if (chapter.type === 'drama') {
    return `You are an expert ICSE Grade 10 English Literature teacher.

Generate ICSE-style examination questions for: "${chapter.name}"

Context: ${chapter.context}

Generate exactly:
- 8 MCQ questions (comprehension, plot, character, theme — 4 options a/b/c/d; use key "answer" for the correct option letter)
- 10 short answer questions (2–4 mark answers, 3–5 sentences each; include quote-based, character, theme, language effect questions)
- 4 long answer questions (6–8 mark essays; character analysis, theme analysis, scene analysis; model answers 80–120 words)

ICSE-style rules:
- MCQ: comprehension-based, test understanding of text not trivia
- Short answer: questions like "How does Antony use rhetoric to sway the crowd?", "What does X reveal about character Y?", "Explain the significance of the quote '...'", "What is the dramatic effect of...?"
- Long answer: "Justify with evidence from the text", "Analyse the character of...", "How does Shakespeare present the theme of...?"

Respond ONLY with valid JSON (no markdown fences). Use key "answer" (not "correct") for MCQ correct option. Exact structure:
{
  "mcq": [{"question": "...", "options": {"a": "...", "b": "...", "c": "...", "d": "..."}, "answer": "a", "explanation": "..."}],
  "short_answer": [{"question": "...", "answer": "..."}],
  "long_answer": [{"question": "...", "answer": "..."}]
}`;
  }

  if (chapter.type === 'short_story') {
    return `You are an expert ICSE Grade 10 English Literature teacher.

Generate ICSE-style examination questions for: "${chapter.name}"

Context: ${chapter.context}

Generate exactly:
- 8 MCQ questions (plot, character, theme, irony — 4 options a/b/c/d)
- 8 short answer questions (2–4 mark answers; character, theme, irony, author technique questions)
- 3 long answer questions (character sketch, theme analysis — model answers 80–100 words)

ICSE-style rules:
- MCQ: test understanding of events, character motivation, irony, theme
- Short answer: "What does the title suggest?", "How does the author create atmosphere?", "What does X's action reveal about their character?", "Identify and explain the irony in..."
- Long answer: "Write a character sketch of...", "Analyse the theme of... with examples", "How does the setting contribute to the story's effect?"

Respond ONLY with valid JSON (no markdown fences). Use key "answer" (not "correct") for MCQ. Exact structure:
{"mcq": [{"question":"...","options":{"a":"...","b":"...","c":"...","d":"..."},"answer":"a","explanation":"..."}], "short_answer": [{"question":"...","answer":"..."}], "long_answer": [{"question":"...","answer":"..."}]}`;
  }

  // poem
  return `You are an expert ICSE Grade 10 English Literature teacher.

Generate ICSE-style examination questions for: "${chapter.name}"

Context: ${chapter.context}

Generate exactly:
- 8 MCQ questions (comprehension, figures of speech, theme, mood — 4 options a/b/c/d)
- 8 short answer questions (2–4 mark answers; line explanation, figure of speech, theme, mood)
- 3 long answer questions (theme analysis, poetic devices appreciation — model answers 80–120 words)

ICSE-style rules:
- MCQ: test understanding of specific lines, figures of speech, mood
- Short answer: "Explain '...'", "Identify the figure of speech in '...'", "What is the mood?", "What does the poet mean by '...'?"
- Long answer: "What is the central theme? How is it developed?", "Write a critical appreciation"

Respond ONLY with valid JSON (no markdown fences). Use key "answer" (not "correct") for MCQ. Exact structure:
{"mcq": [{"question":"...","options":{"a":"...","b":"...","c":"...","d":"..."},"answer":"a","explanation":"..."}], "short_answer": [{"question":"...","answer":"..."}], "long_answer": [{"question":"...","answer":"..."}]}`;
}

// ── Generate + upload for one chapter ─────────────────────────────────────────

async function processChapter(chapter) {
  console.log(`\n📖 Generating: ${chapter.name}`);

  const prompt = buildPrompt(chapter);
  let parsed;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    let raw = res.content[0].text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`  ✗ Generation/parse failed: ${err.message}`);
    return;
  }

  const rows = [];
  const ts = Date.now();

  // MCQ — handle both "answer" and "correct" key names from different models
  for (const [i, q] of (parsed.mcq || []).entries()) {
    const rawAnswer = q.answer ?? q.correct;
    if (!q.question || !q.options || !rawAnswer) continue;
    rows.push({
      id: `el_ch${chapter.id}_mcq_${i + 1}_${ts}`,
      subject: SUBJECT,
      chapter_id: chapter.id,
      chapter_name: chapter.name,
      question: q.question,
      options: q.options,
      answer: String(rawAnswer).toLowerCase().trim().charAt(0), // ensure single letter
      explanation: q.explanation || null,
      type: 'mcq',
      skill: chapter.name,
      year_tag: 'AI Generated',
    });
  }

  // Short answer
  for (const [i, q] of (parsed.short_answer || []).entries()) {
    if (!q.question || !q.answer) continue;
    rows.push({
      id: `el_ch${chapter.id}_sa_${i + 1}_${ts}`,
      subject: SUBJECT,
      chapter_id: chapter.id,
      chapter_name: chapter.name,
      question: q.question,
      options: {},
      answer: q.answer,
      explanation: null,
      type: 'short_answer',
      skill: chapter.name,
      year_tag: 'AI Generated',
    });
  }

  // Long answer
  for (const [i, q] of (parsed.long_answer || []).entries()) {
    if (!q.question || !q.answer) continue;
    rows.push({
      id: `el_ch${chapter.id}_la_${i + 1}_${ts}`,
      subject: SUBJECT,
      chapter_id: chapter.id,
      chapter_name: chapter.name,
      question: q.question,
      options: {},
      answer: q.answer,
      explanation: null,
      type: 'long_answer',
      skill: chapter.name,
      year_tag: 'AI Generated',
    });
  }

  console.log(`  Generated: ${(parsed.mcq||[]).length} MCQ, ${(parsed.short_answer||[]).length} SA, ${(parsed.long_answer||[]).length} LA`);

  if (rows.length === 0) {
    console.error('  ✗ No rows to insert');
    return;
  }

  const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.error('  ✗ DB upsert failed:', error.message);
  } else {
    console.log(`  ✓ Inserted ${rows.length} questions`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Check which chapters already have questions
  const { data: existing } = await supabase
    .from('questions')
    .select('chapter_id')
    .eq('subject', SUBJECT);

  const done = new Set((existing || []).map(r => r.chapter_id));
  const todo = CHAPTERS.filter(c => !done.has(c.id));

  if (todo.length === 0) {
    console.log('✅ All English Literature chapters already generated!');
    return;
  }

  console.log(`🚀 Generating ${todo.length} chapters (${done.size} already done)...`);

  for (const chapter of todo) {
    await processChapter(chapter);
    // Small delay between chapters to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n✅ English Literature generation complete!');

  // Summary
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('subject', SUBJECT);
  console.log(`Total English Literature questions in DB: ${count}`);
}

main().catch(console.error);
