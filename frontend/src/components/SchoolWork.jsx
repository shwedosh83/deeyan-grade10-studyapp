import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SUBJECTS } from '../context/SubjectContext';
import { supabase } from '../lib/supabase';
import { boardApi } from '../lib/board';
import { subjectStyle } from '../lib/subjectStyle';
import { bandOf } from './progress/bands';

const KINDS = [['class_test', 'Class test'], ['worksheet', 'Worksheet'], ['other', 'Other']];
const KIND_LABEL = Object.fromEntries(KINDS);
const subjectById = id => SUBJECTS.find(s => s.id === id) || { id, label: id, emoji: '📄' };
const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const fmtSize = b => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const num = v => (v === null || v === undefined ? '' : Number(v) % 1 ? Number(v).toFixed(1) : String(Number(v)));

// Class tests and worksheets from school: upload once, they're read into questions + marks, and feed practice and progress.
export default function SchoolWork() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, setup: false, uploads: [], chapters: {} });

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const d = await boardApi('classwork', { action: 'list', userId: user.id });
      setState({ loading: false, error: null, setup: false, uploads: d.uploads || [], chapters: d.chapters || {} });
    } catch (e) {
      setState(s => ({ ...s, loading: false, setup: e.message === 'setup', error: e.message === 'setup' ? null : e.message }));
    }
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="eyebrow">From school</p>
        <h1 className="page-title">Class tests &amp; worksheets</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Upload a marked class test or a worksheet (question paper, your answer sheet, solutions: photos or PDFs). Press Mark it and every answer is checked against a model answer, ICSE-style, with marks and what to fix. The questions then join your practice, and weak chapters show up in My progress.
        </p>
      </header>

      {state.setup ? (
        <div className="card p-6"><p className="section-title">Almost ready</p><p className="mt-1 text-sm text-ink-2">Class-test storage needs a one-time database setup before uploads can be saved.</p></div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          <div className="col-span-2"><UploadCard userId={user?.id} onDone={load} /></div>
          <div className="col-span-3 space-y-6">
            <SchoolResults loading={state.loading} chapters={state.chapters} />
            <UploadList state={state} userId={user?.id} onChange={load} />
          </div>
        </div>
      )}
    </div>
  );
}

