// Filter AI-generated questions against ICSE Grade 10 Biology syllabus
// Sends batches of 20 questions to Claude, deletes out-of-syllabus ones from Supabase
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), override: true });
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── ICSE Grade 10 Biology syllabus per chapter ─────────────────────────────
const SYLLABUS = {
  'Cell Cycle and Structure of Chromosomes': `
    - Structure of chromosomes: chromatin, chromatid, centromere, telomere, kinetochore, nucleosome, histone proteins
    - Cell cycle phases: G1 (interphase), S phase (DNA synthesis), G2, M phase
    - Mitosis: prophase, metaphase, anaphase, telophase, cytokinesis — stages and significance
    - Meiosis: meiosis I (prophase I, metaphase I, anaphase I, telophase I) and meiosis II — stages and significance
    - Crossing over, synapsis, bivalent, tetrad
    - Differences between mitosis and meiosis
    - Significance of cell division
    OUT OF SCOPE: advanced DNA replication mechanisms, gene expression, transcription/translation, polyploidy details, epigenetics`,

  'Genetics': `
    - Mendel's experiments with pea plants
    - Laws of heredity: Law of Dominance, Law of Segregation, Law of Independent Assortment
    - Terms: gene, allele, genotype, phenotype, dominant, recessive, homozygous, heterozygous, F1/F2 generation
    - Monohybrid cross (3:1 ratio), dihybrid cross (9:3:3:1 ratio)
    - Test cross, back cross
    - Incomplete dominance, codominance
    - Sex determination (XX/XY)
    - Sex-linked inheritance (colour blindness, haemophilia)
    - Blood groups: ABO system, Rh factor
    - Punnett square
    OUT OF SCOPE: molecular genetics, DNA structure details, mutations, gene therapy, karyotyping, chromosomal abnormalities like Down syndrome`,

  'Absorption by Roots': `
    - Root hair structure and function
    - Osmosis: definition, osmotic pressure, osmotic potential, water potential
    - Diffusion: definition, factors affecting diffusion
    - Active transport: definition, role of ATP, carrier proteins
    - Plasmolysis and deplasmolysis, turgor pressure, flaccidity
    - Absorption of water and mineral salts
    - Symplast and apoplast pathways
    OUT OF SCOPE: detailed ion transport channels, molecular pumps, plant hormones in relation to roots`,

  'Transpiration': `
    - Definition of transpiration
    - Types: stomatal, lenticular (lenticels), cuticular
    - Structure of stomata and guard cells, mechanism of stomatal opening and closing
    - Factors affecting transpiration: light, temperature, humidity, wind, water supply
    - Significance of transpiration (cooling, mineral transport, water movement)
    - Wilting (temporary and permanent)
    - Guttation and hydathodes
    - Potometer experiment
    - Antitranspirants
    OUT OF SCOPE: detailed water potential calculations, cohesion-tension theory in depth`,

  'Photosynthesis': `
    - Definition and overall equation
    - Chloroplast structure: grana, stroma, thylakoid
    - Pigments: chlorophyll a, chlorophyll b, carotenoids
    - Light reactions (light-dependent): photolysis of water, ATP synthesis, NADPH
    - Dark reactions (light-independent / Calvin cycle): CO2 fixation, glucose formation — basic only
    - Factors affecting photosynthesis: light intensity, CO2 concentration, temperature, water, chlorophyll
    - Experiments: starch test, variegated leaves, necessity of light/CO2/chlorophyll
    - Significance of photosynthesis
    OUT OF SCOPE: detailed biochemistry of Calvin cycle intermediates, C4 and CAM plants, photorespiration, detailed electron transport chain`,

  'Chemical Coordination in Plants': `
    - Phytohormones (plant hormones): definition and role
    - Auxins: discovery (Went experiment), functions (apical dominance, phototropism, geotropism), commercial uses
    - Gibberellins: functions (stem elongation, seed germination, fruit development)
    - Cytokinins: functions (cell division, delay of senescence)
    - Abscisic acid (ABA): functions (dormancy, stomatal closure, stress response)
    - Ethylene: functions (fruit ripening, abscission, Triple Response)
    - Tropic movements: phototropism, geotropism, hydrotropism, thigmotropism
    - Nastic movements
    OUT OF SCOPE: detailed molecular signalling pathways, gene regulation by hormones, brassinosteroids, jasmonates`,

  'The Circulatory System': `
    - Blood composition: plasma, RBC (erythrocytes), WBC (leucocytes — types), platelets (thrombocytes)
    - Functions of blood components
    - Blood groups: ABO system (A, B, AB, O), Rh factor, transfusion rules, universal donor/recipient
    - Clotting mechanism (basic): role of platelets, fibrin, thrombin
    - Heart structure: chambers (atria, ventricles), valves (bicuspid, tricuspid, semilunar), coronary vessels
    - Cardiac cycle: systole, diastole, heart sounds
    - Blood vessels: arteries, veins, capillaries — structure and function
    - Pulmonary and systemic circulation
    - Lymphatic system: lymph, lymph nodes, lymph vessels
    - Blood pressure basics
    OUT OF SCOPE: ECG interpretation in detail, cardiac disorders/diseases, detailed clotting cascade steps`,

  'The Excretory System': `
    - Organs of excretion: kidneys, skin, lungs, liver
    - Kidney structure: cortex, medulla, pelvis, ureter; nephron (Bowman's capsule, glomerulus, PCT, loop of Henle, DCT, collecting duct)
    - Urine formation: ultrafiltration, selective reabsorption, tubular secretion
    - Composition of urine
    - Skin structure and role in excretion (sweat glands)
    - Role of liver: urea formation (ornithine cycle — basic), bile production
    - Dialysis (haemodialysis): principle and procedure
    OUT OF SCOPE: kidney transplant details, detailed kidney diseases, ADH mechanism in depth, acid-base regulation`,

  'Nervous System and Sense Organs': `
    - Neuron structure: dendrites, cell body, axon, myelin sheath, nodes of Ranvier, synapse
    - Types of neurons: sensory, motor, relay (interneuron)
    - Nerve impulse transmission: resting potential, action potential (basic), synaptic transmission
    - Central nervous system (CNS): brain (cerebrum, cerebellum, medulla oblongata) and spinal cord
    - Peripheral nervous system (PNS): somatic and autonomic (sympathetic/parasympathetic)
    - Reflex arc and reflex action
    - Eye: structure (cornea, lens, iris, retina, fovea, optic nerve), image formation, defects (myopia, hypermetropia, presbyopia, astigmatism)
    - Ear: structure (outer, middle, inner ear — cochlea, semicircular canals), mechanism of hearing
    OUT OF SCOPE: detailed neurochemistry, specific brain disorders, EEG`,

  'The Endocrine System': `
    - Endocrine vs exocrine glands
    - Major glands and their hormones:
      - Pituitary: GH, TSH, ACTH, FSH, LH, ADH, oxytocin
      - Thyroid: thyroxine (T3/T4), calcitonin
      - Parathyroid: PTH
      - Adrenal cortex: cortisol, aldosterone; adrenal medulla: adrenaline
      - Pancreas (islets of Langerhans): insulin, glucagon
      - Gonads: testosterone, oestrogen, progesterone
      - Pineal: melatonin
      - Thymus: thymosin
    - Feedback mechanisms (negative feedback)
    - Disorders: diabetes mellitus (Type 1 and 2), goitre (simple and exophthalmic), dwarfism, gigantism, Addison's disease, Cushing's syndrome
    OUT OF SCOPE: hormone synthesis biochemistry, receptor signal transduction pathways, detailed molecular mechanisms`,

  'The Reproductive System': `
    - Male reproductive system: testes, epididymis, vas deferens, seminal vesicles, prostate, urethra, penis
    - Spermatogenesis (basic): spermatogonia → spermatocyte → spermatid → sperm
    - Sperm structure
    - Female reproductive system: ovaries, fallopian tubes, uterus, cervix, vagina
    - Oogenesis (basic)
    - Menstrual cycle: menstruation, follicular phase, ovulation, luteal phase; role of FSH, LH, oestrogen, progesterone
    - Fertilization and implantation
    - Placenta and its functions
    - Foetal development (basic stages only)
    - Parturition (birth process — basic)
    - Sexually transmitted diseases (STDs): HIV/AIDS, gonorrhoea, syphilis — basic
    - Contraception methods (basic overview)
    OUT OF SCOPE: IVF and assisted reproduction technology, detailed embryology stages`,

  'Human Population': `
    - World and India's population growth
    - Population pyramid
    - Causes of population explosion
    - Effects: food shortage, pressure on resources
    - Methods of food production: agriculture, animal husbandry (dairy, poultry, fisheries)
    - Improvement of crop yield: HYV seeds, fertilisers, irrigation, pesticides
    - Green Revolution
    - Population control measures
    OUT OF SCOPE: detailed economic analysis, industrial pollution control mechanisms`,

  'Human Evolution': `
    - Darwin's theory of natural selection
    - Evidence of evolution: fossils, comparative anatomy (homologous and analogous organs), vestigial organs
    - Hominid evolution: Australopithecus, Homo habilis, Homo erectus, Homo sapiens neanderthalensis, Homo sapiens sapiens
    - Hardy-Weinberg principle (basic mention only)
    OUT OF SCOPE: detailed molecular phylogenetics, speciation mechanisms beyond basic, genetic drift in detail`,

  'Pollution': `
    - Types of pollution: air, water, soil, noise, radioactive
    - Air pollution: sources (vehicles, industries), pollutants (CO, SO2, NOx, particulates, CFC), effects, control
    - Water pollution: sources (sewage, industrial effluents, agricultural runoff), effects, control
    - Soil pollution: sources (pesticides, fertilisers, solid waste), effects, control
    - Noise pollution: sources, effects on health, control
    - Radioactive pollution: sources, effects
    - Greenhouse effect, global warming, ozone depletion, acid rain
    - Biodegradable and non-biodegradable wastes
    - Waste management: reduce, reuse, recycle
    OUT OF SCOPE: detailed chemistry of pollutants, specific legislation, industrial effluent treatment engineering`,
};

