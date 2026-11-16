import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { useProgress } from '../../context/ProgressContext';
import { boardApi, fmtMarks, hasAnswer, KIND_LABELS, paperTag, SOURCE_LABELS, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';
import { EmptyCard, ErrorCard, Field, Ring, Segmented, TONE, toneOf } from './ui';

const KINDS = ['numerical', 'data_diagram', 'reasoning', 'case', 'program', 'map'];
const COUNTS = [5, 10, 15];

export default function BoardApplied({ fixedSource = null, fixedIds = null }) {
  const { subject } = useSubject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refresh } = useProgress();
  const [phase, setPhase] = useState('setup'); // setup | loading | running | done
  const [kinds, setKinds] = useState([]);
  const [selChapters, setSelChapters] = useState([]);   // [] = all chapters
  const [source, setSource] = useState(fixedSource || '');  // '' = board + prelims, 'board', 'prelim'
  const [count, setCount] = useState(10);
  const [chapters, setChapters] = useState([]);
  const [info, setInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState(null);       // grading result for the current question
  const [busy, setBusy] = useState(false);
  const [selfMarks, setSelfMarks] = useState('');
  const [log, setLog] = useState([]);       // { label, got, max }
  const [error, setError] = useState(null);

  const hasBoard = SUBJECTS_WITH_BOARD.includes(subject.id);

  useEffect(() => {
    setPhase('setup'); setKinds([]); setSelChapters([]); setSource(fixedSource || ''); setInfo(null); setError(null);
    if (!hasBoard) return;
    boardApi('boardPapers', { action: 'applied', subject: subject.id, count: 1, userId: user?.id || null, source: fixedSource })
      .then(d => { setChapters(d.chapters || []); setInfo(d); }).catch(() => {});
  }, [subject.id]); // eslint-disable-line

  async function start() {
    setPhase('loading'); setError(null);
    try {
      const d = await boardApi('boardPapers', fixedIds ? { action: 'applied', subject: subject.id, ids: fixedIds } : { action: 'applied', subject: subject.id, kinds, chapters: selChapters, count, userId: user?.id || null, source: source || null });
      if (!d.questions?.length) { setError('No applied questions match those filters.'); setPhase('setup'); return; }
      setQuestions(d.questions); setIdx(0); setAnswer(''); setFb(null); setLog([]); setPhase('running');
    } catch (e) { setError(e.message); setPhase('setup'); }
  }

  const q = questions[idx];

  async function submit() {
    setBusy(true); setError(null);
    try {
      const out = await boardApi('boardGrade', { userId: user?.id || null, subject: subject.id, mode: 'applied', inputMethod: 'typed', answers: [{ questionId: q.id, text: answer }] });
      setFb(out); setSelfMarks('');
      const r = out.results[0];
      if (r.marks_awarded !== null && r.marks_awarded !== undefined) setLog(l => [...l, { label: q.q_label, got: Number(r.marks_awarded), max: Number(r.marks) }]);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function saveSelf() {
    const r = fb.results[0];
    const m = Math.min(Number(selfMarks) || 0, Number(r.marks));
    try {
      await boardApi('boardGrade', { action: 'selfmark', attemptId: fb.attemptId, marks: [{ questionId: q.id, marks: m }] });
      setFb(f => ({ ...f, results: [{ ...f.results[0], marks_awarded: m, graded_by: 'self' }] }));
      setLog(l => [...l, { label: q.q_label, got: m, max: Number(r.marks) }]);
    } catch (e) { setError(e.message); }
  }

  function next() {
    if (idx + 1 >= questions.length) { setPhase('done'); refresh(); return; }
    setIdx(idx + 1); setAnswer(''); setFb(null);
  }

  // A fixed set (from the error log) skips the setup screen.
  useEffect(() => { if (fixedIds?.length && phase === 'setup' && !error) start(); }, [fixedIds, phase]); // eslint-disable-line
  if (!hasBoard) return <EmptyCard text={`Board papers for ${subject.label} aren't in the app yet.`} />;

  // Only the kinds that exist in this subject's question pool (all of them until the info call returns).
  const availableKinds = info?.kinds ? KINDS.filter(k => info.kinds.includes(k)) : KINDS;

  if (fixedIds && (phase === 'setup' || phase === 'loading')) return error ? <ErrorCard title="Couldn't start" message={error} /> : <EmptyCard text="Getting your questions…" />;

  if (phase === 'setup' || phase === 'loading') return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        {!fixedSource && <p className="eyebrow">Applied questions</p>}
        {!fixedSource && <p className="mt-1 text-sm leading-relaxed text-ink-2">Board-paper questions that test using ideas in new situations — case studies, numericals, data and diagram reading — drawn from all {subject.label} papers. Marked against the official solution with the exact points you missed.</p>}
        {info && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="pill bg-surface-2 text-ink-2">{info.pool_size} to practise</span>
            <span className="pill bg-brand-soft text-brand-ink">{info.unseen} not yet tried</span>
          </div>
        )}
      </div>
      <div className="card space-y-6 p-6">
        {!fixedSource && (info?.sources || []).length > 1 && (
          <Field label="Which papers?">
            <Segmented value={source} onChange={setSource} options={['', 'board', 'prelim'].map(s => [s, SOURCE_LABELS[s]])} />
          </Field>
        )}
        <Field label="Type of question" hint="(none selected = all)">
          <div className="flex flex-wrap gap-2">{availableKinds.map(k => (
            <button key={k} onClick={() => setKinds(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])} className={`chip ${kinds.includes(k) ? 'chip-on' : ''}`}>{kinds.includes(k) && <span aria-hidden="true">✓</span>}{KIND_LABELS[k]}</button>
          ))}</div>
        </Field>
        <Field label="Chapters" hint="(tap to pick one or more; none = all)">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSelChapters([])} className={`chip ${selChapters.length === 0 ? 'chip-on' : ''}`}>All chapters</button>
            {chapters.map(c => (
              <button key={c} onClick={() => setSelChapters(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])} className={`chip ${selChapters.includes(c) ? 'chip-on' : ''}`}>{selChapters.includes(c) && <span aria-hidden="true">✓</span>}{c}</button>
            ))}
          </div>
        </Field>
        <Field label="How many?">
          <Segmented value={count} onChange={setCount} options={COUNTS.map(n => [n, String(n)])} />
        </Field>
        {error && <ErrorCard title="Couldn't load questions" message={error} />}
        <button onClick={start} disabled={phase === 'loading'} className="btn-primary w-full py-3.5 text-base">{phase === 'loading' ? 'Loading…' : 'Start'}</button>
      </div>
    </div>
  );

  if (phase === 'done') {
    const got = log.reduce((s, x) => s + x.got, 0), max = log.reduce((s, x) => s + x.max, 0);
    const pct = max ? Math.round((got / max) * 100) : 0;
    return (
      <div className="card max-w-xl space-y-5 p-8 text-center animate-slide-up">
        <p className="eyebrow">{subject.label} applied practice</p>
        {max > 0 && (
          <div className="flex justify-center">
            <Ring pct={pct} size={120}><span className={`font-display text-2xl font-bold ${TONE[toneOf(pct)].text}`}>{pct}%</span></Ring>
          </div>
        )}
        <p className="font-display text-5xl font-bold tabular-nums text-ink animate-burst">{fmtMarks(got)} <span className="text-2xl text-ink-3">/ {fmtMarks(max)}</span></p>
        <p className="text-xs text-ink-3">{log.length} of {questions.length} questions marked</p>
        <div className="flex justify-center gap-3 pt-1">
          <button onClick={() => setPhase('setup')} className="btn-primary">Practise more</button>
          <button onClick={() => navigate(`/${subject.id}/board`)} className="btn-secondary">Board practice home</button>
        </div>
      </div>
    );
  }

  const r = fb?.results?.[0];
  const needsSelf = r && (r.marks_awarded === null || r.marks_awarded === undefined);
  const rPct = r && !needsSelf && Number(r.marks) ? (Number(r.marks_awarded) / Number(r.marks)) * 100 : null;
  const rTone = rPct === null ? null : TONE[toneOf(rPct)];
  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Question <span className="font-display text-lg">{idx + 1}</span> <span className="text-ink-3">of {questions.length}</span></p>
          {log.length > 0 && <span className="pill bg-accent-soft py-1 text-sm tabular-nums text-accent">{fmtMarks(log.reduce((s, x) => s + x.got, 0))} / {fmtMarks(log.reduce((s, x) => s + x.max, 0))}</span>}
        </div>
        <div className="progress-track"><div className="progress-fill bg-brand" style={{ width: `${((idx + (fb ? 1 : 0)) / questions.length) * 100}%` }} /></div>
      </div>
      <div key={q.id} className="animate-slide-in-right">
        <QuestionCard q={q} value={answer} onChange={setAnswer} disabled={!!fb} tag={paperTag(q)} />
      </div>
      {error && <ErrorCard title="Marking isn't available right now" message={error} hint="Your answer is still here — try submitting again in a little while." />}
      {!fb && <button onClick={submit} disabled={busy || !hasAnswer(q, answer)} className="btn-primary w-full py-3.5 text-base">{busy ? 'Marking…' : 'Submit answer'}</button>}
      {busy && <p className="text-center text-xs text-ink-3 animate-fade-in">Marking against the official solution…</p>}
      {r && (
        <div className={`card space-y-4 p-5 animate-slide-up ${rTone ? `border-l-4 ${rPct >= 80 ? 'border-l-good' : rPct >= 50 ? 'border-l-warn' : 'border-l-bad'}` : ''}`}>
          <p className={`font-display text-2xl font-bold tabular-nums ${rTone ? `${rTone.text} animate-pop` : 'text-ink'}`}>{needsSelf ? 'Mark yourself' : <>{fmtMarks(r.marks_awarded)} <span className="text-base font-normal text-ink-3">/ {fmtMarks(r.marks)}</span></>}</p>
          {r.points_hit?.length > 0 && <ul className="space-y-1 rounded-xl bg-good-soft p-3 text-sm text-good">{r.points_hit.map((p, i) => <li key={i}>✓ {p}</li>)}</ul>}
          {r.points_missed?.length > 0 && <div className="rounded-xl bg-bad-soft p-3"><p className="mb-1 text-xs font-semibold text-bad">What was missing</p><ul className="space-y-1 text-sm text-ink-2">{r.points_missed.map((p, i) => <li key={i}>＋ {p}</li>)}</ul></div>}
          {r.feedback && <p className="text-xs italic text-ink-3">{r.feedback}</p>}
          <div className="rounded-xl border border-line bg-surface-2 p-4"><p className="mb-1.5 text-xs font-semibold text-good">Official solution</p><p className={`whitespace-pre-wrap leading-relaxed text-ink-2 ${q.applied_kind === 'program' ? 'font-mono text-[13px]' : 'text-sm'}`}>{r.solution}</p></div>
          {needsSelf && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft p-3 text-sm text-ink-2">
              <label className="flex items-center gap-2">My marks: <input type="number" min="0" max={r.marks} step="0.5" value={selfMarks} onChange={e => setSelfMarks(e.target.value)} className="input !w-24 !py-1.5" /> / {fmtMarks(r.marks)}</label>
              <button onClick={saveSelf} className="btn-secondary !py-2">Save</button>
            </div>
          )}
          <button onClick={next} disabled={needsSelf} className="btn-primary w-full">{idx + 1 >= questions.length ? 'Finish' : 'Next question →'}</button>
        </div>
      )}
    </div>
  );
}
