const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skillScores, weekStart, totalQuestions, correctAnswers } = req.body;

  if (!skillScores || skillScores.length === 0) {
    return res.status(400).json({ error: 'No skill data provided' });
  }

  const overallAccuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  const skillsText = skillScores
    .map((s) => {
      const acc = Math.round((s.correct_attempts / s.total_attempts) * 100);
      return `  - ${s.skill} (${s.chapter_name}): ${acc}% (${s.correct_attempts}/${s.total_attempts})`;
    })
    .join('\n');

  const weakSkills = skillScores
    .filter((s) => s.total_attempts >= 3)
    .sort((a, b) => a.correct_attempts / a.total_attempts - b.correct_attempts / b.total_attempts)
    .slice(0, 3).map((s) => s.skill);

  const strongSkills = skillScores
    .filter((s) => s.total_attempts >= 3)
    .sort((a, b) => b.correct_attempts / b.total_attempts - a.correct_attempts / a.total_attempts)
    .slice(0, 2).map((s) => s.skill);

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{
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
      }],
    });
    res.json({ summary: message.content[0].text });
  } catch (error) {
    console.error('Summary error:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};
