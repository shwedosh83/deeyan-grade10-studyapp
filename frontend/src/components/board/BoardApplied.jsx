import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { boardApi, fmtMarks, hasAnswer, KIND_LABELS, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';

const KINDS = ['numerical', 'data_diagram', 'reasoning', 'case', 'program', 'map'];
const COUNTS = [5, 10, 15];

export default function BoardApplied() {
  const { subject } = useSubject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('setup'); // setup | loading | running | done
  const [kinds, setKinds] = useState([]);
  const [chapter, setChapter] = useState('');
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
    setPhase('setup'); setKinds([]); setChapter(''); setInfo(null); setError(null);
    if (!hasBoard) return;
    boardApi('boardPapers', { action: 'applied', subject: subject.id, count: 1, userId: user?.id || null })
      .then(d => { setChapters(d.chapters || []); setInfo(d); }).catch(() => {});
  }, [subject.id]); // eslint-disable-line

  async function start() {
    setPhase('loading'); setError(null);
    try {
      const d = await boardApi('boardPapers', { action: 'applied', subject: subject.id, kinds, chapter: chapter || null, count, userId: user?.id || null });
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
    if (idx + 1 >= questions.length) { setPhase('done'); return; }
    setIdx(idx + 1); setAnswer(''); setFb(null);
  }

  if (!hasBoard) return <p className="text-gray-500 text-sm">Board papers for {subject.label} aren't in the app yet.</p>;

  // Only the kinds that exist in this subject's question pool (all of them until the info call returns).
  const availableKinds = info?.kinds ? KINDS.filter(k => info.kinds.includes(k)) : KINDS;

  if (phase === 'setup' || phase === 'loading') return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-gray-500">Board-paper questions that test using ideas in new situations — case studies, numericals, data and diagram reading — drawn from all {subject.label} papers. Marked against the official solution with the exact points you missed.{info ? ` ${info.pool_size} to practise (${info.unseen} not yet tried).` : ''}</p>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Type of question <span className="text-gray-400 font-normal">(none selected = all)</span></p>
          <div className="flex flex-wrap gap-2">{availableKinds.map(k => (
            <button key={k} onClick={() => setKinds(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])} className={`px-3 py-1.5 rounded-full text-sm border-2 ${kinds.includes(k) ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500'}`}>{KIND_LABELS[k]}</button>
          ))}</div>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Chapter</p>
          <select value={chapter} onChange={e => setChapter(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">All chapters</option>{chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">How many?</p>
          <div className="flex gap-2">{COUNTS.map(n => <button key={n} onClick={() => setCount(n)} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${count === n ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 text-gray-500'}`}>{n}</button>)}</div>
        </div>
        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={start} disabled={phase === 'loading'} className="w-full bg-barca-navy hover:bg-barca-navy-dark disabled:bg-gray-300 text-white font-semibold py-3 rounded-lg">{phase === 'loading' ? 'Loading…' : 'Start'}</button>
      </div>
    </div>
  );

  if (phase === 'done') {
    const got = log.reduce((s, x) => s + x.got, 0), max = log.reduce((s, x) => s + x.max, 0);
    return (
      <div className="max-w-xl bg-white rounded-xl border border-gray-200 p-8 text-center space-y-3">
        <p className="text-sm text-gray-500">{subject.label} applied practice</p>
        <p className="text-5xl font-bold text-barca-navy">{fmtMarks(got)} <span className="text-2xl text-gray-400">/ {fmtMarks(max)}</span></p>
        <p className="text-xs text-gray-400">{log.length} of {questions.length} questions marked</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => setPhase('setup')} className="bg-barca-navy text-white font-semibold px-5 py-2 rounded-lg text-sm">Practise more</button>
          <button onClick={() => navigate(`/${subject.id}/board`)} className="bg-gray-100 text-gray-700 font-semibold px-5 py-2 rounded-lg text-sm">Board practice home</button>
        </div>
      </div>
    );
  }

  const r = fb?.results?.[0];
  const needsSelf = r && (r.marks_awarded === null || r.marks_awarded === undefined);
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between"><p className="font-semibold text-gray-700">Question {idx + 1} of {questions.length}</p>
        <span className="text-xs text-gray-400">{q.paper_id.replace(/^[a-z_]+?_(\d{4}.*)$/, '$1').toUpperCase()} board paper</span></div>
      <QuestionCard q={q} value={answer} onChange={setAnswer} disabled={!!fb} />
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!fb && <button onClick={submit} disabled={busy || !hasAnswer(q, answer)} className="w-full bg-barca-navy hover:bg-barca-navy-dark disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg">{busy ? 'Marking…' : 'Submit answer'}</button>}
      {r && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-lg font-bold tabular-nums">{needsSelf ? 'Mark yourself' : <>{fmtMarks(r.marks_awarded)} <span className="text-gray-400 font-normal">/ {fmtMarks(r.marks)}</span></>}</p>
          {r.points_hit?.length > 0 && <ul className="text-sm text-emerald-700 space-y-0.5">{r.points_hit.map((p, i) => <li key={i}>✓ {p}</li>)}</ul>}
          {r.points_missed?.length > 0 && <div className="bg-red-50 rounded p-3"><p className="text-xs font-semibold text-red-700 mb-1">What was missing</p><ul className="text-sm text-red-700 space-y-0.5">{r.points_missed.map((p, i) => <li key={i}>＋ {p}</li>)}</ul></div>}
          {r.feedback && <p className="text-xs text-gray-500 italic">{r.feedback}</p>}
          <div className="bg-emerald-50 rounded p-3"><p className="text-xs font-semibold text-emerald-700 mb-1">Official solution</p><p className="text-sm text-emerald-900 whitespace-pre-wrap">{r.solution}</p></div>
          {needsSelf && (
            <div className="flex items-center gap-2 text-sm">
              <label>My marks: <input type="number" min="0" max={r.marks} step="0.5" value={selfMarks} onChange={e => setSelfMarks(e.target.value)} className="border-2 border-gray-200 rounded px-2 py-1 w-20 ml-1" /> / {fmtMarks(r.marks)}</label>
              <button onClick={saveSelf} className="bg-amber-600 text-white font-semibold px-3 py-1.5 rounded-lg">Save</button>
            </div>
          )}
          <button onClick={next} disabled={needsSelf} className="w-full bg-barca-navy disabled:bg-gray-300 text-white font-semibold py-2.5 rounded-lg">{idx + 1 >= questions.length ? 'Finish' : 'Next question →'}</button>
        </div>
      )}
    </div>
  );
}
