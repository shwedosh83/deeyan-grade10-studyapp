// Generate questions for "The Cell" chapter (missing from question bank)
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHAPTER = { id: 0, name: 'The Cell' };
const SUBJECT = 'biology';

// ICSE Grade 10 Cell chapter syllabus
const SYLLABUS = `
ICSE Grade 10 Biology — "The Cell" chapter covers:

1. Cell as the basic structural and functional unit of life
2. Prokaryotic vs Eukaryotic cells: differences, examples
3. Plant cell vs Animal cell: differences (cell wall, chloroplasts, large vacuole, centrioles)
4. Cell organelles — structure AND function of each:
   - Cell membrane (plasma membrane): semi-permeable, phospholipid bilayer, fluid mosaic model (basic)
   - Cell wall: composition (cellulose in plants), rigidity, protection
   - Nucleus: nuclear membrane, nucleolus, chromatin/chromosomes, role in heredity and metabolism
   - Mitochondria: double membrane, cristae, matrix, site of aerobic respiration, "powerhouse of the cell"
   - Chloroplast: double membrane, grana, stroma, thylakoids, site of photosynthesis, "kitchen of the cell"
   - Endoplasmic reticulum: rough ER (ribosomes, protein synthesis), smooth ER (lipid synthesis)
   - Golgi apparatus (Golgi body): packaging and secretion, forms lysosomes
   - Ribosomes: site of protein synthesis, 70S (prokaryotes) vs 80S (eukaryotes)
   - Lysosomes: digestive enzymes, autolysis, "suicidal bags of the cell"
   - Vacuoles: storage, large central vacuole in plants (turgor pressure), small in animal cells
   - Centrioles: cell division (spindle formation), only in animal cells and lower plants
   - Plastids: chromoplasts (colour), leucoplasts (storage), chloroplasts (photosynthesis)
5. Cell size and why cells are small (surface area to volume ratio)
6. Levels of organisation: cell → tissue → organ → organ system → organism

Topics NOT in scope: detailed biochemistry of membranes, signal transduction, detailed molecular mechanisms`;

const delay = ms => new Promise(r => setTimeout(r, ms));

