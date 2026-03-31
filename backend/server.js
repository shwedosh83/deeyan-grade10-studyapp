const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:5175'] }));
app.use(express.json());

// Serve built frontend in production
if (isProd) {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/explain — Claude explains a question answer
app.post('/api/explain', async (req, res) => {
  const { question, options, correctAnswer, userAnswer, skill, questionType, evaluationResult, evaluationFeedback } = req.body;

  let prompt;

  if (questionType === 'mcq') {
    const optionsText = options
      ? `a) ${options.a}\nb) ${options.b}\nc) ${options.c}\nd) ${options.d}`
      : '';
    const correctText = options ? options[correctAnswer] : correctAnswer;
    const userText = userAnswer && options ? options[userAnswer] : userAnswer;
    const wasWrong = userAnswer && userAnswer !== correctAnswer;

    prompt = `You are a biology tutor helping Deeyan, a grade 10 student.

Question: ${question}
${optionsText}

Correct Answer: ${correctText}
${wasWrong ? `Deeyan answered: ${userText} (incorrect)` : 'Deeyan got this correct!'}
Topic: ${skill}

Give a clear, concise explanation (3-5 sentences) of why the correct answer is right.
${wasWrong ? "Briefly explain why his choice was wrong and what the key difference is." : "Reinforce why this is correct and share one interesting detail about it."}
Use simple language for a 10th grader. No markdown formatting, just plain text.`;

  } else {
    // Short / long answer — use evaluation context for a targeted explanation
    const resultLabel = evaluationResult === 'correct' ? 'correct'
      : evaluationResult === 'partial' ? 'partially correct'
      : evaluationResult === 'incorrect' ? 'incorrect'
      : 'attempted';

    prompt = `You are a biology tutor helping Deeyan, a grade 10 student.

Question: ${question}
Topic: ${skill}

Deeyan's answer (marked ${resultLabel}): "${userAnswer}"
Model answer: "${correctAnswer}"
${evaluationFeedback ? `Initial feedback given: "${evaluationFeedback}"` : ''}

Your job is to give Deeyan a clear, educational explanation that helps him truly understand this topic. Do NOT just repeat the feedback already given.

${evaluationResult === 'correct'
  ? 'He got this right! Reinforce his understanding by explaining the underlying biology in a bit more depth — add one interesting or useful detail he can remember.'
  : evaluationResult === 'partial'
  ? 'He had the right idea but missed something. Clearly explain what he got right, what the missing piece is, and why that piece matters biologically.'
  : 'He got this wrong. Be encouraging but clear — explain the correct concept from scratch in simple terms, and help him understand why the model answer is right.'
}

Write 3-5 sentences. Use simple language for a 10th grader. No markdown, just plain text.`;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ explanation: message.content[0].text });
  } catch (error) {
    console.error('Explain error:', error.message);
    res.status(500).json({ error: 'Failed to get explanation' });
  }
});

// POST /api/summary — Claude generates weekly performance summary
app.post('/api/summary', async (req, res) => {
  const { skillScores, weekStart, totalQuestions, correctAnswers } = req.body;

  if (!skillScores || skillScores.length === 0) {
    return res.status(400).json({ error: 'No skill data provided' });
  }

  const overallAccuracy =
    totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  const skillsText = skillScores
    .map((s) => {
      const acc = Math.round((s.correct_attempts / s.total_attempts) * 100);
      return `  - ${s.skill} (${s.chapter_name}): ${acc}% (${s.correct_attempts}/${s.total_attempts})`;
    })
    .join('\n');

  const weakSkills = skillScores
    .filter((s) => s.total_attempts >= 3)
    .sort((a, b) => a.correct_attempts / a.total_attempts - b.correct_attempts / b.total_attempts)
    .slice(0, 3)
    .map((s) => s.skill);

  const strongSkills = skillScores
    .filter((s) => s.total_attempts >= 3)
    .sort((a, b) => b.correct_attempts / b.total_attempts - a.correct_attempts / a.total_attempts)
    .slice(0, 2)
    .map((s) => s.skill);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `Write a weekly biology study summary for Deeyan, a grade 10 student.

Week of: ${weekStart}
Overall: ${correctAnswers}/${totalQuestions} correct (${overallAccuracy}%)

Skill breakdown:
${skillsText}

Strongest topics: ${strongSkills.join(', ') || 'none yet'}
Needs work: ${weakSkills.join(', ') || 'keep practicing'}

Write a 4-5 sentence summary that:
1. Acknowledges his overall performance warmly
2. Celebrates his strongest topics
3. Identifies the 2-3 weakest areas to focus on next week
4. Gives one specific, actionable study tip
5. Ends with encouragement

Tone: friendly, motivating, like a supportive tutor. No markdown, plain text only.`,
        },
      ],
    });

    res.json({ summary: message.content[0].text });
  } catch (error) {
    console.error('Summary error:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// POST /api/evaluate — Claude evaluates a short/long answer
app.post('/api/evaluate', async (req, res) => {
  const { question, modelAnswer, studentAnswer, skill, type, marks = 2, subject = 'biology' } = req.body;

  if (!studentAnswer || studentAnswer.trim().length === 0) {
    return res.status(400).json({ error: 'No answer provided' });
  }

  const isHistory = subject === 'history_civics';
  const isLong = type === 'long_answer' || marks >= 4;

  // Build marks-calibrated expectation string
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
});

// Catch-all: serve React app for all non-API routes (client-side routing)
if (isProd) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
