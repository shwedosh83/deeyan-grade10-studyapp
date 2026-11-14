import { admin, anthropic, SCAN_MODEL } from './_boardLib.js';

// POST { paperId, imageBase64, mediaType }   (one page image per call; the browser downsizes to ~1600px JPEG first)
//   -> { answers:[{ q_label, text, confidence }], unmapped:[{ text, note }], pageNote }
// The student reviews and corrects this text in the app BEFORE it is marked. Nothing is graded here.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { paperId, imageBase64, mediaType = 'image/jpeg' } = req.body || {};
    if (!paperId || !imageBase64) return res.status(400).json({ error: 'paperId and imageBase64 required' });
    if (imageBase64.length > 4_200_000) return res.status(413).json({ error: 'Image too large; shrink it and try again.' });

    const { data: qs, error } = await admin.from('board_questions').select('q_label,q_main,section,type,marks,question').eq('paper_id', paperId).order('q_order');
    if (error) throw error;
    const labels = qs.map(q => `${q.q_label} [${q.marks}m, ${q.type}] ${String(q.question).replace(/\s+/g, ' ').slice(0, 90)}`).join('\n');

    const prompt = `This is one page of a student's HANDWRITTEN answer sheet for an ICSE board paper. Transcribe the answers and map each to the question it answers.

The paper's questions (label [marks, type] start of question):
${labels}

Instructions:
- Students write the question number in the margin or at the start of each answer (for example "3 (ii)", "Q5 b", "7.a"). Match it to the nearest label above. Use the exact label string from the list.
- For multiple-choice, return only what the student wrote (a letter and/or option text).
- Keep the student's own wording, including mistakes. Do NOT correct, complete or improve anything. Transcribe numericals with their working, one step per line.
- If you cannot read a word, write [illegible]. If a diagram is drawn, write [diagram: short description of what it shows and any labels].
- If an answer continues from a previous page without a number, put it under "unmapped".
- confidence: "high", "medium" or "low" for how sure you are of both the reading and the question number.

Respond ONLY with JSON: {"answers":[{"q_label":"...","text":"...","confidence":"high"}],"unmapped":[{"text":"...","note":"..."}],"pageNote":"anything unusual about this page"}`;

    const msg = await anthropic.messages.create({
      model: SCAN_MODEL, max_tokens: 6000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: prompt },
      ] }],
    });
    const text = msg.content.map(b => b.text || '').join('');
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
    const valid = new Set(qs.map(q => q.q_label));
    const answers = (j.answers || []).filter(a => valid.has(String(a.q_label).replace(/\s+/g, '')) || valid.has(a.q_label))
      .map(a => ({ ...a, q_label: valid.has(a.q_label) ? a.q_label : String(a.q_label).replace(/\s+/g, '') }));
    const unknown = (j.answers || []).filter(a => !answers.includes(a)).map(a => ({ text: a.text, note: `Could not match question "${a.q_label}"` }));
    return res.json({ answers, unmapped: [...(j.unmapped || []), ...unknown], pageNote: j.pageNote || '' });
  } catch (e) {
    console.error('boardScan', e.message || e);
    return res.status(500).json({ error: 'Could not read this page. Check the photo is sharp and well lit, then try again.' });
  }
}
