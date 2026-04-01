/**
 * Fix OCR spacing artifacts in Chemistry questions & answers
 * Patterns like "o xide" → "oxide", "carb on" → "carbon", etc.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// List of split-word fixes: [broken pattern (case-insensitive), correct word]
const FIXES = [
  // Elements & common chemistry words
  [/\bcarb\s+on\b/gi,        'carbon'],
  [/\bcarb\s+onate\b/gi,     'carbonate'],
  [/\bcarb\s+on\s+ate\b/gi,  'carbonate'],
  [/\bcarb\s+oxyl/gi,        'carboxyl'],
  [/\bo\s+xide\b/gi,         'oxide'],
  [/\balk\s+ali\b/gi,        'alkali'],
  [/\bactiv\s+e\b/gi,        'active'],
  [/\bsulph\s+ate\b/gi,      'sulphate'],
  [/\bsulph\s+ur\b/gi,       'sulphur'],
  [/\bsulph\s+uric\b/gi,     'sulphuric'],
  [/\bnitr\s+ate\b/gi,       'nitrate'],
  [/\bnitr\s+ogen\b/gi,      'nitrogen'],
  [/\bnitr\s+ic\b/gi,        'nitric'],
  [/\bnitr\s+ite\b/gi,       'nitrite'],
  [/\bhydr\s+ogen\b/gi,      'hydrogen'],
  [/\bhydr\s+oxide\b/gi,     'hydroxide'],
  [/\bhydr\s+o\s+xide\b/gi,  'hydroxide'],
  [/\bchlorid\s+e\b/gi,      'chloride'],
  [/\bchlor\s+ide\b/gi,      'chloride'],
  [/\bchlor\s+ine\b/gi,      'chlorine'],
  [/\bbrom\s+ide\b/gi,       'bromide'],
  [/\biod\s+ide\b/gi,        'iodide'],
  [/\bfluor\s+ide\b/gi,      'fluoride'],
  [/\bphosp\s+hate\b/gi,     'phosphate'],
  [/\bphosph\s+ate\b/gi,     'phosphate'],
  [/\bphosph\s+orus\b/gi,    'phosphorus'],
  [/\bmang\s+anese\b/gi,     'manganese'],
  [/\bsodium\s+m\b/gi,       'sodium'],
  [/\bpotassium\s+m\b/gi,    'potassium'],
  [/\bcalcium\s+m\b/gi,      'calcium'],
  [/\bmagnesium\s+m\b/gi,    'magnesium'],
  [/\bammon\s+ia\b/gi,       'ammonia'],
  [/\bammon\s+ium\b/gi,      'ammonium'],
  [/\belectr\s+on\b/gi,      'electron'],
  [/\belectr\s+olysis\b/gi,  'electrolysis'],
  [/\belectr\s+olyte\b/gi,   'electrolyte'],
  [/\belectr\s+ode\b/gi,     'electrode'],
  [/\bcov\s+alent\b/gi,      'covalent'],
  [/\bion\s+ic\b/gi,         'ionic'],
  [/\bmet\s+allic\b/gi,      'metallic'],
  [/\bmet\s+al\b/gi,         'metal'],
  [/\bnon[\s-]+met\s+al\b/gi,'non-metal'],
  [/\bperiod\s+ic\b/gi,      'periodic'],
  [/\bvalenc\s+y\b/gi,       'valency'],
  [/\bvalenc\s+e\b/gi,       'valence'],
  [/\breact\s+ion\b/gi,      'reaction'],
  [/\bsolut\s+ion\b/gi,      'solution'],
  [/\bsolubl\s+e\b/gi,       'soluble'],
  [/\binsolub\s+le\b/gi,     'insoluble'],
  [/\bprecip\s+itate\b/gi,   'precipitate'],
  [/\bprecipit\s+ate\b/gi,   'precipitate'],
  [/\bconcentrat\s+ed\b/gi,  'concentrated'],
  [/\bconc\s+entrated\b/gi,  'concentrated'],
  [/\bdilut\s+e\b/gi,        'dilute'],
  [/\btemperatur\s+e\b/gi,   'temperature'],
  [/\bcatalys\s+t\b/gi,      'catalyst'],
  [/\bdecomposit\s+ion\b/gi, 'decomposition'],
  [/\bcombus\s+tion\b/gi,    'combustion'],
  [/\bneutrali\s+sation\b/gi,'neutralisation'],
  [/\bneutral\s+isation\b/gi,'neutralisation'],
  [/\boxid\s+ation\b/gi,     'oxidation'],
  [/\breduct\s+ion\b/gi,     'reduction'],
  [/\bindic\s+ator\b/gi,     'indicator'],
  [/\belectrop\s+lating\b/gi,'electroplating'],
  [/\belectropl\s+ating\b/gi,'electroplating'],
  [/\bcath\s+ode\b/gi,       'cathode'],
  [/\banod\s+e\b/gi,         'anode'],
  [/\bioniz\s+ation\b/gi,    'ionization'],
  [/\bionizat\s+ion\b/gi,    'ionization'],
  [/\batomic\s+c\b/gi,       'atomic'],
  [/\bmolecul\s+ar\b/gi,     'molecular'],
  [/\bmolecu\s+le\b/gi,      'molecule'],
  [/\bempiri\s+cal\b/gi,     'empirical'],
  [/\bstoichiom\s+etry\b/gi, 'stoichiometry'],
  [/\bstoichi\s+ometry\b/gi, 'stoichiometry'],
  [/\bvalenc\s+y\b/gi,       'valency'],
  [/\borganis\s+m\b/gi,      'organism'],
  [/\borganic\s+c\b/gi,      'organic'],
  // Arrow fix
  [/\$\s+/g,                 '→ '],
  [/"\s*→\s*"/g,             '→'],
];

function fixText(text) {
  if (!text) return text;
  let fixed = text;
  for (const [pattern, replacement] of FIXES) {
    fixed = fixed.replace(pattern, replacement);
  }
  return fixed;
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

  let fixed = 0;
  const BATCH = 50;

  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH);
    for (const q of batch) {
      const newQ = fixText(q.question);
      const newA = fixText(q.answer);
      if (newQ !== q.question || newA !== q.answer) {
        const { error: upErr } = await supabase
          .from('questions')
          .update({ question: newQ, answer: newA })
          .eq('id', q.id);
        if (upErr) console.error(`Error updating ${q.id}:`, upErr.message);
        else fixed++;
      }
    }
    console.log(`Processed: ${Math.min(i + BATCH, questions.length)}/${questions.length} | Fixed: ${fixed}`);
  }

  console.log(`\n✅ Done! Fixed OCR spacing in ${fixed} questions`);
}

main();
