import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { useProgress } from '../../context/ProgressContext';
import { boardApi, checkObjective, fmtTime, getItems, hasAnswer, isMCQ, paperTag, SOURCE_LABELS, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';
import BoardResults from './BoardResults';
import { EmptyCard, ErrorCard, Field, Segmented, Spinner, TimerPill } from './ui';

const COUNTS = [10, 15, 20];
const SECONDS_PER_Q = 45;

export default function BoardSprint({ fixedSource = null }) {
  const { subject } = useSubject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refresh } = useProgress();
  const [phase, setPhase] = useState('setup'); // setup | loading | running | saving | results
  const [count, setCount] = useState(15);
  const [selChapters, setSelChapters] = useState([]);   // [] = all chapters
  const [chapters, setChapters] = useState([]);
  const [source, setSource] = useState(fixedSource || '');     // '' = board + prelims, 'board', 'prelim'; fixed to 'competency' on the Competency tab
  const [sources, setSources] = useState([]);   // sources that exist in this subject's pool
  const [questions, setQuestions] = useState([]);
  const [poolSize, setPoolSize] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});   // id -> { correct, got, total, flags }
  const [deadline, setDeadline] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const finishing = useRef(false);

  const hasBoard = SUBJECTS_WITH_BOARD.includes(subject.id);
  const qMap = useMemo(() => Object.fromEntries(questions.map(q => [q.id, q])), [questions]);

  useEffect(() => { setPhase('setup'); setResult(null); setError(null); setSelChapters([]); setChapters([]); setSource(fixedSource || ''); setSources([]); }, [subject.id]);

  // Chapter + source lists for the setup screen (count 0 = metadata only).
  useEffect(() => {
    if (!hasBoard) return;
    let on = true;
    boardApi('boardPapers', { action: 'sprint', subject: subject.id, count: 0, source: source || null })
      .then(d => { if (!on) return; setChapters(d.chapters || []); if (!source) setSources(d.sources || []); })
      .catch(() => {});
    return () => { on = false; };
  }, [subject.id, hasBoard, source]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  async function start() {
    setPhase('loading'); setError(null);
    try {
      const d = await boardApi('boardPapers', { action: 'sprint', subject: subject.id, count: Number(count), chapters: selChapters, source: source || null });
      if (!d.questions?.length) { setError(selChapters.length ? `No objective questions for ${selChapters.join(', ')} yet.` : 'No objective questions for this subject yet.'); setPhase('setup'); return; }
      setQuestions(d.questions); setPoolSize(d.pool_size); setIdx(0); setAnswers({}); setChecked({}); finishing.current = false;
      const t = Date.now(); setStartedAt(t); setDeadline(t + d.questions.length * SECONDS_PER_Q * 1000);
      setPhase('running');
    } catch (e) { setError(e.message); setPhase('setup'); }
  }

  const q = questions[idx];
  const remaining = Math.max(0, Math.round((deadline - now) / 1000));
  const score = Object.values(checked).reduce((s, c) => s + (c.got / c.total), 0);

  function check(question, value) {
    if (checked[question.id]) return;
    setChecked(c => ({ ...c, [question.id]: checkObjective(question, value) }));
  }
  function pickOption(question, k) {
    if (checked[question.id]) return;
    setAnswers(a => ({ ...a, [question.id]: k }));
    check(question, k);
  }

  async function finish() {
    if (finishing.current) return; finishing.current = true;
    setPhase('saving');
    const list = questions.filter(x => hasAnswer(x, answers[x.id])).map(x => ({ questionId: x.id, text: answers[x.id] }));
    try {
      const out = await boardApi('boardGrade', { userId: user?.id || null, subject: subject.id, mode: 'sprint', inputMethod: 'typed', secondsUsed: Math.round((Date.now() - startedAt) / 1000), answers: list });
      setResult(out);
    } catch (e) { setError(e.message); setResult(null); }
    refresh();
    setPhase('results');
  }

  useEffect(() => { if (phase === 'running' && deadline && now >= deadline) finish(); }, [now, phase, deadline]); // eslint-disable-line

  if (!hasBoard) return <EmptyCard text={`Board papers for ${subject.label} aren't in the app yet.`} />;

  if (phase === 'setup' || phase === 'loading') return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      {!fixedSource && <div>
        <p className="eyebrow">Sprint round</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">Quick-fire objectives from real {subject.label} board papers: MCQs, assertion–reason, match the column, fill in the blanks, name the term. {SECONDS_PER_Q} seconds each, marked instantly.</p>
      </div>}
      <div className="card space-y-6 p-6">
        {!fixedSource && sources.length > 1 && (
          <Field label="Which papers?">
            <Segmented value={source} onChange={s => { setSource(s); setSelChapters([]); }}
              options={['', 'board', 'prelim'].map(s => [s, SOURCE_LABELS[s]])} />
            {source === 'prelim' && <p className="text-xs text-ink-3">Objective questions from the top board-aligned school prelim papers (2025-26), each tagged with its school.</p>}
          </Field>
        )}
        {chapters.length > 1 && (
          <Field label="Which chapters?" hint="(tap to pick one or more)">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelChapters([])}
                className={`chip ${selChapters.length === 0 ? 'chip-on' : ''}`}>
                All chapters
              </button>
              {chapters.map(c => (
                <button key={c} type="button" onClick={() => setSelChapters(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}
                  className={`chip ${selChapters.includes(c) ? 'chip-on' : ''}`}>
                  {selChapters.includes(c) && <span aria-hidden="true">✓</span>}{c}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="How many questions?">
          <div className="grid grid-cols-3 gap-2">{COUNTS.map(n => (
            <button key={n} onClick={() => setCount(n)} className={`rounded-xl border-2 px-3 py-3 text-center transition duration-150 ${Number(count) === n ? 'border-brand bg-brand-soft text-brand-ink shadow-glow' : 'border-line bg-surface text-ink-2 hover:border-brand/40'}`}>
              <span className="block font-display text-xl font-bold">{n}</span>
              <span className="block text-xs opacity-70">({fmtTime(n * SECONDS_PER_Q)})</span>
            </button>
          ))}</div>
          <label className="flex flex-wrap items-center gap-3 text-sm text-ink-2">Or enter your own:
            <input type="number" min="1" max="100" placeholder="1–100" value={COUNTS.includes(Number(count)) ? '' : count} onChange={e => setCount(e.target.value === '' ? 15 : Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))} className="input !w-28 font-medium" />
            <span className="text-xs text-ink-3">{fmtTime(Number(count) * SECONDS_PER_Q)} total</span>
          </label>
        </Field>
        {error && <ErrorCard title="Couldn't start the sprint" message={error} />}
        <button onClick={start} disabled={phase === 'loading' || !count} className="btn-primary w-full py-3.5 text-base">{phase === 'loading' ? 'Loading…' : 'Start sprint'}</button>
      </div>
    </div>
  );

  if (phase === 'saving') return <Spinner label="Saving your round…" />;

  if (phase === 'results') {
    if (result) return <BoardResults data={result} qMap={qMap} title={`${subject.label} sprint`} seconds={Math.round((Date.now() - startedAt) / 1000)} againLabel="Another sprint" onAgain={() => setPhase('setup')} onHome={() => navigate(`/${subject.id}/board`)} />;
    return (
      <div className="card max-w-xl space-y-4 p-8 text-center animate-slide-up">
        <p className="eyebrow">{subject.label} sprint</p>
        <p className="font-display text-5xl font-bold tabular-nums text-ink animate-burst">{score.toFixed(1)} <span className="text-2xl text-ink-3">/ {questions.length}</span></p>
        <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-ink-2">Your results couldn't be saved ({error}), but your score above is right.</p>
        <button onClick={() => setPhase('setup')} className="btn-primary">Another sprint</button>
      </div>
    );
  }

  // running
  const items = getItems(q);
  const done = checked[q.id];
  const low = remaining < 30;
  const total = questions.length * SECONDS_PER_Q;
  const timerState = low ? 'bad' : remaining < Math.min(90, total * 0.25) ? 'warn' : 'calm';
  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Question <span className="font-display text-lg">{idx + 1}</span> <span className="text-ink-3">of {questions.length}</span></p>
          <div className="flex items-center gap-2">
            <span className="pill bg-accent-soft py-1 text-sm tabular-nums text-accent">{score.toFixed(1)} pts</span>
            <TimerPill text={fmtTime(remaining)} state={timerState} />
          </div>
        </div>
        <div className="progress-track"><div className="progress-fill bg-brand" style={{ width: `${(idx / questions.length) * 100}%` }} /></div>
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {questions.map((x, i) => {
            const c = checked[x.id];
            const cls = c ? (c.correct ? 'bg-good' : c.got > 0 ? 'bg-warn' : 'bg-bad')
              : i === idx ? 'bg-brand ring-4 ring-brand/20' : i < idx ? 'bg-ink-3/40' : 'bg-surface-2 border border-line';
            return <span key={x.id} className={`h-2.5 w-2.5 rounded-full transition duration-200 ${cls}`} />;
          })}
        </div>
      </div>

      <div key={q.id} className="animate-slide-in-right">
        <QuestionCard q={q} value={answers[q.id] || ''} tag={paperTag(q)}
          onChange={v => (isMCQ(q) ? pickOption(q, v) : setAnswers(a => ({ ...a, [q.id]: v })))}
          disabled={!!done} reveal={done ? { itemFlags: done.flags } : null} />
      </div>

      {!isMCQ(q) && items.length > 0 && !done && (
        <button onClick={() => check(q, answers[q.id])} disabled={!hasAnswer(q, answers[q.id])} className="btn-primary">Check</button>
      )}
      {done && (
        <div className={`rounded-xl border px-5 py-4 text-sm ${done.correct ? 'border-good/30 bg-good-soft animate-pop' : done.got > 0 ? 'border-warn/30 bg-warn-soft animate-pop' : 'border-bad/30 bg-bad-soft animate-shake'}`}>
          <p className={`font-semibold ${done.correct ? 'text-good' : done.got > 0 ? 'text-warn' : 'text-bad'}`}>{done.correct ? 'Correct!' : done.got > 0 ? `${done.got} of ${done.total} right` : 'Not quite.'}</p>
          {q.solution && !done.correct && <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-2">{q.solution}</p>}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={() => (idx + 1 >= questions.length ? finish() : setIdx(idx + 1))} className="btn-primary flex-1">
          {idx + 1 >= questions.length ? 'Finish' : done ? 'Next →' : 'Skip →'}
        </button>
        <button onClick={finish} className="btn-secondary">End now</button>
      </div>
    </div>
  );
}
