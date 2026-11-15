import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { boardApi, checkObjective, fmtTime, getItems, hasAnswer, isMCQ, paperTag, SOURCE_LABELS, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';
import BoardResults from './BoardResults';

const COUNTS = [10, 15, 20];
const SECONDS_PER_Q = 45;

export default function BoardSprint() {
  const { subject } = useSubject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('setup'); // setup | loading | running | saving | results
  const [count, setCount] = useState(15);
  const [selChapters, setSelChapters] = useState([]);   // [] = all chapters
  const [chapters, setChapters] = useState([]);
  const [source, setSource] = useState('');     // '' = board + prelims, 'board', 'prelim'
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

  useEffect(() => { setPhase('setup'); setResult(null); setError(null); setSelChapters([]); setChapters([]); setSource(''); setSources([]); }, [subject.id]);

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
    setPhase('results');
  }

  useEffect(() => { if (phase === 'running' && deadline && now >= deadline) finish(); }, [now, phase, deadline]); // eslint-disable-line

  if (!hasBoard) return <p className="text-gray-500 text-sm">Board papers for {subject.label} aren't in the app yet.</p>;

  if (phase === 'setup' || phase === 'loading') return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-gray-500">Quick-fire objectives from real {subject.label} board papers: MCQs, assertion–reason, match the column, fill in the blanks, name the term. {SECONDS_PER_Q} seconds each, marked instantly.</p>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        {sources.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Which papers?</p>
            <div className="flex gap-1.5 flex-wrap">
              {['', 'board', 'prelim'].map(s => (
                <button key={s || 'all'} type="button" onClick={() => { setSource(s); setSelChapters([]); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${source === s ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500 hover:text-gray-700'}`}>
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
            {source === 'prelim' && <p className="text-xs text-gray-400">Objective questions from the top board-aligned school prelim papers (2025-26), each tagged with its school.</p>}
          </div>
        )}
        {chapters.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Which chapters? <span className="text-gray-400 font-normal">(tap to pick one or more)</span></p>
            <div className="flex gap-1.5 flex-wrap">
              <button type="button" onClick={() => setSelChapters([])}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${selChapters.length === 0 ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500 hover:text-gray-700'}`}>
                All chapters
              </button>
              {chapters.map(c => (
                <button key={c} type="button" onClick={() => setSelChapters(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${selChapters.includes(c) ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500 hover:text-gray-700'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-sm font-medium text-gray-700">How many questions?</p>
        <div className="flex gap-2">{COUNTS.map(n => (
          <button key={n} onClick={() => setCount(n)} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${Number(count) === n ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500'}`}>{n} <span className="text-xs opacity-60">({fmtTime(n * SECONDS_PER_Q)})</span></button>
        ))}</div>
        <label className="flex items-center gap-3 text-sm text-gray-600">Or enter your own:
          <input type="number" min="1" max="100" placeholder="1–100" value={COUNTS.includes(Number(count)) ? '' : count} onChange={e => setCount(e.target.value === '' ? 15 : Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))} className="w-24 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-medium" />
          <span className="text-xs text-gray-400">{fmtTime(Number(count) * SECONDS_PER_Q)} total</span>
        </label>
        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={start} disabled={phase === 'loading' || !count} className="w-full bg-barca-navy hover:bg-barca-navy-dark disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg">{phase === 'loading' ? 'Loading…' : 'Start sprint'}</button>
      </div>
    </div>
  );

  if (phase === 'saving') return <div className="flex justify-center h-48 items-center"><div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" /></div>;

  if (phase === 'results') {
    if (result) return <BoardResults data={result} qMap={qMap} title={`${subject.label} sprint`} seconds={Math.round((Date.now() - startedAt) / 1000)} againLabel="Another sprint" onAgain={() => setPhase('setup')} onHome={() => navigate(`/${subject.id}/board`)} />;
    return (
      <div className="max-w-xl bg-white rounded-xl border border-gray-200 p-8 text-center space-y-3">
        <p className="text-4xl font-bold text-barca-navy">{score.toFixed(1)} / {questions.length}</p>
        <p className="text-sm text-gray-500">Your results couldn't be saved ({error}), but your score above is right.</p>
        <button onClick={() => setPhase('setup')} className="bg-barca-navy text-white font-semibold px-5 py-2 rounded-lg text-sm">Another sprint</button>
      </div>
    );
  }

  // running
  const items = getItems(q);
  const done = checked[q.id];
  const low = remaining < 30;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-700">Question {idx + 1} of {questions.length}</p>
        <div className="flex items-center gap-4">
          <span className="text-sm text-barca-gold font-semibold tabular-nums">{score.toFixed(1)} pts</span>
          <span className={`font-bold tabular-nums ${low ? 'text-red-600' : 'text-gray-800'}`}>{fmtTime(remaining)}</span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-barca-navy transition-all" style={{ width: `${(idx / questions.length) * 100}%` }} /></div>
      <p className="text-xs text-gray-400">{paperTag(q)}</p>

      <QuestionCard q={q} value={answers[q.id] || ''} compact
        onChange={v => (isMCQ(q) ? pickOption(q, v) : setAnswers(a => ({ ...a, [q.id]: v })))}
        disabled={!!done} reveal={done ? { itemFlags: done.flags } : null} />

      {!isMCQ(q) && items.length > 0 && !done && (
        <button onClick={() => check(q, answers[q.id])} disabled={!hasAnswer(q, answers[q.id])} className="bg-barca-navy disabled:bg-gray-300 text-white font-semibold px-5 py-2 rounded-lg text-sm">Check</button>
      )}
      {done && (
        <div className={`rounded-lg px-4 py-3 text-sm ${done.correct ? 'bg-emerald-50 text-emerald-700' : done.got > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          {done.correct ? 'Correct!' : done.got > 0 ? `${done.got} of ${done.total} right` : 'Not quite.'}
          {q.solution && !done.correct && <p className="mt-1 text-xs whitespace-pre-wrap opacity-90">{q.solution}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => (idx + 1 >= questions.length ? finish() : setIdx(idx + 1))} className="flex-1 bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold py-2.5 rounded-lg">
          {idx + 1 >= questions.length ? 'Finish' : done ? 'Next →' : 'Skip →'}
        </button>
        <button onClick={finish} className="px-4 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg">End now</button>
      </div>
    </div>
  );
}