// ── Helper: delay ─────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Filter a batch of questions against syllabus ───────────────────────────
async function filterBatch(chapterName, questions) {
  const syllabus = SYLLABUS[chapterName];
  if (!syllabus) {
    console.log(`  ⚠️  No syllabus defined for "${chapterName}" — keeping all`);
    return questions.map(q => ({ id: q.id, verdict: 'in_syllabus' }));
  }

  const questionList = questions.map((q, i) => {
    let line = `${i + 1}. [${q.type}] ${q.question}`;
    if (q.type === 'mcq' && q.options) {
      const o = q.options;
      line += ` | Options: a)${o.a} b)${o.b} c)${o.c} d)${o.d}`;
    }
    return line;
  }).join('\n');

  const prompt = `You are checking Grade 10 ICSE Biology questions against the official syllabus.

CHAPTER: ${chapterName}

ICSE SYLLABUS FOR THIS CHAPTER:
${syllabus}

QUESTIONS TO CHECK:
${questionList}

For each question, decide:
- "in_syllabus": The question tests a topic clearly listed in the syllabus above
- "out_of_syllabus": The question tests something explicitly marked OUT OF SCOPE, or tests advanced university-level concepts not expected of a Grade 10 student

Be LENIENT — if a question is borderline or tests a concept a good Grade 10 student should know, mark it "in_syllabus".

Respond ONLY with valid JSON array, one entry per question, in order:
[
  {"num": 1, "verdict": "in_syllabus" | "out_of_syllabus", "reason": "brief reason if out_of_syllabus"},
  ...
]`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Bad response for ${chapterName}: ${text.slice(0, 200)}`);

  const results = JSON.parse(jsonMatch[0]);
  return results.map((r, i) => ({
    id: questions[i].id,
    verdict: r.verdict,
    reason: r.reason || '',
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching AI-generated questions from Supabase...\n');

  // Paginate to get all questions (Supabase default limit is 1000)
  let data = [], from = 0, pageSize = 1000;
  while (true) {
    const { data: page, error } = await supabase
      .from('questions')
      .select('id, chapter_name, type, question, options, answer, explanation')
      .eq('subject', 'biology')
      .eq('year_tag', 'AI Generated')
      .order('chapter_id')
      .range(from, from + pageSize - 1);
    if (error) { console.error('Supabase error:', error.message); process.exit(1); }
    data = data.concat(page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  console.log(`Total AI questions: ${data.length}\n`);

  // Group by chapter
  const byChapter = {};
  for (const q of data) {
    if (!byChapter[q.chapter_name]) byChapter[q.chapter_name] = [];
    byChapter[q.chapter_name].push(q);
  }

  const toDelete = [];
  const keepCount = { total: 0, kept: 0, removed: 0 };

  for (const [chapter, questions] of Object.entries(byChapter)) {
    console.log(`\n📚 ${chapter} (${questions.length} questions)`);
    const BATCH = 20;

    for (let i = 0; i < questions.length; i += BATCH) {
      const batch = questions.slice(i, i + BATCH);
      try {
        const results = await filterBatch(chapter, batch);
        for (const r of results) {
          keepCount.total++;
          if (r.verdict === 'out_of_syllabus') {
            toDelete.push(r.id);
            keepCount.removed++;
            const q = batch.find(x => x.id === r.id);
            console.log(`  ✗ OUT: ${q?.question?.slice(0, 80)}… | ${r.reason}`);
          } else {
            keepCount.kept++;
          }
        }
      } catch (err) {
        console.error(`  Error on batch ${i}–${i+BATCH}: ${err.message}`);
      }
      if (i + BATCH < questions.length) await delay(1000);
    }
  }

  console.log('\n\n═══════════════════════════════════════');
  console.log('FILTER RESULTS');
  console.log('═══════════════════════════════════════');
  console.log(`Total checked:   ${keepCount.total}`);
  console.log(`In syllabus:     ${keepCount.kept}`);
  console.log(`Out of syllabus: ${keepCount.removed}`);

  if (toDelete.length === 0) {
    console.log('\nNo questions to delete. Done!');
    return;
  }

  console.log(`\nDeleting ${toDelete.length} out-of-syllabus questions from Supabase...`);
  const CHUNK = 100;
  for (let i = 0; i < toDelete.length; i += CHUNK) {
    const chunk = toDelete.slice(i, i + CHUNK);
    // Remove session_answers first to avoid FK constraint
    await supabase.from('session_answers').delete().in('question_id', chunk);
    const { error: delErr } = await supabase
      .from('questions')
      .delete()
      .in('id', chunk);
    if (delErr) console.error(`  Delete error: ${delErr.message}`);
    else console.log(`  Deleted ${chunk.length} questions (${i + chunk.length}/${toDelete.length})`);
  }

  console.log('\n✅ Done! Syllabus filter complete.');
}

main().catch(console.error);
