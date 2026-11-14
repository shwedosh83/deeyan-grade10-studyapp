/**
 * parsePrelimGeo.js
 *
 * Parses ICSE Geography prelim papers from Mumbai schools.
 * - Text-based PDFs: direct extraction via pypdf (called via child_process)
 * - Image-based PDFs: Claude Vision OCR
 *
 * Each question tagged with:
 *   skill = "Prelim 2025-26"
 *   year_tag = "<SchoolName> Prelim"
 *   chapter_name = derived from topic
 *
 * Skips: Q1 (map reading), Q2 (outline map), pure diagram questions.
 * Generates model answers using claude-haiku.
 *
 * Usage: node scripts/parsePrelimGeo.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PRELIM_DIR = '/Users/shwetadoshi/Documents/Deeyan Grade 10/Geo/prelim papers/';
const CONCURRENCY = 8;

// ── School name extraction from filename ────────────────────────────────────
function schoolName(filename) {
  const base = path.basename(filename, path.extname(filename));

  // Known mappings
  const MAP = {
    'CCS':          'Cathedral & John Connon',
    'BSS':          'Bombay Scottish',
    'CPG':          'CP Goenka',
    'DAIS':         'Dhirubhai Ambani',
    'Euro':         'Euroschool',
    'Euroschool':   'Euroschool',
    'Finland':      'Finland International',
    'Garodia':      'Garodia International',
    'Greg':         'Gregg',
    'Goldcrest':    'Goldcrest High',
    'Greenland':    'Greenland High',
    'Gundecha':     'Gundecha Education Academy',
    'HFS':          'Holy Family Salesian',
    'JNS':          'J.N. Petit',
    'KISA':         'KISA',
    'Lakshdham':    'Lakshdham High',
    'Manek':        'Manek Vidyamandir',
    'NHIS':         'New Horizon Integrated',
    'Petit':        'J.N. Petit',
    'Podar':        'Podar International',
    'QMS':          'Queen Mary',
    'ShriRam':      'Shri Ram',
    'Shishuvan':    'Shishuvan',
    'Singhania':    'Singhania',
    'SMS':          'St. Mary\'s Secondary',
    'TGAA':         'The Gandhi Ashram',
    'Universal':    'Universal High',
    'Vissanji':     'Vissanji Academy',
    'VPM':          'VPM Global',
    'VTS':          'VTS',
    'VVHS':         'Vile Parle Vidyanidhi',
    'WIS':          'Wockhardt International',
    'Avlon':        'Avlon International',
    'St':           'St. Peter\'s',
  };

  for (const [key, name] of Object.entries(MAP)) {
    if (base.toLowerCase().includes(key.toLowerCase())) {
      return name;
    }
  }
  // Fallback: use first word
  return base.split(/[\s_-]/)[0];
}

// ── Convert PDF pages to PNG images using pymupdf ──────────────────────────
function pdfPagesToImages(pdfPath, outputDir) {
  const script = `
import fitz, sys, os
doc = fitz.open(sys.argv[1])
out = sys.argv[2]
for i, page in enumerate(doc):
    mat = fitz.Matrix(1.0, 1.0)  # 1.0x zoom keeps images under 5MB for Claude Vision
    pix = page.get_pixmap(matrix=mat)
    pix.save(os.path.join(out, f'page-{i:03d}.png'))
print(len(doc))
`.trim();

  execSync(`python3 -c "${script.replace(/"/g, '\\"')}" "${pdfPath}" "${outputDir}"`, { stdio: 'pipe' });
  return fs.readdirSync(outputDir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => path.join(outputDir, f));
}

// ── OCR a single image page via Claude Vision ───────────────────────────────
async function ocrPage(imgPath) {
  const imgData = fs.readFileSync(imgPath);
  const b64 = imgData.toString('base64');
  const ext = path.extname(imgPath).slice(1).toLowerCase();
  const mediaType = ext === 'jpg' ? 'image/jpeg' : 'image/png';

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
        { type: 'text', text: 'Extract ALL text from this exam paper page exactly as written. Preserve question numbers, sub-parts (i)(ii)(a)(b), mark allocations [2][3], and all text content. Output plain text only.' }
      ]
    }]
  });
  return res.content[0].text;
}

// ── Extract text from text-based PDF ────────────────────────────────────────
function extractTextPDF(pdfPath) {
  try {
    const result = execSync(
      `python3 -c "
import pypdf, sys
r = pypdf.PdfReader('${pdfPath.replace(/'/g, "\\'")}')
print('\\n'.join(r.pages[i].extract_text() or '' for i in range(len(r.pages))))
"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    return result.toString();
  } catch (e) {
    return '';
  }
}

// ── Extract questions from OCR text using Claude ────────────────────────────
async function parseQuestionsFromText(fullText) {
  // Chunk text if too long
  const MAX_CHARS = 6000;
  const chunks = [];
  for (let i = 0; i < fullText.length; i += MAX_CHARS) {
    chunks.push(fullText.slice(i, i + MAX_CHARS));
  }

  let allQuestions = [];

  for (const chunk of chunks) {
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `You are parsing an ICSE Grade 10 Geography exam paper. Extract all answerable questions from this text.

SKIP these completely:
- Question 1 (Survey of India map reading — needs physical map)
- Question 2 (Outline map marking — needs blank map)
- Any sub-part asking to "mark and label", "shade and label", or "draw on the map"
- Any sub-part referencing grid squares, eastings, northings, contour intervals, spot heights

INCLUDE everything else:
- MCQs (with all 4 options)
- Short answer sub-questions (2 marks)
- Long answer sub-questions (3 marks)
- Assertion-Reason questions
- Case study questions

Output a JSON array. Each item:
{
  "question": "full question text",
  "marks": 1 or 2 or 3,
  "type": "mcq" or "short_answer" or "long_answer",
  "options": {"a":"...","b":"...","c":"...","d":"..."} (only for MCQs, else null)
}

Return ONLY the JSON array, no other text. If no questions found, return [].

TEXT:
${chunk}`
      }]
    });

    try {
      const text = res.content[0].text.trim();
      const jsonStart = text.indexOf('[');
      const jsonEnd = text.lastIndexOf(']') + 1;
      if (jsonStart === -1) continue;
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd));
      allQuestions = allQuestions.concat(parsed.filter(q => q.question && q.question.length > 15));
    } catch (e) {
      // Skip malformed chunks
    }
  }

  return allQuestions;
}

// ── Generate model answer via Claude ────────────────────────────────────────
async function generateAnswer(qText, marks, isMCQ, options) {
  const markGuide = isMCQ ? '1-mark MCQ' : marks === 3 ? '3-mark answer' : marks === 2 ? '2-mark answer' : '2-mark answer';

  let prompt;
  if (isMCQ && options) {
    prompt = `ICSE Grade 10 Geography question (${markGuide}):
${qText}
Options: (a) ${options.a}  (b) ${options.b}  (c) ${options.c}  (d) ${options.d}

State the correct option letter and option text. Format: "(x) option_text — Thus (x) is correct"`;
  } else {
    prompt = `ICSE Grade 10 Geography question (${markGuide}):
${qText}

Write a concise model answer suitable for ICSE board exams. ${marks >= 3 ? 'Cover all required points clearly — examiner expects ' + marks + ' distinct points.' : 'Keep it brief — 1-2 sentences for 2 marks.'}
Answer only, no preamble.`;
  }

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0].text.trim();
}

// ── Detect if PDF is image-based ────────────────────────────────────────────
function isImageBased(pdfPath) {
  try {
    const result = execSync(
      `python3 -c "
import pypdf
r = pypdf.PdfReader('${pdfPath.replace(/'/g, "\\'")}')
total = sum(len((r.pages[i].extract_text() or '').strip()) for i in range(min(3,len(r.pages))))
print(total)
"`, { stdio: 'pipe' }
    );
    return parseInt(result.toString().trim()) < 200;
  } catch { return true; }
}

// ── Process a single PDF ─────────────────────────────────────────────────────
async function processPDF(pdfPath) {
  const school = schoolName(path.basename(pdfPath));
  const yearTag = `${school} Prelim 2025-26`;
  console.log(`\n  Processing: ${path.basename(pdfPath)} → "${school}"`);

  let fullText = '';

  if (isImageBased(pdfPath)) {
    // OCR each page via Claude Vision
    const tmpDir = `/tmp/prelim_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      const imgPaths = pdfPagesToImages(pdfPath, tmpDir);
      console.log(`    OCR: ${imgPaths.length} pages...`);
      const pageTexts = [];
      for (let i = 0; i < imgPaths.length; i += 4) {
        const batch = imgPaths.slice(i, i + 4);
        const texts = await Promise.all(batch.map(ocrPage));
        pageTexts.push(...texts);
        process.stdout.write(`\r    OCR: ${Math.min(i + 4, imgPaths.length)}/${imgPaths.length} pages`);
      }
      fullText = pageTexts.join('\n\n');
      console.log('');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } else {
    fullText = extractTextPDF(pdfPath);
  }

  if (!fullText.trim()) {
    console.log('    ⚠ No text extracted — skipping');
    return [];
  }

  // Parse questions
  const rawQs = await parseQuestionsFromText(fullText);
  console.log(`    Parsed: ${rawQs.length} questions`);

  if (rawQs.length === 0) return [];

  // Generate model answers with concurrency
  const results = [];
  for (let i = 0; i < rawQs.length; i += CONCURRENCY) {
    const batch = rawQs.slice(i, i + CONCURRENCY);
    const answered = await Promise.all(batch.map(async (q, bi) => {
      try {
        const qText = q.question || q.qText || '';  // support both old and new format
        const answer = await generateAnswer(qText, q.marks || 2, q.type === 'mcq', q.options);
        const type = q.type || (q.isMCQ ? 'mcq' : (q.marks >= 3 ? 'long_answer' : 'short_answer'));
        return {
          id: `geo_prelim_${school.replace(/\W+/g, '_').toLowerCase()}_${i + bi}`,
          subject: 'geography',
          chapter_id: 99,
          chapter_name: 'Prelim Papers',
          question: qText,
          answer,
          options: q.options || {},
          type,
          skill: 'Prelim 2025-26',
          year_tag: yearTag,
          explanation: null,
        };
      } catch (e) {
        console.error(`    Error on q${i + bi}: ${e.message}`);
        return null;
      }
    }));
    results.push(...answered.filter(Boolean));
    process.stdout.write(`\r    Answers: ${Math.min(i + CONCURRENCY, rawQs.length)}/${rawQs.length}`);
  }
  console.log(`  → ${results.length} questions ready`);
  return results;
}

// ── Upload batch to Supabase ────────────────────────────────────────────────
async function uploadBatch(rows) {
  if (rows.length === 0) return;
  // Filter out any rows with missing required fields
  const valid = rows.filter(r => r.question && r.question.trim().length > 5 && r.answer && r.answer.trim().length > 0);
  if (valid.length < rows.length) console.log(`    Filtered ${rows.length - valid.length} invalid rows`);
  const BATCH = 50;
  for (let i = 0; i < valid.length; i += BATCH) {
    const { error } = await supabase
      .from('questions')
      .upsert(valid.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) console.error('Upload error:', error.message);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function run() {
  const files = fs.readdirSync(PRELIM_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => path.join(PRELIM_DIR, f));

  console.log(`Found ${files.length} PDF prelim papers`);
  console.log('Skipping .docx files (DAIS) — convert to PDF first if needed\n');

  let totalUploaded = 0;

  for (const pdfPath of files) {
    try {
      const rows = await processPDF(pdfPath);
      await uploadBatch(rows);
      totalUploaded += rows.length;
    } catch (e) {
      console.error(`  ERROR processing ${path.basename(pdfPath)}: ${e.message}`);
    }
  }

  console.log(`\n✓ Done. Total questions uploaded: ${totalUploaded}`);

  const { count } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })
    .eq('subject', 'geography')
    .eq('chapter_name', 'Prelim Papers');
  console.log(`Geography Prelim questions in DB: ${count}`);
}

run();
