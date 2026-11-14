const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skillScores = [], weekStart, totalQuestions, correctAnswers, subject = 'biology' } = req.body;

  // Need at least some session data to generate a useful summary
  if (!totalQuestions || totalQuestions === 0) {
    return res.status(400).json({ error: 'No quiz activity this week yet. Complete some quizzes first!' });
  }

  const overallAccuracy = Math.round((correctAnswers / totalQuestions) * 100);

  const hasSkillData = skillScores.length > 0;

  const skillsText = hasSkillData
    ? skillScores
        .map((s) => {
          const acc = s.total_attempts > 0 ? Math.round((s.correct_attempts / s.total_attempts) * 100) : 0;
          return `  - ${s.skill}${s.chapter_name ? ` (${s.chapter_name})` : ''}: ${acc}% (${s.correct_attempts}/${s.total_attempts})`;
        })
        .join('\n')
    : '  No skill breakdown available yet.';

  const weakSkills = hasSkillData
    ? skillScores
        .filter((s) => s.total_attempts >= 3)
        .sort((a, b) => a.correct_attempts / a.total_attempts - b.correct_attempts / b.total_attempts)
        .slice(0, 3).map((s) => s.skill)
    : [];

  const strongSkills = hasSkillData
    ? skillScores
        .filter((s) => s.total_attempts >= 3)
        .sort((a, b) => b.correct_attempts / b.total_attempts - a.correct_attempts / a.total_attempts)
        .slice(0, 2).map((s) => s.skill)
    : [];

  // Capitalise subject label nicely
  const subjectLabel = subject.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Write a weekly ${subjectLabel} study summary for Deeyan, a grade 10 ICSE student.

Week of: ${weekStart}
Overall: ${correctAnswers}/${totalQuestions} correct (${overallAccuracy}%)
${hasSkillData ? `\nSkill breakdown:\n${skillsText}\n\nStrongest topics: ${strongSkills.join(', ') || 'keep practicing'}\nNeeds work: ${weakSkills.join(', ') || 'keep practicing'}` : ''}

Write a 4-5 sentence summary that:
1. Acknowledges his overall performance warmly (use the actual score)
2. ${hasSkillData && strongSkills.length > 0 ? 'Celebrates his strongest topics' : 'Encourages the effort shown this week'}
3. ${hasSkillData && weakSkills.length > 0 ? 'Identifies the 2-3 weakest areas to focus on' : 'Encourages consistency and keeping up the practice'}
4. Gives one specific, actionable study tip for ${subjectLabel}
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
