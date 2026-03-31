const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, options, correctAnswer, userAnswer, skill, questionType, evaluationResult, evaluationFeedback } = req.body;

  let prompt;

  if (questionType === 'mcq') {
    const optionsText = options ? `a) ${options.a}\nb) ${options.b}\nc) ${options.c}\nd) ${options.d}` : '';
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
};