function UploadCard({ userId, onDone }) {
  const blank = { subject: '', kind: 'class_test', title: '', test_date: '', marks_scored: '', marks_max: '', note: '' };
  const [f, setF] = useState(blank);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(null);       // progress text while uploading
  const [msg, setMsg] = useState(null);         // { tone, text }
  const input = useRef(null);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  function addFiles(list) {
    const ok = [...list].filter(x => /^(image\/|application\/pdf)/.test(x.type));
    setFiles(cur => [...cur, ...ok].slice(0, 20));
    if (ok.length < list.length) setMsg({ tone: 'warn', text: 'Only photos and PDFs can be uploaded.' });
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.subject) return setMsg({ tone: 'warn', text: 'Pick the subject.' });
    if (!files.length) return setMsg({ tone: 'warn', text: 'Add at least one photo or PDF.' });
    if (!supabase) return setMsg({ tone: 'bad', text: 'Uploads need the app to be connected to its database.' });
    setMsg(null);
    try {
      const done = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const s = await boardApi('classwork', { action: 'sign', userId, name: file.name });
        const { error } = await supabase.storage.from('classwork').uploadToSignedUrl(s.path, s.token, file, { contentType: file.type });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        done.push({ path: s.path, name: file.name, type: file.type, size: file.size });
      }
      setBusy('Saving…');
      await boardApi('classwork', { action: 'create', userId, ...f, files: done });
      setF(blank); setFiles([]);
      setMsg({ tone: 'good', text: 'Uploaded. Press Mark it next to it to get the result.' });
      onDone();
    } catch (err) {
      setMsg({ tone: 'bad', text: err.message === 'setup' ? 'Class-test storage is not set up yet.' : `Upload failed: ${err.message}` });
    }
    setBusy(null);
  }

  const tone = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' };
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <p className="section-title">Upload</p>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Subject</span>
        <select value={f.subject} onChange={set('subject')} className="input">
          <option value="">Choose…</option>
          {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>)}
        </select>
      </label>
      <div className="space-y-1.5"><span className="text-xs font-semibold text-ink-2">What is it?</span>
        <div className="flex gap-2">{KINDS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setF(v => ({ ...v, kind: k }))} className={`chip ${f.kind === k ? 'chip-on' : ''}`}>{l}</button>
        ))}</div>
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Title <span className="font-normal text-ink-3">(optional)</span></span>
        <input value={f.title} onChange={set('title')} placeholder="e.g. Unit test 3: Refraction" className="input" />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className="col-span-1 block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Date</span>
          <input type="date" value={f.test_date} onChange={set('test_date')} className="input" />
        </label>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Marks got</span>
          <input type="number" min="0" step="0.5" value={f.marks_scored} onChange={set('marks_scored')} className="input" />
        </label>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Out of</span>
          <input type="number" min="0" step="0.5" value={f.marks_max} onChange={set('marks_max')} className="input" />
        </label>
      </div>

      <div
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-line bg-surface-2 p-5 text-center transition duration-150 hover:border-brand/50">
        <p className="text-sm font-semibold text-ink">Add photos or PDFs</p>
        <p className="mt-0.5 text-xs text-ink-3">Question paper, answer sheet, solutions: as many pages as you like</p>
        <input ref={input} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <ul className="space-y-1.5">{files.map((x, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-1.5 text-xs">
            <span className="truncate text-ink-2">{x.type === 'application/pdf' ? '📄' : '🖼️'} {x.name}</span>
            <span className="flex shrink-0 items-center gap-2 text-ink-3">{fmtSize(x.size)}
              <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="rounded px-1 text-ink-3 hover:text-bad" aria-label={`Remove ${x.name}`}>✕</button>
            </span>
          </li>
        ))}</ul>
      )}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-ink-2">Note <span className="font-normal text-ink-3">(optional)</span></span>
        <input value={f.note} onChange={set('note')} placeholder="e.g. Q4 was marked wrongly" className="input" />
      </label>
      {msg && <p className={`rounded-lg px-3 py-2 text-xs font-medium animate-fade-in ${tone[msg.tone]}`}>{msg.text}</p>}
      <button type="submit" disabled={!!busy} className="btn-primary w-full">{busy || 'Upload'}</button>
    </form>
  );
}

function SchoolResults({ loading, chapters }) {
  const subjects = Object.keys(chapters || {});
  if (loading) return <div className="card space-y-3 p-6"><div className="skeleton h-4 w-40" /><div className="skeleton h-3 w-full" /><div className="skeleton h-3 w-5/6" /></div>;
  return (
    <section className="card p-6">
      <p className="eyebrow">Marks from school</p>
      <p className="section-title">Where the marks went</p>
      <p className="mt-0.5 text-xs text-ink-3">From the papers you've had marked here.</p>
      {!subjects.length ? (
        <p className="mt-2 text-sm text-ink-3">After your first paper is marked you'll see marks by chapter here, weakest first.</p>
      ) : (
        <div className="mt-4 space-y-5">{subjects.map(sid => {
          const s = subjectById(sid), st = subjectStyle(sid);
          return (
            <div key={sid}>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink"><span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${st.tile}`}>{s.emoji}</span>{s.label}</p>
                <Link to={`/${sid}/board/school`} className="text-xs font-semibold text-brand hover:text-brand-ink">Practise these questions →</Link>
              </div>
              <ul className="space-y-2">{chapters[sid].map(c => {
                const b = bandOf(c.pct, c.questions >= 1 ? 99 : 0);
                return (
                  <li key={c.chapter}>
                    <div className="flex items-center justify-between text-xs"><span className="text-ink-2">{c.chapter}</span><span className="font-semibold text-ink">{num(c.got)}/{num(c.marks)} <span className="text-ink-3">· {c.pct}%</span></span></div>
                    <div className="progress-track mt-1 h-1.5"><div className={`progress-fill ${b?.bar || 'bg-brand'}`} style={{ width: `${c.pct || 0}%` }} /></div>
                    {c.mistakes.length > 0 && <p className="mt-1 text-[11px] text-ink-3">Lost marks on: {c.mistakes.join(' · ')}</p>}
                  </li>
                );
              })}</ul>
            </div>
          );
        })}</div>
      )}
    </section>
  );
}

