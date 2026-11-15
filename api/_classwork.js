import { admin } from './_boardLib.js';
import { evaluateUpload } from './_classworkEval.js';

// School class tests and worksheets.
// POST { action, userId, ... }
//   sign   { userId, name }                         -> signed upload URL for one file in the private `classwork` bucket
//   create { userId, subject, kind, title, test_date, marks_scored, marks_max, note, files[] } -> the new upload row (status pending)
//   list   { userId }                                -> uploads (newest first) + per-subject chapter results from marked tests
//   delete   { userId, id }                          -> removes an upload that hasn't been marked, and its files
//   evaluate { userId, id }                          -> marks it with Claude (1-3 min) and returns the updated upload
//   get      { userId, id }                          -> one upload with its evaluation
const BUCKET = 'classwork';
const KINDS = ['class_test', 'worksheet', 'other'];
const safeName = n => String(n || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
const missingTable = e => /classwork_(uploads|results)/.test(e?.message || '') && /(does not exist|schema cache|Could not find)/i.test(e?.message || '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    if (action === 'sign') {
      const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName(req.body.name)}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return res.json({ path, token: data.token, signedUrl: data.signedUrl });
    }

    if (action === 'create') {
      const b = req.body;
      const files = (b.files || []).filter(f => typeof f?.path === 'string' && f.path.startsWith(`${userId}/`));
      if (!b.subject) return res.status(400).json({ error: 'subject required' });
      if (!files.length) return res.status(400).json({ error: 'at least one file required' });
      const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
      const row = {
        user_id: userId, subject: b.subject, kind: KINDS.includes(b.kind) ? b.kind : 'other',
        title: (b.title || '').slice(0, 200) || null, test_date: b.test_date || null,
        marks_scored: num(b.marks_scored), marks_max: num(b.marks_max), note: (b.note || '').slice(0, 1000) || null,
        files: files.map(f => ({ path: f.path, name: safeName(f.name), type: f.type || null, size: f.size || null })),
      };
      const { data, error } = await admin.from('classwork_uploads').insert(row).select().single();
      if (error) throw error;
      return res.json({ upload: data });
    }

    if (action === 'list') {
      const { data: uploads, error } = await admin.from('classwork_uploads').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      const { data: results, error: rErr } = await admin.from('classwork_results').select('upload_id,subject,chapter,topic,marks,got,mistake,test_date').eq('user_id', userId).limit(5000);
      if (rErr) throw rErr;
      // Per subject → chapter: marks got / marks available on marked questions.
      const subj = {};
      for (const r of results || []) {
        if (r.got === null || r.got === undefined) continue;
        const S = (subj[r.subject] ||= {});
        const C = (S[r.chapter || 'Other'] ||= { chapter: r.chapter || 'Other', got: 0, marks: 0, questions: 0, mistakes: [] });
        C.got += Number(r.got); C.marks += Number(r.marks); C.questions++;
        if (r.mistake && Number(r.got) < Number(r.marks) && C.mistakes.length < 5) C.mistakes.push(r.mistake);
      }
      const chapters = Object.fromEntries(Object.entries(subj).map(([s, cs]) => [s, Object.values(cs)
        .map(c => ({ ...c, pct: c.marks ? Math.round((100 * c.got) / c.marks) : null })).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))]));
      const byUpload = {};
      for (const r of results || []) { const u = (byUpload[r.upload_id] ||= { questions: 0, got: 0, marks: 0, marked: 0 }); u.questions++; u.marks += Number(r.marks); if (r.got !== null && r.got !== undefined) { u.marked++; u.got += Number(r.got); } }
      return res.json({ uploads: (uploads || []).map(u => ({ ...u, result: byUpload[u.id] || null })), chapters });
    }

    if (action === 'evaluate') {
      try { return res.json({ upload: await evaluateUpload(userId, req.body.id) }); }
      catch (e) { if (e.userFacing) return res.status(422).json({ error: e.message }); throw e; }
    }

    if (action === 'get') {
      const { data, error } = await admin.from('classwork_uploads').select('*').eq('id', req.body.id).eq('user_id', userId).single();
      if (error) throw error;
      return res.json({ upload: data });
    }

    if (action === 'delete') {
      const { data: u, error } = await admin.from('classwork_uploads').select('*').eq('id', req.body.id).eq('user_id', userId).single();
      if (error) throw error;
      if (u.status === 'processed' || u.status === 'processing') return res.status(400).json({ error: 'Marked papers stay in your record and cannot be removed here.' });
      await admin.storage.from(BUCKET).remove((u.files || []).map(f => f.path));
      await admin.from('classwork_uploads').delete().eq('id', u.id);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    if (missingTable(e)) return res.status(503).json({ error: 'setup', message: 'Class-test storage is not set up yet (run backend/migrations/add_classwork.sql in Supabase).' });
    console.error('classwork', e.message || e);
    return res.status(500).json({ error: e.message || 'failed' });
  }
}
