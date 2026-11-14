const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static require so Vercel's file tracer bundles it — one JSON file, keyed by
// chapter_id, holding OCR'd Selina textbook text per chapter (see
// backend/scripts/ocrTextbook.py + backend/scripts/buildTextbookIndex.js).
// Only biology has textbook data today; other subjects fall back to
// model-answer-only grading same as before.
let TEXTBOOK = {};
try {
  TEXTBOOK = require('../backend/data/textbook/biology.json');
} catch {
  // No textbook index built yet — evaluator still works, just ungrounded.
}

// ── Per-subject evaluator context ────────────────────────────────────────────

const SUBJECT_CONTEXT = {
  biology: {
    tutor: 'ICSE Biology tutor',
    leniencies: `- Accept scientific synonyms and lay terms (e.g. "food pipe" for "oesophagus")
- Accept partial scientific names or common names for organisms
- Accept paraphrased descriptions of biological processes — exact textbook wording is NOT required
- Credit answers that show correct understanding even if they omit minor technical details
- Accept rough descriptions for diagram/structure questions if the concept is correct
- Do NOT penalise for British vs American spellings ("haemoglobin" vs "hemoglobin")
- A brief but accurate answer can still be "correct" — length alone is not a criterion`,
  },

  history_civics: {
    tutor: 'ICSE History & Civics tutor',
    leniencies: `- Accept alternate spellings of historical names (e.g. "Gandhiji", "Gandhi" — all valid)
- Accept approximate dates within ±1 year
- Accept points in any order — order doesn't matter in history answers
- A student does NOT need to reproduce the exact model answer; credit any historically accurate point
- For Civics: accept lay descriptions of constitutional provisions`,
  },

  chemistry: {
    tutor: 'ICSE Chemistry tutor',
    leniencies: `- Accept correct chemical names even if the formula is slightly wrong (credit the concept)
- Accept balanced equations with minor coefficient errors if the reactants/products are right
- Accept lay descriptions of reactions if chemically accurate ("the metal reacts with acid to give hydrogen")
- Accept alternate naming conventions (IUPAC vs common name) — credit either
- Do not penalise minor state symbol omissions if the chemistry is correct
- A brief but chemically accurate answer can still be "correct"`,
  },

  physics: {
    tutor: 'ICSE Physics tutor',
    leniencies: `- Accept correct concept explanations even if the formula is not written (credit understanding)
- Accept approximate numerical answers within ±5% for calculation questions
- Accept lay descriptions of physical phenomena if accurate ("light bends when entering glass")
- Accept unit variations (m/s and ms⁻¹ are equivalent) — do not penalise for unit format
- Credit diagram descriptions if the concept is demonstrated correctly
- Do not penalise for minor formula rearrangement errors if the method is correct`,
  },

  geography: {
    tutor: 'ICSE Geography tutor',
    leniencies: `- Accept approximate figures and statistics — exact numbers are not required
- Accept alternate spellings of Indian place names and river names
- Accept points in any order for map/region questions
- Credit answers that describe the concept accurately even without technical geography terms
- Accept "India-centric" explanations even if they don't use the exact textbook language
- A concise but accurate answer can still be "correct"`,
  },

  english_literature: {
    tutor: 'ICSE English Literature tutor',
    leniencies: `- Accept paraphrases of quotes — students do NOT need to recall exact wording
- Accept any relevant character detail, theme, or plot point that shows understanding
- Accept indirect references to the text ("when Antony spoke to the crowd" is valid even without citing Act/Scene)
- Credit any interpretation that is textually supportable, even if different from the model answer
- For poem questions: accept any valid identification of figure of speech; exact terminology (metaphor vs simile) matters less than explanation of effect
- For character questions: credit any valid character trait with supporting evidence
- Length is NOT a criterion — a concise insightful answer scores as well as a long one`,
  },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    question, modelAnswer, studentAnswer, skill, type, marks = 2, subject = 'biology',
    chapterId,
  } = req.body;

  if (!studentAnswer || studentAnswer.trim().length === 0) {
    return res.status(400).json({ error: 'No answer provided' });
  }

  const ctx = SUBJECT_CONTEXT[subject] || SUBJECT_CONTEXT.biology;
  const textbookChapter = subject === 'biology' && chapterId != null ? TEXTBOOK[String(chapterId)] : null;

  const marksGuide = marks >= 4
    ? `This is a ${marks}-mark answer. Break the model answer down into the ${marks} distinct points/facts an examiner would expect. Check each one off against the student's answer.`
    : `This is a ${marks}-mark answer. Break the model answer down into the ${marks} distinct point(s)/fact(s) an examiner would expect. Check each one off against the student's answer.`;

  // ── System prompt: split into stable blocks so repeated calls within the
  // same subject/chapter hit Anthropic's prompt cache instead of re-billing
  // full price every question. Block order matters — most stable first.
  const system = [
    {
      type: 'text',
      text: `You are an ${ctx.tutor} evaluating a grade 10 student's answer.
Key leniencies for this subject:
${ctx.leniencies}

HOW TO SCORE — this is a coverage check, not a pass/fail judgement:
1. List the distinct required points from the Model Answer (concepts/facts, not exact wording).
2. Decide which of those points the student's answer already covers — accept synonyms, paraphrasing, lay terms; a point is "covered" if the student clearly demonstrates that understanding, even briefly.
3. Compute percentCovered = (points covered / total required points) * 100, rounded to the nearest 10.
4. Anything covered is DONE — never repeat it back to the student as feedback. Only surface what's genuinely still missing.
5. If the student's answer contains a factual error (not just an omission), call it out specifically in missingPoints instead of just noting an absence.
${textbookChapter ? '6. A reference textbook excerpt is provided below (in a separate block) — treat it as the authoritative source for facts and terminology. If the Model Answer is thinner than the textbook on a point, still credit the student for matching the textbook even if that phrasing isn\'t in the Model Answer. If the Model Answer conflicts with the textbook, trust the textbook.' : ''}

Derive "score" and "result" directly from percentCovered — do not judge independently:
- percentCovered >= 80  → result "correct",   score 1
- percentCovered 40-79  → result "partial",   score 0.5
- percentCovered < 40   → result "incorrect", score 0
(Round score to the nearest of 0, 0.5, 1 using these bands — do not use other values.)

Respond ONLY with valid JSON:
{
  "result": "correct" | "partial" | "incorrect",
  "score": 1 | 0.5 | 0,
  "percentCovered": <number 0-100, multiple of 10>,
  "missingPoints": [<short strings — ONLY the specific point(s)/fact(s) the student did NOT cover or got wrong; empty array if percentCovered is 100>],
  "feedback": "One short encouraging sentence. Do NOT restate what was correct or list missing points here — that goes in missingPoints."
}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  if (textbookChapter) {
    system.push({
      type: 'text',
      text: `Reference textbook — ${textbookChapter.source}, Chapter: ${textbookChapter.chapter_name} (${textbookChapter.selina_title}):
"""
${textbookChapter.text}
"""`,
      cache_control: { type: 'ephemeral' },
    });
  }

  const userPrompt = `Question: ${question}
Topic: ${skill}
${marksGuide}

Model Answer: ${modelAnswer}
Deeyan's Answer: ${studentAnswer}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    const parsed = JSON.parse(jsonMatch[0]);
    // Defensive defaults in case the model omits a field
    if (!Array.isArray(parsed.missingPoints)) parsed.missingPoints = [];
    if (typeof parsed.percentCovered !== 'number') {
      parsed.percentCovered = parsed.score === 1 ? 100 : parsed.score === 0.5 ? 60 : 0;
    }
    res.json(parsed);
  } catch (error) {
    console.error('Evaluate error:', error.message);
    res.status(500).json({ error: 'Failed to evaluate answer' });
  }
};
