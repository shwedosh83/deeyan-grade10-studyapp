// Combines the per-chapter OCR'd textbook JSON files (backend/data/textbook/<subject>/<chapter_id>.json)
// into a single index file per subject (backend/data/textbook/<subject>.json), keyed by chapter_id
// as a string. api/evaluate.js does a single static `require` of the combined file so Vercel's
// file tracer bundles it reliably — a dynamic per-chapter require is not guaranteed to be traced.
//
// Run after (re-)generating chapter files, e.g.:
//   node backend/scripts/buildTextbookIndex.js biology

const fs = require('fs');
const path = require('path');

const subject = process.argv[2];
if (!subject) {
  console.error('Usage: node buildTextbookIndex.js <subject>');
  process.exit(1);
}

const dir = path.join(__dirname, '..', 'data', 'textbook', subject);
const outFile = path.join(__dirname, '..', 'data', 'textbook', `${subject}.json`);

if (!fs.existsSync(dir)) {
  console.error(`No directory at ${dir}`);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const index = {};
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  index[String(data.chapter_id)] = data;
}

fs.writeFileSync(outFile, JSON.stringify(index));
console.log(`Wrote ${outFile} with ${Object.keys(index).length} chapters (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
