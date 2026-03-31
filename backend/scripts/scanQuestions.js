// Scan all questions for sentence/data quality issues
const fs = require('fs');

const QUESTION_BANK_PATH = '/Users/shwetadoshi/Downloads/biology_questions_usable.json';

// Patterns that indicate a bad/incomplete question
const ISSUES = {
  startsWithLowercase:   q => /^[a-z]/.test(q.trim()),
  startsWithPunctuation: q => /^[.,;:()\-]/.test(q.trim()),
  tooShort:              q => q.trim().length < 20,
  ocrGarbage:            q => /[A-Z]{5,}|UUTIIUE|EQUESTION/.test(q),
  fragmentEnding:        q => /\.$/.test(q.trim()) && q.trim().split(' ').length < 6,
  noQuestionMark:        q => q.type === 'short_answer' && !/[?:]/.test(q.question),
  bleedingContext:       q => /^\(i+\)|^which of the following|^class and/i.test(q.trim()),
  midSentence:           q => /^(and|or|but|with|by|of|the|a |an |in |on |at |to )\s/i.test(q.trim()),
};

const raw = fs.readFileSync(QUESTION_BANK_PATH, 'utf8');
const all = JSON.parse(raw);

const results = { clean: [], bad: [] };
const issueSummary = {};

for (const q of all) {
  if (!q.question) continue;

  const flagged = [];
  for (const [name, check] of Object.entries(ISSUES)) {
    if (check(q.question, q)) {
      flagged.push(name);
      issueSummary[name] = (issueSummary[name] || 0) + 1;
    }
  }

  if (flagged.length > 0) {
    results.bad.push({ id: q.id, type: q.type, issues: flagged, question: q.question.slice(0, 120) });
  } else {
    results.clean.push(q.id);
  }
}

console.log('=== SCAN RESULTS ===');
console.log(`Total questions: ${all.length}`);
console.log(`Clean: ${results.clean.length}`);
console.log(`Problematic: ${results.bad.length}`);
console.log('\n--- Issue breakdown ---');
Object.entries(issueSummary)
  .sort((a, b) => b[1] - a[1])
  .forEach(([issue, count]) => console.log(`  ${issue}: ${count}`));

console.log('\n--- Sample bad questions (first 20) ---');
results.bad.slice(0, 20).forEach((q, i) => {
  console.log(`\n[${i + 1}] ${q.id} (${q.type})`);
  console.log(`  Issues: ${q.issues.join(', ')}`);
  console.log(`  Question: "${q.question}"`);
});

// Save full report
const report = {
  summary: {
    total: all.length,
    clean: results.clean.length,
    bad: results.bad.length,
    issues: issueSummary,
  },
  badQuestions: results.bad,
};
fs.writeFileSync('/tmp/bio_scan_report.json', JSON.stringify(report, null, 2));
console.log('\nFull report saved to /tmp/bio_scan_report.json');
