import { useEffect, useMemo, useState } from 'react';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { HOW_LABEL, KIND_LABEL, loadMemoryItems, MEMORY_SUBJECTS, orderForDrill, readMarks, saveMark } from '../../lib/memoryDrill';
import { EmptyCard, ErrorCard, Field, Segmented, Spinner } from './ui';

// Definitions drill: definitions, laws, terms and units asked in real board + prelim papers.
// Recall → write → reveal the model answer → self-mark. Missed ones come back in the same round.
const SETS = [['todo', 'Still to learn'], ['frequent', 'Asked in 2+ papers'], ['all', 'All']];
const ROUND_SIZES = [10, 20, 0];   // 0 = everything in the selection
const MARKS = [
  ['got', 'Got it', 'border-good/40 bg-good-soft text-good'],
  ['nearly', 'Nearly', 'border-warn/40 bg-warn-soft text-warn'],
  ['missed', 'Missed', 'border-bad/40 bg-bad-soft text-bad'],
];
const RETRY_GAP = 3;   // a missed card comes back after this many others

export default function BoardMemory() {
  const { subject } = useSubject();
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [marks, setMarks] = useState({});
  const [phase, setPhase] = useState('setup');    // setup | running | done
  const [selChapters, setSelChapters] = useState([]);
  const [set, setSet] = useState('todo');
  const [size, setSize] = useState(10);
  const [queue, setQueue] = useState([]);          // item ids still to show
  const [log, setLog] = useState([]);              // [{ id, mark }] in order answered
  const [text, setText] = useState('');
  const [shown, setShown] = useState(false);

  const enabled = MEMORY_SUBJECTS.includes(subject.id);
  useEffect(() => {
    setItems(null); setError(null); setPhase('setup'); setSelChapters([]); setSet('todo');
    if (!enabled) return;
    let on = true;
    setMarks(readMarks(user?.id));
    loadMemoryItems(subject.id).then(d => { if (on) setItems(d); }).catch(e => { if (on) setError(e.message); });
    return () => { on = false; };
  }, [subject.id, enabled, user?.id]);

  const byId = useMemo(() => Object.fromEntries((items || []).map(i => [i.id, i])), [items]);
  const chapters = useMemo(() => {
    const c = {};
    for (const i of items || []) c[i.chapter] = (c[i.chapter] || 0) + 1;
    return Object.entries(c).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);
  const pool = useMemo(() => (items || []).filter(i =>
    (!selChapters.length || selChapters.includes(i.chapter))
    && (set === 'all' || (set === 'frequent' ? i.papers >= 2 : marks[i.id]?.last !== 'got'))), [items, selChapters, set, marks]);
  const learnt = (items || []).filter(i => marks[i.id]?.last === 'got').length;

  if (!enabled) return <EmptyCard text={`The definitions drill covers Chemistry, Biology and Physics.`} />;
  if (error) return <ErrorCard title="Couldn't load the drill" message={error} />;
  if (!items) return <Spinner label="Getting the definitions…" />;

  function start(ids) {
    setQueue(ids); setLog([]); setText(''); setShown(false); setPhase('running');
  }
  function startNew() {
    const ordered = orderForDrill(pool, marks).map(i => i.id);
    start(size ? ordered.slice(0, size) : ordered);
  }
  function markCard(mark) {
    const [id, ...rest] = queue;
    setMarks(saveMark(user?.id, id, mark));
    setLog(l => [...l, { id, mark }]);
    const next = mark === 'missed' ? [...rest.slice(0, RETRY_GAP), id, ...rest.slice(RETRY_GAP)] : rest;
    setText(''); setShown(false);
    if (!next.length) setPhase('done'); else setQueue(next);
  }

  // ── Setup ──
  if (phase === 'setup') return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <p className="eyebrow">Definitions drill</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          The definitions, laws, terms and units that {subject.label} board and prelim papers ask you to write word for word.
          Write each one from memory, then check it against the textbook answer and mark yourself honestly. Missed ones come back.
        </p>
      </div>
      <div className="card space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-2">
          <span><span className="font-display text-lg font-bold text-ink">{items.length}</span> in {subject.label}</span>
          <span><span className="font-display text-lg font-bold text-good">{learnt}</span> learnt</span>
          <span><span className="font-display text-lg font-bold text-ink">{items.filter(i => i.papers >= 2).length}</span> asked in 2+ papers</span>
        </div>
        <Field label="Which ones?">
          <Segmented value={set} onChange={setSet} options={SETS} />
        </Field>
        {chapters.length > 1 && (
          <Field label="Which chapters?" hint="(tap to pick one or more)">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelChapters([])} className={`chip ${selChapters.length === 0 ? 'chip-on' : ''}`}>All chapters</button>
              {chapters.map(([c, n]) => (
                <button key={c} type="button" onClick={() => setSelChapters(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}
                  className={`chip ${selChapters.includes(c) ? 'chip-on' : ''}`}>
                  {selChapters.includes(c) && <span aria-hidden="true">✓</span>}{c} <span className="text-ink-3">{n}</span>
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="How many?">
          <div className="grid grid-cols-3 gap-2">{ROUND_SIZES.map(n => (
            <button key={n} onClick={() => setSize(n)} className={`rounded-xl border-2 px-3 py-3 text-center transition duration-150 ${size === n ? 'border-brand bg-brand-soft text-brand-ink shadow-glow' : 'border-line bg-surface text-ink-2 hover:border-brand/40'}`}>
              <span className="block font-display text-xl font-bold">{n || 'All'}</span>
              <span className="block text-xs opacity-70">{n ? 'cards' : `${pool.length} cards`}</span>
            </button>
          ))}</div>
        </Field>
        {pool.length === 0
          ? <p className="rounded-xl bg-good-soft px-4 py-3 text-sm text-ink-2">{set === 'todo' ? 'You have learnt every one here. Pick “All” to revise them.' : 'Nothing here for these chapters.'}</p>
          : <button onClick={startNew} className="btn-primary w-full py-3.5 text-base">Start drill ({size ? Math.min(size, pool.length) : pool.length})</button>}
      </div>
    </div>
  );

  // ── Results ──
  if (phase === 'done') {
    const last = {};
    for (const l of log) last[l.id] = l.mark;          // final mark of each card this round
    const firstTry = {};
    for (const l of log) if (!(l.id in firstTry)) firstTry[l.id] = l.mark;
    const ids = Object.keys(firstTry);
    const count = m => ids.filter(id => firstTry[id] === m).length;
    const toLearn = ids.filter(id => firstTry[id] !== 'got');
    return (
      <div className="max-w-2xl space-y-5 animate-slide-up">
        <div className="card space-y-4 p-6 text-center">
          <p className="eyebrow">{subject.label} definitions</p>
          <p className="font-display text-5xl font-bold tabular-nums text-ink">{count('got')} <span className="text-2xl text-ink-3">/ {ids.length}</span></p>
          <p className="text-sm text-ink-2">right first time · {count('nearly')} nearly · {count('missed')} missed</p>
        </div>
        {toLearn.length > 0 && (
          <div className="card space-y-3 p-5">
            <p className="text-sm font-semibold text-ink">Learn these word for word</p>
            {toLearn.map(id => (
              <details key={id} className="rounded-xl border border-line bg-surface px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">{byId[id].prompt}</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{byId[id].answer}</p>
              </details>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          {toLearn.length > 0 && <button onClick={() => start(toLearn)} className="btn-primary flex-1">Drill these {toLearn.length} again</button>}
          <button onClick={() => setPhase('setup')} className={toLearn.length ? 'btn-secondary' : 'btn-primary flex-1'}>New round</button>
        </div>
      </div>
    );
  }

  // ── Running ──
  const it = byId[queue[0]];
  const done = log.length;
  const total = done + queue.length;
  const retry = log.some(l => l.id === it.id);
  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <div className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Card <span className="font-display text-lg">{done + 1}</span> <span className="text-ink-3">of {total}</span></p>
          <button onClick={() => (done ? setPhase('done') : setPhase('setup'))} className="btn-ghost">End</button>
        </div>
        <div className="progress-track"><div className="progress-fill bg-brand" style={{ width: `${(done / total) * 100}%` }} /></div>
      </div>

      <div key={`${it.id}-${done}`} className="card space-y-4 p-6 animate-slide-in-right">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill bg-surface-2 text-ink-2">{it.chapter}</span>
          <span className="pill bg-brand-soft text-brand-ink">{KIND_LABEL[it.kind]}</span>
          {it.papers >= 2 && <span className="pill bg-accent-soft text-accent">Asked in {it.papers} papers</span>}
          {retry && <span className="pill bg-bad-soft text-bad">Again</span>}
        </div>
        <p className="font-display text-lg font-semibold leading-snug text-ink">{it.prompt}</p>
        <textarea value={text} onChange={e => setText(e.target.value)} disabled={shown} rows={4}
          placeholder="Write it exactly as you would in the exam…" className="input resize-y leading-relaxed" />
        {!shown && <button onClick={() => setShown(true)} className="btn-primary">{text.trim() ? 'Check with the model answer' : 'Show the model answer'}</button>}
      </div>

      {shown && (
        <div className="space-y-4 animate-slide-up">
          <div className="rounded-2xl border border-good/30 bg-good-soft p-5">
            <p className="eyebrow !text-good">Model answer</p>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{it.answer}</p>
            {it.keywords.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-ink-2">Must include:</span>
                {it.keywords.map(k => <span key={k} className="pill border border-good/30 bg-surface text-ink-2">{k}</span>)}
              </div>
            )}
            {it.tip && <p className="mt-3 text-sm leading-relaxed text-ink-2"><span className="font-semibold">Remember: </span>{it.tip}</p>}
          </div>
          <p className="text-xs leading-relaxed text-ink-3">
            Asked in: {it.asked.map(a => `${a.label} Q${a.q_label} (${HOW_LABEL[a.how]})`).join(' · ')}
          </p>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">How did you do?</p>
            <div className="grid grid-cols-3 gap-2">
              {MARKS.map(([m, label, cls]) => (
                <button key={m} onClick={() => markCard(m)} className={`rounded-xl border-2 px-3 py-3 text-sm font-semibold transition duration-150 hover:-translate-y-0.5 ${cls}`}>{label}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">“Got it” only if every key phrase is there. Missed cards come back in this round.</p>
          </div>
        </div>
      )}
    </div>
  );
}
