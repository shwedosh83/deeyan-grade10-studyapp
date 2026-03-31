/**
 * Generate AI questions for History & Civics (ch101-117)
 * - Fetches existing questions per chapter to avoid duplicates
 * - Generates: 10 MCQ + 8 short_answer + 5 long_answer per chapter
 * - Adds hard + implied/application questions per ICSE paper pattern
 */
const fs = require('fs');
const path = require('path');
const envParsed = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
Object.assign(process.env, envParsed);

const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const CHAPTERS = [
  {
    id: 101, name: 'The First War of Independence 1857',
    notes: `Causes: Political (Doctrine of Lapse, annexation of Awadh), Economic (heavy taxation, drain of wealth, destruction of Indian industries), Military (racial discrimination, low pay, foreign service), Social (interference with Indian customs, Widow Remarriage Act), Religious (greased cartridges - pork and beef fat). Events: Mangal Pande at Barrackpore, Sepoy Mutiny at Meerut (10 May 1857), Delhi captured under Bahadur Shah Zafar, Kanpur under Nana Sahib, Lucknow under Begum Hazrat Mahal, Jhansi under Rani Lakshmibai, Gwalior. British recapture: Sir Henry Lawrence died at Lucknow, Tantya Tope escaped, executed 1859. Consequences: Rule transferred from East India Company to British Crown (1858), Secretary of State for India created, Governor General became Viceroy, Policy of Divide and Rule, reorganization of Indian Army.`
  },
  {
    id: 102, name: 'Growth of Nationalism',
    notes: `Economic causes of nationalism: Drain of wealth (Dadabhai Naoroji's 'Poverty and Un-British Rule in India'), destruction of Indian handicrafts, heavy land revenue. Socio-religious reform movements: Raja Ram Mohan Roy (Brahmo Samaj 1828, abolished sati, widow remarriage, women's education), Dayanand Saraswati (Arya Samaj 1875, 'Back to Vedas', Shuddhi movement), Sir Syed Ahmed Khan (Aligarh Movement, Scientific Society), Ramakrishna Paramahamsa and Swami Vivekananda (Ramakrishna Mission 1897). Political causes: Ilbert Bill controversy 1883, racial discrimination. Role of press and literature: Surendranath Banerjee founded 'Indian Association' 1876. Early nationalist leaders: Gopal Krishna Gokhale, Bal Gangadhar Tilak, Bipin Chandra Pal, Lala Lajpat Rai (Lal-Bal-Pal). Growth of English education creating a class of educated Indians. Indian National Congress founded 1885 by A.O. Hume.`
  },
  {
    id: 103, name: 'First Phase of Indian National Movement',
    notes: `Early Nationalists (Moderates) 1885-1905: Leaders - Gopal Krishna Gokhale, Dadabhai Naoroji, Surendranath Banerjee, Pherozeshah Mehta. Methods: constitutional agitation, petitions, prayers, speeches. Demands: civil services exams in India, expansion of Legislative Councils, reduction of military expenditure. Limitations: narrow social base, constitutional methods only. Assertive Nationalists (Extremists): Bal Gangadhar Tilak, Lala Lajpat Rai, Bipin Chandra Pal. Methods: mass mobilization, boycott, Swadeshi, passive resistance. Partition of Bengal 1905 by Lord Curzon (October 16, 1905) - administrative pretext but actually divide Hindus and Muslims. Swadeshi Movement: boycott of British goods, use of indigenous goods. Anti-Partition agitation: Rakhi ceremony, Amar Sonar Bangla song by Rabindranath Tagore. Surat Split 1907: Congress split into Moderates and Extremists. Morley-Minto Reforms 1909: separate electorates for Muslims.`
  },
  {
    id: 104, name: 'Second Phase of Indian National Movement',
    notes: `Formation of Muslim League 1906 at Dhaka under Aga Khan. Aims: safeguard Muslim political interests, separate electorates. Delhi Durbar 1911: Partition of Bengal annulled, capital shifted from Calcutta to Delhi. Home Rule Movement 1916: Bal Gangadhar Tilak (Poona, June 1916) and Annie Besant (Madras, September 1916). Demand: self-governance within the British Empire. Lucknow Pact 1916: Congress and Muslim League united; Congress accepted separate electorates. Montagu-Chelmsford Reforms 1919 (Government of India Act 1919): Dyarchy in provinces, bicameral legislature at centre. Rowlatt Act 1919 ('Black Act'): allowed detention without trial. Jallianwala Bagh Massacre April 13, 1919: General Dyer ordered firing on peaceful gathering, 1000+ killed. Hunter Committee report. Rabindranath Tagore returned knighthood.`
  },
  {
    id: 105, name: 'Gandhian Era and Struggle for Independence',
    notes: `Gandhi returns 1915. Champaran Satyagraha 1917 (indigo farmers), Kheda Satyagraha 1918, Ahmedabad Mill Strike 1918. Non-Cooperation Movement 1920-22: return of titles, boycott of courts/schools/elections, non-payment of taxes, Khilafat issue. Chauri Chaura incident Feb 5, 1922 - Gandhi withdraws. Simon Commission 1927 - 'Simon Go Back'. Nehru Report 1928. Lahore Session 1929 - Poorna Swaraj resolution, January 26 as Independence Day. Civil Disobedience Movement 1930: Dandi March March 12-April 6, 1930 (Gandhi walks 241 miles), salt tax. Gandhi-Irwin Pact March 5, 1931. Second Round Table Conference 1931. Poona Pact 1932: between Gandhi and Ambedkar on reserved seats. Quit India Movement 1942 (August 8): 'Do or Die', Congress leaders arrested, underground movement, Aruna Asaf Ali, Ram Manohar Lohia. INA trials 1945 sparked nationalist sentiment.`
  },
  {
    id: 106, name: 'Forward Bloc and The INA',
    notes: `Subhas Chandra Bose: elected INC president 1938, 1939 (defeated Pattabhi Sitaramayya supported by Gandhi). Resigned due to differences, formed Forward Bloc 1939. Escaped from India January 1941 ('Great Escape'). Met Hitler in Berlin. Reached Singapore 1943 via submarine. Indian National Army (INA/Azad Hind Fauj): originally formed by Mohan Singh in Singapore 1942 from Indian POWs after fall of Singapore. Rash Behari Bose organized Indian Independence League. Subhas Bose took command July 1943. Azad Hind Government formed October 21, 1943 in Singapore. INA motto: 'Ittehad, Itmad aur Qurbani' (Unity, Faith, Sacrifice). Women's regiment: Rani of Jhansi Regiment under Lakshmi Sehgal. March to Delhi: INA captured Kohima and Imphal (March 1944) but forced to retreat due to monsoon and British counteroffensive. Bose died in air crash August 18, 1945 in Taipei. INA trials at Red Fort 1945 - Shah Nawaz Khan, P.K. Sehgal, G.S. Dhillon. Nehru defended them.`
  },
  {
    id: 107, name: 'Independence and Partition of India',
    notes: `Cabinet Mission Plan May 1946: three-tier federal structure, Constituent Assembly. Congress and League interpretations differed. Direct Action Day August 16, 1946 - Great Calcutta Killings. Interim Government: Nehru as PM. Attlee's statement February 1947: British leaving India by June 1948. Mountbatten appointed Viceroy March 1947. Mountbatten Plan (June 3 Plan) June 3, 1947: partition of India, Punjab and Bengal to be partitioned, referendum in NWFP and Sylhet. Indian Independence Act July 18, 1947: two dominions - India and Pakistan. Independence: India August 15, 1947 at midnight, Pakistan August 14, 1947. Radcliffe Line divided Punjab and Bengal. Partition violence: 1 million dead, 12 million displaced. Gandhi's role during partition: worked in Noakhali, fasted for communal harmony. Assassination of Gandhi: January 30, 1948 by Nathuram Godse. Integration of Princely States: Sardar Patel ('Iron Man'). Hyderabad (Police Action September 1948), Junagadh, Kashmir (accession after Pakistani invasion).`
  },
  {
    id: 108, name: 'The First World War',
    notes: `Causes: Alliance system (Triple Alliance: Germany, Austria-Hungary, Italy vs Triple Entente: France, Russia, Britain), Imperialism (competition for colonies), Militarism (arms race, naval rivalry), Nationalism (Balkan crisis, Pan-Slavism). Immediate cause: Assassination of Archduke Franz Ferdinand of Austria-Hungary at Sarajevo, June 28, 1914 by Gavrilo Princip (Black Hand). War began August 1914. Western Front: trench warfare, Battle of the Marne, Battle of Somme, Battle of Verdun. Eastern Front: Russia vs Germany. Turkey enters on Germany's side. Gallipoli Campaign 1915. USA enters April 1917 after sinking of Lusitania and Zimmermann Telegram. Russian Revolution 1917 - Russia withdraws (Treaty of Brest-Litovsk 1918). German Spring Offensive 1918 fails. Armistice November 11, 1918. Paris Peace Conference 1919. Treaty of Versailles June 28, 1919: Germany's 'War Guilt' clause (Article 231), reparations £6600 million, loss of territory (Alsace-Lorraine to France, Polish Corridor), disarmament, League of Nations formed. Impact on India: Indian soldiers fought, economic hardship, inflation.`
  },
  {
    id: 109, name: 'Rise of Dictatorships',
    notes: `Fascism in Italy: Mussolini founded Fascist Party 1919. March on Rome October 1922. Il Duce. Abolished democratic institutions. Lateran Treaty 1929 (with Pope). Invaded Abyssinia 1935. Rome-Berlin Axis 1936. Anti-Comintern Pact 1936 (Germany, Italy, Japan). Nazism in Germany: Hitler joined German Workers' Party 1919, renamed NSDAP. Beer Hall Putsch 1923 (Munich). Mein Kampf written in prison. Great Depression 1929 brought Hitler to power. Became Chancellor January 30, 1933. Reichstag Fire February 1933. Enabling Act March 1933. Consolidated power: abolished trade unions, banned other parties, purged SA (Night of Long Knives June 1934). Became Fuehrer August 1934. Policies of Nazism: totalitarian state, racial purity, anti-Semitism (Nuremberg Laws 1935), lebensraum (living space), rearmament, remilitarization of Rhineland 1936. Kristallnacht November 1938. Impact: Jews persecuted, Holocaust, aggressive foreign policy.`
  },
  {
    id: 110, name: 'The Second World War',
    notes: `Causes: Failure of League of Nations, Policy of Appeasement (Munich Agreement 1938 - Neville Chamberlain), Hitler's aggressive expansion (Austria Anschluss March 1938, Sudetenland, Czechoslovakia, Poland). German-Soviet Non-Aggression Pact August 23, 1939. Germany invades Poland September 1, 1939. Britain and France declare war September 3, 1939. Fall of France June 1940. Battle of Britain (RAF vs Luftwaffe) 1940. Operation Barbarossa June 1941 (Germany invades USSR). Pearl Harbor December 7, 1941 - Japan attacks USA. USA enters war. Battle of Stalingrad 1942-43 (turning point on Eastern Front). Battle of El Alamein 1942 (North Africa). D-Day June 6, 1944 (Allied invasion of Normandy). Hitler's suicide April 30, 1945. Germany surrenders May 8, 1945 (V-E Day). Manhattan Project - atomic bombs dropped on Hiroshima (August 6) and Nagasaki (August 9) 1945. Japan surrenders August 15, 1945 (V-J Day). Consequences: UN formed, Cold War begins, decolonization, Marshall Plan, Iron Curtain, Nuremberg Trials.`
  },
  {
    id: 111, name: 'The United Nations',
    notes: `Atlantic Charter August 1941 (Roosevelt & Churchill) - principles of post-war world. United Nations Declaration January 1, 1942 (26 nations). San Francisco Conference April-June 1945. UN Charter signed June 26, 1945, came into force October 24, 1945 (UN Day). HQ: New York. Official languages: Arabic, Chinese, English, French, Russian, Spanish. Principal organs: General Assembly (all member states, each one vote, meets annually, admits new members, approves budget), Security Council (15 members: 5 permanent - USA, UK, France, Russia, China with veto power; 10 non-permanent elected for 2 years), Secretariat (Secretary General - administrative head, 5 year term), International Court of Justice (15 judges, The Hague, 9-year terms), Economic and Social Council (54 members, elected by GA), Trusteeship Council (suspended 1994). Specialized agencies: WHO (Geneva), UNESCO (Paris), UNICEF, ILO, FAO, World Bank, IMF, UNHCR. India's role in UN: founding member, peacekeeping operations.`
  },
  {
    id: 112, name: 'Non Aligned Movement',
    notes: `Background: Cold War between USA (NATO) and USSR (Warsaw Pact). Asian-African Conference (Bandung Conference) April 1955: 29 nations, Indonesia. Ten Principles of Bandung (Dasasila). Five Principles of Peaceful Co-existence (Panchsheel): signed by India (Nehru) and China (Zhou Enlai) 1954. Founding fathers: Jawaharlal Nehru (India), Gamal Abdel Nasser (Egypt), Josip Broz Tito (Yugoslavia), Kwame Nkrumah (Ghana), Sukarno (Indonesia). First NAM Summit: Belgrade 1961, 25 nations. Criteria for membership: independent foreign policy, support for liberation movements, no membership in military blocs, no bilateral military alliances with great powers. Objectives: maintain peace, disarmament, oppose colonialism, imperialism, racism, support newly independent nations, promote economic development. India's role: Nehru as main architect, concept of non-alignment, mediator between power blocs. Relevance today: 120+ member states, largest peace movement after UN.`
  },
  {
    id: 113, name: 'The Union Legislature',
    notes: `Parliament = Lok Sabha + Rajya Sabha + President. Lok Sabha (House of the People): Lower house, directly elected, max 552 members (530 states + 20 UTs + 2 Anglo-Indian nominated, now abolished), term 5 years, quorum 1/10. Speaker presides, Deputy Speaker. Money Bills originate only in Lok Sabha. Vote of no-confidence only in Lok Sabha. Rajya Sabha (Council of States): Upper house, permanent house (never dissolved), max 250 members (238 elected by state assemblies + 12 nominated by President for arts/science/literature/social service), one-third retire every 2 years, VP is ex-officio Chairman. Special powers: Article 249 (pass bill on State subject), Article 312 (create new All India Services). Qualification: Lok Sabha - 25 years, Rajya Sabha - 30 years, citizen of India. Sessions: Budget (Feb-May), Monsoon (July-Aug), Winter (Nov-Dec). Joint sitting: Article 108, presided by Speaker. Legislative procedure: Bills - Ordinary, Money, Constitutional Amendment. Constitutional Amendment: Article 368. Powers of Parliament: legislative, executive, judicial, financial, constituent, electoral.`
  },
  {
    id: 114, name: 'President and Vice President',
    notes: `President: Head of State, elected indirectly by Electoral College (elected members of both Houses of Parliament + elected members of all State Legislative Assemblies), proportional representation with single transferable vote. Term: 5 years, eligible for re-election. Qualifications: Indian citizen, 35 years, eligible for Lok Sabha, holds no office of profit. Oath administered by Chief Justice of India. Salary: Rs 5 lakh per month. Removal: Impeachment by Parliament (Article 61) - 2/3 majority of both houses. Executive powers: appoints PM, Council of Ministers, Governors, CJI, Judges, CAG, Election Commissioner, appoints PM when no clear majority. Legislative powers: summons/prorogues/dissolves Parliament, addresses Parliament, nominates 12 RS members + 2 LS Anglo-Indians, returns bills (except Money Bills), gives assent to bills, promulgates ordinances (Article 123). Emergency powers: National Emergency (Article 352), State Emergency/President's Rule (Article 356), Financial Emergency (Article 360). Veto powers: absolute, suspensive, pocket veto. Vice President: elected by both Houses of Parliament (all members), serves as ex-officio Chairman of Rajya Sabha, acts as President when President is unable to perform duties, term 5 years.`
  },
  {
    id: 115, name: 'Prime Minister and Council of Ministers',
    notes: `Prime Minister: Head of Government, leader of majority party in Lok Sabha, appointed by President. Qualifications: must be member of Parliament (can be from either house), citizen of India. Powers and functions: heads Council of Ministers, advises President on appointments (Governors, Ambassadors, CJI), links Cabinet with President (Article 78), chief spokesperson of government, chairs Cabinet meetings, can recommend dissolution of Lok Sabha. Council of Ministers: three categories - Cabinet Ministers (senior, attend cabinet meetings), Ministers of State (independent charge or attached), Deputy Ministers. Collective responsibility: Article 75(3) - all ministers collectively responsible to Lok Sabha. If no-confidence motion passed, entire council resigns. Individual responsibility: each minister responsible for their ministry. PM's relationship with President: PM is real executive, President is constitutional/nominal head. PM can be from Rajya Sabha (rare). Coalition governments. Article 74: Council of Ministers to aid and advise President. Article 75: PM appointed by President, other ministers appointed by President on PM's advice.`
  },
  {
    id: 116, name: 'The Supreme Court',
    notes: `Established: January 28, 1950. Location: New Delhi. Composition: Chief Justice of India + up to 33 other judges (total 34). Appointment: by President in consultation with collegium (CJI + 4 senior-most judges). Qualifications: Indian citizen, High Court judge for 5 years or advocate of HC for 10 years, distinguished jurist. Term: until age 65. Removal: by President after address by 2/3 majority of each house in same session (Article 124). First CJI: H.J. Kania. Original Jurisdiction (Article 131): disputes between Centre-State, inter-state disputes. Writ Jurisdiction (Article 32): Habeas Corpus, Mandamus, Prohibition, Certiorari, Quo Warranto - protects Fundamental Rights. Appellate Jurisdiction (Article 132-134): constitutional matters (certificate from HC), civil and criminal matters. Advisory Jurisdiction (Article 143): President can seek opinion. Review Jurisdiction: can review its own judgments. Court of Record: judgments have precedent value, can punish for contempt. Independence: security of tenure, charged from Consolidated Fund, can't practice after retirement. PIL (Public Interest Litigation). Doctrine of Basic Structure (Kesavananda Bharati case 1973).`
  },
  {
    id: 117, name: 'High Court and Subordinate Courts',
    notes: `High Court: highest court in each state. Established under Article 214. First HC: Calcutta HC 1862 (also Bombay and Madras). Composition: Chief Justice + other judges appointed by President in consultation with CJI and State Governor. Qualifications: Indian citizen, 10 years as HC advocate or 10 years as judicial officer. Term: until age 62. Removal: same as Supreme Court. Jurisdiction: Original (cases of civil and criminal nature, writ jurisdiction for FR and other rights - Article 226), Appellate (appeals from subordinate courts), Supervisory (Article 227 - superintendence over all subordinate courts), Administrative (appointment/posting of district judges). Court of Record: decisions binding on subordinate courts. Subordinate Courts: District Court (sessions court - criminal, district court - civil), presided by District Judge (senior judicial officer of district). Munsiff's Court / Civil Judge Court (civil cases), Chief Judicial Magistrate / Judicial Magistrate (criminal cases). Nyaya Panchayats / Lok Adalats (alternative dispute resolution).`
  },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getExistingQuestions(chapterId) {
  const { data } = await supabase
    .from('questions')
    .select('question, type')
    .eq('subject', 'history_civics')
    .eq('chapter_id', chapterId)
    .limit(200);
  return data || [];
}

async function generateQuestionsForChapter(chapter, existingQuestions) {
  const existingList = existingQuestions
    .slice(0, 40)
    .map((q, i) => `${i + 1}. [${q.type}] ${q.question}`)
    .join('\n');

  const isHistory = chapter.id <= 112;
  const isCivics = chapter.id >= 113;

  const prompt = `You are an ICSE Grade 10 ${isHistory ? 'History' : 'Civics'} teacher creating exam questions for the chapter: "${chapter.name}".

CHAPTER CONTENT SUMMARY:
${chapter.notes}

EXISTING QUESTIONS (DO NOT DUPLICATE THESE):
${existingList}

PAPER PATTERN (ICSE History & Civics):
- MCQs test specific facts, dates, names, terms
- Short answers (2-3 marks): "What", "Why", "Name", "State", "Mention" - 3-5 sentences
- Long answers (5-8 marks): "Discuss", "Explain in detail", "Analyse", "Describe" - comprehensive multi-point answers
- Include cause-effect, significance, comparison, and implied/application questions

GENERATE EXACTLY:
- 10 MCQ (multiple choice, 4 options a/b/c/d)
- 8 short_answer (2-3 mark level, model answer 3-5 sentences)
- 5 long_answer (5-8 mark level, model answer 6-10 sentences covering multiple points)

REQUIREMENTS:
1. DO NOT repeat any existing questions
2. Make at least 3 MCQs and 2 short answers HARDER than typical (test deeper understanding, lesser-known facts, implications)
3. Include at least 2 "implied/application" questions (e.g., "Why did X lead to Y?", "What would have happened if...?", "How did X contribute to...")
4. Long answers must be comprehensive, covering multiple aspects
5. Short answer model answers must be complete 3-5 sentences
6. Long answer model answers must be 6-10 sentences with specific points
7. For Civics: ensure answers cite specific Articles, constitutional provisions, and technical terms

Respond ONLY with valid JSON (no markdown):
{
  "mcq": [
    {"question": "...", "options": {"a":"...","b":"...","c":"...","d":"..."}, "answer": "a", "explanation": "..."}
  ],
  "short_answer": [
    {"question": "...", "answer": "..."}
  ],
  "long_answer": [
    {"question": "...", "answer": "..."}
  ]
}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content[0].text.trim();
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  try {
    return JSON.parse(jsonText);
  } catch (err) {
    console.error(`  [ERROR] JSON parse failed: ${err.message}`);
    console.error('  Snippet:', rawText.slice(0, 200));
    return null;
  }
}

async function uploadQuestions(chapter, questions) {
  const timestamp = Date.now();
  const rows = [];

  const addRows = (arr, type) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((q, i) => {
      rows.push({
        id: `ai_hc_ch${chapter.id}_${type.slice(0,2)}_${i + 1}_${timestamp}`,
        subject: 'history_civics',
        chapter_id: chapter.id,
        chapter_name: chapter.name,
        type,
        question: q.question,
        options: q.options || {},
        answer: q.answer,
        explanation: q.explanation || null,
        skill: chapter.name,
        year_tag: 'AI Generated',
      });
    });
  };

  addRows(questions.mcq, 'mcq');
  addRows(questions.short_answer, 'short_answer');
  addRows(questions.long_answer, 'long_answer');

  if (rows.length === 0) { console.error('  No rows to upload'); return 0; }

  const { error } = await supabase.from('questions').upsert(rows, { onConflict: 'id' });
  if (error) { console.error('  Supabase error:', error.message); return 0; }
  return rows.length;
}

async function main() {
  console.log('Generating History & Civics AI questions...\n');
  let totalUploaded = 0;

  for (const chapter of CHAPTERS) {
    console.log(`\nCh${chapter.id}: ${chapter.name}`);

    const existing = await getExistingQuestions(chapter.id);
    console.log(`  Existing: ${existing.length} questions`);

    let questions;
    try {
      questions = await generateQuestionsForChapter(chapter, existing);
    } catch (err) {
      console.error(`  API error: ${err.message}`);
      await sleep(5000);
      continue;
    }

    if (!questions) { console.log('  Skipping.'); continue; }

    const mcqCount = questions.mcq?.length || 0;
    const saCount = questions.short_answer?.length || 0;
    const laCount = questions.long_answer?.length || 0;
    console.log(`  Generated: ${mcqCount} MCQ + ${saCount} SA + ${laCount} LA`);

    const uploaded = await uploadQuestions(chapter, questions);
    totalUploaded += uploaded;
    console.log(`  Uploaded: ${uploaded} questions`);

    await sleep(2000);
  }

  console.log(`\nDone! Total uploaded: ${totalUploaded} questions`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
