require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const RAW = '/tmp/history_civics_raw.txt';
const SUBJECT = 'history_civics';

const CHAPTERS = [
  { id: 101, name: 'The First War of Independence 1857',        pat: /CH(?:APT?E?R?)?\s*1\s*[:.]|FIRST WAR OF IND/i },
  { id: 102, name: 'Growth of Nationalism',                     pat: /CH(?:APT?E?R?)?\s*2\s*[:.]|GROWTH OF NATION/i },
  { id: 103, name: 'First Phase of Indian National Movement',   pat: /CH(?:APT?E?R?)?\s*3\s*[:.]|FIRST PHASE OF/i },
  { id: 104, name: 'Second Phase of Indian National Movement',  pat: /CH(?:APT?E?R?)?\s*4\s*[:.]|SECOND PHASE OF/i },
  { id: 105, name: 'Gandhian Era and Struggle for Independence',pat: /CH(?:APT?E?R?)?\s*5\s*[:.]|GANDHIAN ERA/i },
  { id: 106, name: 'Forward Bloc and The INA',                  pat: /CH(?:APT?E?R?)?\s*6\s*[:.]|FORWARD BLOC/i },
  { id: 107, name: 'Independence and Partition of India',       pat: /CH(?:APT?E?R?)?\s*7\s*[:.]|INDEPENDENCE AND PARTITION/i },
  { id: 108, name: 'The First World War',                       pat: /CH(?:APT?E?R?)?\s*8\s*[:.]|FIRST WORLD WAR/i },
  { id: 109, name: 'Rise of Dictatorships',                     pat: /CH(?:APT?E?R?)?\s*9\s*[:.]|RISE OF DICT/i },
  { id: 110, name: 'The Second World War',                      pat: /CH(?:APT?E?R?)?\s*10\s*[:.]|SECOND WORLD WAR/i },
  { id: 111, name: 'The United Nations',                        pat: /CH(?:APT?E?R?)?\s*11\s*[:.]|UNITED NATION/i },
  { id: 112, name: 'Non Aligned Movement',                      pat: /CH(?:APT?E?R?)?\s*12\s*[:.]|NON.?ALIGNED/i },
  { id: 113, name: 'The Union Legislature',                     pat: /CH(?:APT?E?R?)?\s*13\s*[:.]|UNION LEGISLATURE/i },
  { id: 114, name: 'President and Vice President',              pat: /CH(?:APT?E?R?)?\s*14\s*[:.]|PRESIDENT AND VICE/i },
  { id: 115, name: 'Prime Minister and Council of Ministers',   pat: /CH(?:APT?E?R?)?\s*15\s*[:.]|PRIME MINISTER AND COUNCIL/i },
  { id: 116, name: 'The Supreme Court',                         pat: /CH(?:APT?E?R?)?\s*16\s*[:.]|SUPREME COURT/i },
  { id: 117, name: 'High Court and Subordinate Courts',         pat: /CH(?:APT?E?R?)?\s*17\s*[:.]|HIGH COURT AND SUB/i },
];

function detectChapter(text) {
  for (const ch of CHAPTERS) {
    if (ch.pat.test(text)) return ch;
  }
  return null;
}

function extractYear(text) {
  const m = text.match(/(?:MAIN|COMP|SQP|BOARD)\s+(\d{4})/);
  return m ? m[1] : null;
}

function clean(t) {
  return t.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/g, ' ').trim();
}

// Split "(a) text(b) text(c) text(d) text" from a single line
function parseOptionsFromLine(line) {
  const opts = {};
  const parts = line.split(/(?=\([abcd]\)\s)/);
  for (const p of parts) {
    const m = p.match(/^\(([abcd])\)\s*(.*)/s);
    if (m) opts[m[1]] = clean(m[2]);
  }
  return Object.keys(opts).length === 4 ? opts : null;
}

