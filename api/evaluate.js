const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, modelAnswer, studentAnswer, skill, type, marks = 2, subject = 'biology' } = req.body;

  if (!studentAnswer || studentAnswer.trim().length === 0) {
    return res.status(400).json({ error: 'No answer provided' });
  }

  const isHistory = subject === 'history_civics';

  const marksGuide = isHistory
    ? marks >= 4
      ? `This is a ${marks}-mark answer. Expect ${marks} distinct, well-explained points covering key events, acts, people, or consequences. Accept approximate dates (±1 year) and alternate spellings of historical names.`
      : `This is a ${marks}-mark answer. Expect ${marks} clear, relevant points. Accept paraphrasing of historical facts, alternate name spellings, and approximate dates.`
    : marks >= 4
      ? `This is a ${marks}-mark answer. Expect a detailed explanation with ${marks} distinct points: the main concept, mechanism or process, and supporting biological details. A well-explained answer covering most key points should be "correct".`
      : `This is a ${marks}-mark answer. Expect ${marks} clear biological points or one solid explanation of the core concept. If the student clearly understands the concept, mark as "correct" even if phrasing is imperfect.`;

  const subjectContext = isHistory
    ? `You are an ICSE History & Civics tutor evaluating a grade 10 student's answer.
Key leniencies for History & Civics:
- Accept alternate spellings of historical names (e.g. "Gandhiji", "Gandhi", "M.K. Gandhi" all valid)
- Accept approximate dates within ±1 year
- Accept points in any order — order doesn't matter in history answers
- A student does NOT need to reproduce the exact model answer; credit any historically accurate point
- For Civics: accept lay descriptions of constitutional provisions (e.g. "the court can cancel laws" for "judicial review")`
    : `You are an ICSE Biology tutor evaluating a grade 10 student's answer.
Key leniencies for Biology:
- Accept scientific synonyms and lay terms (e.g. "food pipe" for "oesophagus", "windpipe" for "trachea")
- Accept partial scientific names or common names for organisms
- Accept paraphrased descriptions of biological processes — exact textbook wording is NOT required
- Credit answers that show correct understanding even if they omit minor technical details
- For diagrams/structure questions: accept rough descriptions if the concept is correct
- Do NOT penalise for British vs American spellings (e.g. "haemoglobin" vs "hemoglobin")
- A brief but accurate answer can still be "correct" — length alone is not a criterion`;

  const prompt = `${subjectContext}

Question: ${question}
Topic: ${skill}
${marksGuide}

Model Answer: ${modelAnswer}
Deeyan's Answer: ${studentAnswer}

EVALUATION RULES — be generous, not strict:
- "correct" (score 1): Student demonstrates understanding of the required number of points/concepts. Accept synonyms, paraphrasing, lay terms. Does NOT need to match the model answer word-for-word.
- "partial" (score 0.5): Student has some correct points but is clearly missing ${Math.ceil(marks / 2)} or more required points, or has a significant factual error alongside correct content.
- "incorrect" (score 0): ONLY if the answer shows fundamental misunderstanding, is factually wrong throughout, or is completely off-topic. Do NOT use just because the answer is brief.

When in doubt between "correct" and "partial", choose "correct".
When in doubt between "partial" and "incorrect", choose "partial".

Respond ONLY with valid JSON:
{
  "result": "correct" | "partial" | "incorrect",
  "score": 1 | 0.5 | 0,
  "feedback": "2-3 sentences: acknowledge what was right, note what key point(s) were missing if partial/incorrect, and reinforce the concept."
}`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('Evaluate error:', error.message);
    res.status(500).json({ error: 'Failed to evaluate answer' });
  }
};