async function generateBatch(batchNum, mcqCount, saCount) {
  const prompt = `Generate exactly ${mcqCount} MCQ questions and ${saCount} short answer questions for ICSE Grade 10 Biology on "The Cell" chapter.

SYLLABUS SCOPE:
${SYLLABUS}

REQUIREMENTS:
- Questions must be appropriate for Grade 10 (16-year-old) students
- Cover all major organelles and their functions
- Vary difficulty: some straightforward recall, some application ("which organelle would be most abundant in a secretory cell?")
- MCQ options must be plausible — avoid obviously wrong distractors
- Short answer model answers must be 2-4 sentences, clear and complete
- Do NOT repeat questions from earlier batches (batch ${batchNum} of 3)
- Focus this batch on: ${
    batchNum === 1 ? 'cell as basic unit of life, prokaryote vs eukaryote, cell size and surface area to volume ratio' :
    batchNum === 2 ? 'cell membrane structure and function, cell wall composition and function' :
    batchNum === 3 ? 'nucleus structure and function, mitochondria structure and function' :
    batchNum === 4 ? 'chloroplast structure and function, endoplasmic reticulum (rough and smooth), Golgi apparatus' :
    batchNum === 5 ? 'ribosomes, lysosomes, vacuoles, centrioles, plastids (chromoplasts, leucoplasts)' :
    'plant cell vs animal cell differences, applied questions (e.g. which organelle is most abundant in X type of cell), levels of organisation'
  }

Respond ONLY with valid JSON (no markdown):
{
  "mcq": [
    {
      "question": "...",
      "options": {"a": "...", "b": "...", "c": "...", "d": "..."},
      "answer": "a|b|c|d",
      "explanation": "Brief explanation of why the answer is correct (1-2 sentences)"
    }
  ],
  "short_answer": [
    {
      "question": "...",
      "explanation": "Model answer: 2-4 clear sentences a Grade 10 student should write"
    }
  ]
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  let text = message.content[0].text.trim();
  // Strip markdown fences if present
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  // Find the outermost JSON object
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON found in response');
  // Find matching closing brace
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const jsonStr = end !== -1 ? text.slice(start, end + 1) : text.slice(start);
  return JSON.parse(jsonStr);
}

async function main() {
  console.log('Generating questions for "The Cell" chapter...\n');
  console.log('Verifying API key...');
  await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5,
    messages: [{ role: 'user', content: 'hi' }],
  });
  console.log('API key OK\n');

  const allRows = [];
  const ts = Date.now();

  // 6 batches: 8 MCQ + 6 SA each = 48 MCQ + 36 SA total (~84 questions)
  const batches = [
    { num: 1, mcq: 8, sa: 6 },
    { num: 2, mcq: 8, sa: 6 },
    { num: 3, mcq: 8, sa: 6 },
    { num: 4, mcq: 8, sa: 6 },
    { num: 5, mcq: 8, sa: 6 },
    { num: 6, mcq: 8, sa: 6 },
  ];

  for (const batch of batches) {
    console.log(`Generating batch ${batch.num}/3 (${batch.mcq} MCQ + ${batch.sa} short answer)...`);
    try {
      const data = await generateBatch(batch.num, batch.mcq, batch.sa);

      // Build MCQ rows
      for (let i = 0; i < (data.mcq || []).length; i++) {
        const q = data.mcq[i];
        if (!q.question || !q.options || !q.answer) continue;
        allRows.push({
          id: `ai_cell_mcq_b${batch.num}_${i}_${ts}r`,
          subject: SUBJECT,
          chapter_id: CHAPTER.id,
          chapter_name: CHAPTER.name,
          type: 'mcq',
          skill: CHAPTER.name,
          year_tag: 'AI Generated',
          question: q.question.trim(),
          options: q.options,
          answer: q.answer.toLowerCase().trim(),
          explanation: q.explanation || '',
        });
      }

      // Build short answer rows
      for (let i = 0; i < (data.short_answer || []).length; i++) {
        const q = data.short_answer[i];
        if (!q.question) continue;
        allRows.push({
          id: `ai_cell_sa_b${batch.num}_${i}_${ts}r`,
          subject: SUBJECT,
          chapter_id: CHAPTER.id,
          chapter_name: CHAPTER.name,
          type: 'short_answer',
          skill: CHAPTER.name,
          year_tag: 'AI Generated',
          question: q.question.trim(),
          options: {},
          answer: '',
          explanation: q.explanation || '',
        });
      }

      console.log(`  ✓ Batch ${batch.num}: ${data.mcq?.length || 0} MCQ + ${data.short_answer?.length || 0} SA`);
    } catch (err) {
      console.error(`  ✗ Batch ${batch.num} failed: ${err.message}`);
    }

    if (batch.num < batches.length) await delay(2000);
  }

  console.log(`\nTotal generated: ${allRows.length} questions`);
  console.log('Uploading to Supabase...');

  const CHUNK = 50;
  let uploaded = 0;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const chunk = allRows.slice(i, i + CHUNK);
    const { error } = await supabase.from('questions').upsert(chunk, { onConflict: 'id' });
    if (error) console.error(`  Upload error: ${error.message}`);
    else { uploaded += chunk.length; console.log(`  Uploaded ${uploaded}/${allRows.length}`); }
  }

  console.log(`\n✅ Done! ${uploaded} "The Cell" questions added to Supabase.`);

  // Print sample
  console.log('\n── Sample MCQ ──');
  const sampleMCQ = allRows.find(r => r.type === 'mcq');
  if (sampleMCQ) {
    console.log(`Q: ${sampleMCQ.question}`);
    const o = sampleMCQ.options;
    console.log(`   a) ${o.a}  b) ${o.b}  c) ${o.c}  d) ${o.d}  ✓${sampleMCQ.answer}`);
  }
  console.log('\n── Sample Short Answer ──');
  const sampleSA = allRows.find(r => r.type === 'short_answer');
  if (sampleSA) {
    console.log(`Q: ${sampleSA.question}`);
    console.log(`A: ${sampleSA.explanation}`);
  }
}

main().catch(console.error);