function run() {
  const raw = fs.readFileSync(RAW, 'utf8');
  const pages = raw.split(/\n===PAGE \d+===\n/);

  let currentChapter = null;
  const mcqs = [];
  const structured = [];

  for (const page of pages) {
    const ch = detectChapter(page);
    if (ch) currentChapter = ch;
    if (!currentChapter) continue;

    const lines = page.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Question line: starts with "N. " where N is a number
      const qMatch = line.match(/^(\d{1,3})\.\s+(.{10,})/);
      if (!qMatch) { i++; continue; }

      const qText = [qMatch[2]];
      let options = null;
      let answer = null;
      let year = null;
      let answerLines = [];
      i++;

      // Try parsing options from the first line itself (concatenated format)
      options = parseOptionsFromLine(qMatch[2]);
      if (options) qText[0] = qMatch[2].split(/\([abcd]\)/)[0].trim();

      // Read forward
      let collecting = 'question'; // 'question' | 'options' | 'answer'
      while (i < lines.length) {
        const l = lines[i].trim();
        if (!l) { i++; continue; }

        // Stop if next numbered question
        if (/^\d{1,3}\.\s+.{10,}/.test(l) && !l.startsWith(qMatch[1] + '.')) break;

        // Answer line
        if (/^Ans\s*:/.test(l)) {
          collecting = 'answer';
          year = extractYear(l);
          // Check for inline Thus (x)
          const inline = l.match(/Thus\s*\(([abcd])\)/i);
          if (inline) answer = inline[1];
          i++; continue;
        }

        if (collecting === 'answer') {
          // "Thus (x) is correct"
          const keyM = l.match(/Thus\s*\(([abcd])\)/i);
          if (keyM && !answer) { answer = keyM[1]; i++; continue; }
          // Stop collecting answer if new question starts
          if (/^\d{1,3}\.\s+/.test(l)) break;
          answerLines.push(l);
          i++; continue;
        }

        if (collecting === 'question') {
          // Options line (concatenated or separate)
          if (/\([abcd]\)/.test(l) && !options) {
            options = parseOptionsFromLine(l);
            if (!options) {
              // Separate option line
              const om = l.match(/^\(([abcd])\)\s*(.+)/);
              if (om) {
                if (!options) options = {};
                options[om[1]] = clean(om[2]);
              }
            }
            i++; continue;
          }
          // Continuation of question
          if (!options && !/^===/.test(l)) { qText.push(l); }
        }
        i++;
      }

      // Collect remaining separate option lines if needed
      // (already handled above)

      const questionText = clean(qText.join(' '));
      if (questionText.length < 15) continue;

      if (options && Object.keys(options).length === 4 && answer) {
        mcqs.push({ type: 'mcq', question: questionText, options, answer, year, chapter: currentChapter });
      } else if (!options && answerLines.length > 0) {
        const ansText = clean(answerLines.join(' '));
        if (ansText.length >= 15) {
          const partCount = (questionText.match(/\([ivx]+\)/g) || []).length;
          const marks = partCount >= 3 ? 4 : partCount >= 2 ? 3 : 2;
          structured.push({
            type: marks >= 4 ? 'long_answer' : 'short_answer',
            question: questionText,
            options: {}, answer: ansText, year, marks,
            chapter: currentChapter,
          });
        }
      }
    }
  }

  return { mcqs, structured };
}

async function upload(all) {
  // First delete existing history_civics questions
  console.log('Clearing old history_civics questions...');
  await supabase.from('session_answers').delete().in('question_id',
    (await supabase.from('questions').select('id').eq('subject', SUBJECT)).data?.map(r => r.id) || []
  );
  await supabase.from('questions').delete().eq('subject', SUBJECT);

  const ts = Date.now();
  const rows = all.map((q, i) => ({
    id: `hc_${q.chapter.id}_${q.type}_${i}_${ts}`,
    subject: SUBJECT,
    chapter_id: q.chapter.id,
    chapter_name: q.chapter.name,
    skill: q.chapter.name,
    type: q.type,
    year_tag: q.year || 'Past Paper',
    question: q.question,
    options: q.options || {},
    answer: q.answer,
    explanation: '',
  }));

  console.log(`Uploading ${rows.length} questions...`);
  let uploaded = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from('questions').upsert(chunk, { onConflict: 'id' });
    if (error) console.error(`Chunk error:`, error.message);
    else uploaded += chunk.length;
    process.stdout.write(`  ${uploaded}/${rows.length}\r`);
  }
  console.log(`\nDone. Uploaded ${uploaded}.`);
}

async function main() {
  const { mcqs, structured } = run();
  console.log(`MCQs: ${mcqs.length} | Structured: ${structured.length}`);

  const byChapter = {};
  [...mcqs, ...structured].forEach(q => {
    const k = q.chapter.name;
    if (!byChapter[k]) byChapter[k] = { mcq: 0, short_answer: 0, long_answer: 0 };
    byChapter[k][q.type] = (byChapter[k][q.type] || 0) + 1;
  });
  console.log('\nBreakdown:');
  Object.entries(byChapter).forEach(([ch, c]) =>
    console.log(`  ${ch.slice(0,45).padEnd(46)} MCQ=${c.mcq||0} SA=${c.short_answer||0} LA=${c.long_answer||0}`)
  );

  await upload([...mcqs, ...structured]);
}

main().catch(console.error);
