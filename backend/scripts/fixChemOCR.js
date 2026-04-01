/**
 * Fix OCR spacing artifacts in Chemistry questions & answers
 * Patterns like "o xide" → "oxide", "carb on" → "carbon", etc.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// List of split-word fixes: [broken pattern (case-insensitive), correct word]
const FIXES = [
  // Single letter splits (e.g. "h ydrogen", "v apour", "o xide")
  [/\bh\s+ydrogen\b/gi,      'hydrogen'],
  [/\bh\s+ydroxide\b/gi,     'hydroxide'],
  [/\bh\s+ydrochloric\b/gi,  'hydrochloric'],
  [/\bv\s+apour\b/gi,        'vapour'],
  [/\bv\s+apor\b/gi,         'vapor'],
  [/\bo\s+xide\b/gi,         'oxide'],
  [/\bo\s+xygen\b/gi,        'oxygen'],
  [/\bo\s+xidation\b/gi,     'oxidation'],
  [/\ba\s+cid\b/gi,          'acid'],
  [/\ba\s+node\b/gi,         'anode'],
  [/\bi\s+onic\b/gi,         'ionic'],
  [/\bi\s+odine\b/gi,        'iodine'],
  [/\bi\s+odide\b/gi,        'iodide'],
  [/\be\s+lectron\b/gi,      'electron'],
  [/\be\s+lectrolysis\b/gi,  'electrolysis'],
  [/\be\s+lectrolyte\b/gi,   'electrolyte'],
  [/\be\s+lectrode\b/gi,     'electrode'],
  [/\be\s+lectropl/gi,       'electropl'],
  // Common chemistry words split mid-word
  [/\bcarb\s+on\b/gi,        'carbon'],
  [/\bcarb\s+onate\b/gi,     'carbonate'],
  [/\bcarb\s+on\s+ate\b/gi,  'carbonate'],
  [/\bcarb\s+oxyl/gi,        'carboxyl'],
  [/\balk\s+ali\b/gi,        'alkali'],
  [/\bactiv\s+e\b/gi,        'active'],
  [/\bsulph\s+ate\b/gi,      'sulphate'],
  [/\bsulph\s+ur\b/gi,       'sulphur'],
  [/\bsulph\s+uric\b/gi,     'sulphuric'],
  [/\bsulph\s+ide\b/gi,      'sulphide'],
  [/\bnitr\s+ate\b/gi,       'nitrate'],
  [/\bnitr\s+ogen\b/gi,      'nitrogen'],
  [/\bnitr\s+ic\b/gi,        'nitric'],
  [/\bnitr\s+ite\b/gi,       'nitrite'],
  [/\bhydr\s+ogen\b/gi,      'hydrogen'],
  [/\bhydr\s+oxide\b/gi,     'hydroxide'],
  [/\bhydr\s+o\s+xide\b/gi,  'hydroxide'],
  [/\bhydr\s+ochloric\b/gi,  'hydrochloric'],
  [/\bchlor\s+ide\b/gi,      'chloride'],
  [/\bchlor\s+ine\b/gi,      'chlorine'],
  [/\bchlor\s+ic\b/gi,       'chloric'],
  [/\bbrom\s+ide\b/gi,       'bromide'],
  [/\bbrom\s+ine\b/gi,       'bromine'],
  [/\bfluor\s+ide\b/gi,      'fluoride'],
  [/\bfluor\s+ine\b/gi,      'fluorine'],
  [/\bphosp\s+hate\b/gi,     'phosphate'],
  [/\bphosph\s+ate\b/gi,     'phosphate'],
  [/\bphosph\s+orus\b/gi,    'phosphorus'],
  [/\bmang\s+anese\b/gi,     'manganese'],
  [/\bammon\s+ia\b/gi,       'ammonia'],
  [/\bammon\s+ium\b/gi,      'ammonium'],
  [/\belectr\s+on\b/gi,      'electron'],
  [/\belectr\s+olysis\b/gi,  'electrolysis'],
  [/\belectr\s+olyte\b/gi,   'electrolyte'],
  [/\belectr\s+ode\b/gi,     'electrode'],
  [/\bcov\s+alent\b/gi,      'covalent'],
  [/\bmet\s+allic\b/gi,      'metallic'],
  [/\bmet\s+al\b/gi,         'metal'],
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
  [/\bioniz\s+ation\b/gi,    'ionization'],
  [/\bionizat\s+ion\b/gi,    'ionization'],
  [/\bmolecul\s+ar\b/gi,     'molecular'],
  [/\bmolecu\s+le\b/gi,      'molecule'],
  [/\bempiri\s+cal\b/gi,     'empirical'],
  [/\bstoichiom\s+etry\b/gi, 'stoichiometry'],
  [/\bstoichi\s+ometry\b/gi, 'stoichiometry'],
  [/\bcrystalli\s+sation\b/gi,'crystallisation'],
  [/\bsaturat\s+ed\b/gi,     'saturated'],
  [/\bdissol\s+ve\b/gi,      'dissolve'],
  [/\bprecipit\s+ation\b/gi, 'precipitation'],
  [/\bcorros\s+ion\b/gi,     'corrosion'],
  [/\bgalvan\s+ise\b/gi,     'galvanise'],
  [/\bgalvaniz\s+ation\b/gi, 'galvanization'],
  [/\brefin\s+ing\b/gi,      'refining'],
  [/\bsmelting\b/gi,         'smelting'],
  [/\bextr\s+action\b/gi,    'extraction'],
  [/\bextract\s+ion\b/gi,    'extraction'],
  [/\bcomposi\s+tion\b/gi,   'composition'],
  [/\bcomposit\s+ion\b/gi,   'composition'],
  [/\bsublimat\s+ion\b/gi,   'sublimation'],
  [/\beverywh\s+ere\b/gi,    'everywhere'],
  [/\bproperti\s+es\b/gi,    'properties'],
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
      .select('id, question, answer, options')
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

      // Fix MCQ options too
      let newOpts = q.options;
      if (q.options && typeof q.options === 'object') {
        const fixedOpts = {};
        let optsChanged = false;
        for (const [key, val] of Object.entries(q.options)) {
          const fixedVal = fixText(val);
          fixedOpts[key] = fixedVal;
          if (fixedVal !== val) optsChanged = true;
        }
        if (optsChanged) newOpts = fixedOpts;
      }

      if (newQ !== q.question || newA !== q.answer || newOpts !== q.options) {
        const { error: upErr } = await supabase
          .from('questions')
          .update({ question: newQ, answer: newA, options: newOpts })
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