function UploadList({ state, userId, onChange }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(null);
  const [marking, setMarking] = useState({});   // id -> true while marking
  const [errors, setErrors] = useState({});     // id -> message
  async function mark(u) {
    setMarking(m => ({ ...m, [u.id]: true })); setErrors(e => ({ ...e, [u.id]: null }));
    try { await boardApi('classwork', { action: 'evaluate', userId, id: u.id }); navigate(`/school/${u.id}`); }
    catch (e) { setErrors(x => ({ ...x, [u.id]: e.message })); onChange(); }
    setMarking(m => ({ ...m, [u.id]: false }));
  }
  async function remove(u) {
    if (!window.confirm(`Remove "${u.title || KIND_LABEL[u.kind]}" and its files? This can't be undone.`)) return;
    setRemoving(u.id);
    try { await boardApi('classwork', { action: 'delete', userId, id: u.id }); onChange(); } catch (e) { alert(e.message); }
    setRemoving(null);
  }
  if (state.loading) return <div className="card space-y-3 p-6"><div className="skeleton h-4 w-32" /><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /></div>;
  if (state.error) return <div className="card p-6"><p className="text-sm text-ink-2">Couldn't load your uploads: {state.error}</p><button onClick={onChange} className="btn-secondary mt-3">Retry</button></div>;
  return (
    <section className="card p-6">
      <p className="section-title">Your uploads</p>
      {!state.uploads.length ? <p className="mt-2 text-sm text-ink-3">Nothing uploaded yet.</p> : (
        <ul className="mt-3 divide-y divide-line">{state.uploads.map(u => {
          const s = subjectById(u.subject), st = subjectStyle(u.subject), r = u.result;
          const scored = u.marks_scored !== null && u.marks_max ? `${num(u.marks_scored)}/${num(u.marks_max)}` : r?.marked ? `${num(r.got)}/${num(r.marks)}` : null;
          return (
            <li key={u.id} className="py-3"><div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${st.tile}`}>{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{u.title || `${s.label} ${KIND_LABEL[u.kind]?.toLowerCase()}`}</p>
                <p className="text-xs text-ink-3">{[KIND_LABEL[u.kind], fmtDate(u.test_date) || `uploaded ${fmtDate(u.created_at)}`, `${u.files.length} file${u.files.length === 1 ? '' : 's'}`, r ? `${r.questions} questions` : null].filter(Boolean).join(' · ')}</p>
              </div>
              {scored && <span className="font-display text-sm font-bold text-ink">{scored}</span>}
              {u.status === 'processed' && <Link to={`/school/${u.id}`} className="btn-secondary px-3 py-1.5 text-xs">See result</Link>}
              {(u.status === 'pending' || u.status === 'failed' || (u.status === 'processing' && !marking[u.id])) && <>
                <button onClick={() => mark(u)} disabled={marking[u.id]} className="btn-primary px-3 py-1.5 text-xs">{u.status === 'pending' ? 'Mark it' : 'Try again'}</button>
                <button onClick={() => remove(u)} disabled={removing === u.id || marking[u.id]} className="btn-ghost px-2 py-1 text-xs">Remove</button>
              </>}
              {marking[u.id] && <span className="pill bg-brand-soft text-brand-ink animate-pulse">Marking… 1–3 min</span>}
            </div>
            {(errors[u.id] || (u.status === 'failed' && u.status_note)) && !marking[u.id] && (
              <p className="ml-12 mt-1.5 rounded-lg bg-bad-soft px-3 py-1.5 text-xs text-bad">{errors[u.id] || u.status_note}</p>
            )}
            </li>
          );
        })}</ul>
      )}
    </section>
  );
}
