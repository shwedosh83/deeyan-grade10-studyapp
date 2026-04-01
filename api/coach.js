import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STUDY_BUDDY_SYSTEM = `You are an AI coach for a Grade 10 ICSE student.
Your personality: warm, encouraging, direct. Like a good coach — you push them forward, celebrate progress, and point out what needs work without being harsh.
Use the student's name. Be specific — mention actual topic names and numbers. Use an emoji or two naturally.
Keep it SHORT — max 2-3 sentences. No bullet points. No headers. Sound human, not robotic.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, data } = req.body;

  try {
    let prompt = '';

    if (type === 'daily_message') {
      const { weakSkills, daysSinceSession, totalDone, subject, firstName } = data;
      const name = firstName || 'there';

      if (totalDone === 0) {
        prompt = `${name} just joined and hasn't done any questions yet in ${subject}. Give them a warm, encouraging coach's message to get started. 1-2 sentences.`;
      } else if (daysSinceSession > 3) {
        prompt = `${name} hasn't studied ${subject} in ${daysSinceSession} days. Their weakest skill is "${weakSkills[0]?.skill}" at ${weakSkills[0]?.accuracy}% accuracy. Give a coach's nudge to get back on track — firm but warm. 2 sentences max.`;
      } else if (weakSkills.length > 0) {
        const weak = weakSkills[0];
        prompt = `${name} has been studying ${subject}. Their biggest gap right now is "${weak.skill}" at ${weak.accuracy}% accuracy (from ${weak.chapter_name}). Give a focused coaching message — acknowledge progress, then direct them to work on this weak area today. 2 sentences max.`;
      } else {
        prompt = `${name} is doing great in ${subject} with ${totalDone} questions done. Give a short coach's message celebrating their progress and encouraging them to keep the momentum. 1-2 sentences.`;
      }
    }

    else if (type === 'debrief') {
      const { results, subject } = data;
      const correct = results.filter(r => r.isCorrect).length;
      const total = results.length;
      const pct = Math.round((correct / total) * 100);
      const wrongOnes = results.filter(r => !r.isCorrect);
      const wrongSkills = [...new Set(wrongOnes.map(r => r.question?.skill).filter(Boolean))];
      const wrongTopics = wrongOnes.map(r => r.question?.chapter_name).filter(Boolean);
      const topWrongTopic = wrongTopics.length > 0
        ? Object.entries(wrongTopics.reduce((acc, t) => { acc[t] = (acc[t]||0)+1; return acc; }, {}))
            .sort((a,b) => b[1]-a[1])[0][0]
        : null;

      prompt = `A student just finished a ${subject} quiz: ${correct}/${total} (${pct}%).
Wrong answers were mostly in: ${wrongSkills.slice(0,3).join(', ') || 'various topics'}.
${topWrongTopic ? `They struggled most with ${topWrongTopic}.` : ''}

Give a short, casual Study Buddy debrief:
- 1 sentence acknowledging the score (positive if >60%, honest but encouraging if <60%)
- 1 sentence pointing out the main gap / pattern you noticed
- 1 sentence of specific advice (a memory tip, what to review, etc.)

Be specific. Use emojis. Sound like a peer, not a teacher. Max 3 sentences total.`;
    }

    else if (type === 'hint') {
      const { question, correctAnswer, subject, skill } = data;
      prompt = `A student is answering this ${subject} question and got it wrong:
"${question}"

The correct answer is: "${correctAnswer?.slice(0, 200)}"

Give a SHORT hint to help them think in the right direction — DO NOT give the answer away.
1-2 sentences. Casual tone. Point them toward the key concept they're missing.
Use an emoji. Sound like a helpful study buddy, not a textbook.`;
    }

    else {
      return res.status(400).json({ error: 'Unknown type' });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: STUDY_BUDDY_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const message = response.content[0].text.trim();
    return res.status(200).json({ message });

  } catch (err) {
    console.error('Coach API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
