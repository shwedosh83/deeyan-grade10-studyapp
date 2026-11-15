import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { boardApi, fmtTime, fmtMarks, getItems, hasAnswer, isMCQ, parseOption, sectionOf, groupMains, mainMarks, fileToJpegBase64, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';
import BoardResults from './BoardResults';
import RecentAttempts from './RecentAttempts';

const ACTIVE_KEY = 'board_active_v1';

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export default function BoardPaper() {
  const { subject } = useSubject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useNow();

  const [phase, setPhase] = useState('list'); // list | brief | exam | scan | review | grading | results
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paper, setPaper] = useState(null);
  const [questions, setQuestions] = useState([]);
  const method = 'scan'; // timed papers are always written on paper and uploaded
  const [answers, setAnswers] = useState({});
  const [readingEnd, setReadingEnd] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [curMain, setCurMain] = useState(null);
  const [result, setResult] = useState(null);
  const [resume, setResume] = useState(null);
  // scan state
  const [pages, setPages] = useState([]);       // [{ name, status, error, n }]
  const [scanMap, setScanMap] = useState({});   // q_label -> { text, confidence }
  const [unmapped, setUnmapped] = useState([]);
  const timeUpHandled = useRef(false);

  const hasBoard = SUBJECTS_WITH_BOARD.includes(subject.id);
  const qMap = useMemo(() => Object.fromEntries(questions.map(q => [q.id, q])), [questions]);
  const sections = useMemo(() => groupMains(questions), [questions]);

  // ── load paper list (and any exam in progress) ─────────────────────────────
  useEffect(() => {
    setPhase('list'); setPaper(null); setError(null); setResult(null);
    if (!hasBoard) { setLoading(false); setPapers([]); return; }
    setLoading(true);
    boardApi('boardPapers', { action: 'list', subject: subject.id })
      .then(d => setPapers((d.papers || []).filter(p => p.question_count > 0)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    try {
      const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      setResume(saved && saved.subject === subject.id && saved.deadline > Date.now() ? saved : null);
    } catch { setResume(null); }
  }, [subject.id]);

  // keep the in-progress exam safe across refreshes
  useEffect(() => {
    if (phase === 'exam' && paper) {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ subject: subject.id, paperId: paper.id, readingEnd, deadline, startedAt }));
    }
  }, [phase, paper, readingEnd, deadline, startedAt, subject.id]);

  async function openPaper(p, restore = null) {
    setError(null);
    try {
      const d = await boardApi('boardPapers', { action: 'paper', paperId: p.id });
      setPaper(d.paper); setQuestions(d.questions);
      setCurMain(d.questions[0]?.q_main ?? null);
      setPages([]); setScanMap({}); setUnmapped([]); timeUpHandled.current = false;
      if (restore) {
        setAnswers(restore.answers || {}); setReadingEnd(restore.readingEnd); setDeadline(restore.deadline); setStartedAt(restore.startedAt);
        setPhase('exam');
      } else { setAnswers({}); setPhase('brief'); }
    } catch (e) { setError(e.message); }
  }

  function startExam() {
    const t = Date.now();
    const readMs = (paper.reading_minutes || 0) * 60000;
    setStartedAt(t); setReadingEnd(t + readMs); setDeadline(t + readMs + paper.duration_minutes * 60000);
    setPhase('exam');
  }
  function skipReading() { const t = Date.now(); setReadingEnd(t); setDeadline(t + paper.duration_minutes * 60000); }

  const reading = phase === 'exam' && now < readingEnd;
  const remaining = Math.max(0, Math.round((deadline - now) / 1000));
  const readingLeft = Math.max(0, Math.round((readingEnd - now) / 1000));

  // time is up
  useEffect(() => {
    if (phase !== 'exam' || !deadline || timeUpHandled.current) return;
    if (now >= deadline) {
      timeUpHandled.current = true;
      setPhase('scan');
    }
  }, [now, phase, deadline]); // eslint-disable-line

  // ── answering ──────────────────────────────────────────────────────────────
  const setAns = (id, v) => setAnswers(a => ({ ...a, [id]: v }));

  // rule for the section a question belongs to (shown while writing)
  function sectionRule(main) {
    const rows = sections.flatMap(s => s.mains).find(m => m.main === main)?.rows || [];
    const sec = rows[0] && sectionOf(paper, rows[0]);
    return sec?.attempt_n && rows[0].mandatory === 'choice' ? sec : null;
  }

  // in review: how many choice questions were answered per section vs allowed
  function overLimitNotes() {
    const notes = [];
    for (const sec of sections) {
      const def = sectionOf(paper, { section: sec.name });
      if (!def?.attempt_n) continue;
      const choice = sec.mains.filter(m => m.rows[0].mandatory === 'choice');
      const attempted = choice.filter(m => m.rows.some(r => hasAnswer(r, answers[r.id]))).length;
      if (attempted > def.attempt_n) notes.push(`${sec.name}: you answered ${attempted} questions but only ${def.attempt_n} are allowed. Only the first ${def.attempt_n} you answered will be counted.`);
    }
    return notes;
  }

  // ── submit ─────────────────────────────────────────────────────────────────
  async function submit(source = 'scan') {
    setPhase('grading'); setError(null);
    const list = questions.filter(q => hasAnswer(q, answers[q.id])).map(q => ({
      questionId: q.id, text: answers[q.id], scanReadText: source === 'scan' ? (scanMap[q.q_label]?.text || null) : null,
    }));
    try {
      const out = await boardApi('boardGrade', {
        userId: user?.id || null, subject: subject.id, mode: 'timed', paperId: paper.id, inputMethod: source,
        secondsUsed: Math.round((Date.now() - startedAt) / 1000), answers: list,
      });
      localStorage.removeItem(ACTIVE_KEY); setResume(null);
      setResult(out); setPhase('results');
    } catch (e) { setError(e.message); setPhase('review'); }
  }

  // ── scan upload ────────────────────────────────────────────────────────────
  async function handleFiles(fileList) {
    const files = [...fileList];
    const start = pages.length;
    setPages(p => [...p, ...files.map(f => ({ name: f.name, status: 'pending' }))]);
    for (let i = 0; i < files.length; i++) {
      const idx = start + i;
      const patch = o => setPages(p => p.map((x, j) => j === idx ? { ...x, ...o } : x));
      patch({ status: 'reading' });
      try {
        const b64 = await fileToJpegBase64(files[i]);
        const out = await boardApi('boardScan', { paperId: paper.id, imageBase64: b64, mediaType: 'image/jpeg' });
        setScanMap(m => {
          const next = { ...m };
          for (const a of out.answers) next[a.q_label] = { text: next[a.q_label] ? `${next[a.q_label].text}\n${a.text}` : a.text, confidence: a.confidence };
          return next;
        });
        setUnmapped(u => [...u, ...(out.unmapped || []).map(x => ({ ...x, assigned: null }))]);
        patch({ status: 'done', n: out.answers.length });
      } catch (e) { patch({ status: 'error', error: e.message }); }
    }
  }

  function goReview() {
    const next = {};
    for (const q of questions) {
      const raw = scanMap[q.q_label]?.text;
      if (!raw) continue;
      const items = getItems(q);
      if (isMCQ(q)) { const l = parseOption(raw); if (l) next[q.id] = l; }
      else if (items.length) { const parts = raw.split(/\n|,|;/).map(s => s.replace(/^\s*\(?[a-z0-9ivx]+[).]\s+/i, '').trim()).filter(Boolean); next[q.id] = JSON.stringify(items.map((_, i) => parts[i] || '')); }
      else next[q.id] = raw;
    }
    setAnswers(a => ({ ...next, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)) }));
    setPhase('review');
  }
  function assignUnmapped(i, label) {
    const q = questions.find(x => x.q_label === label);
    if (!q) return;
    setAnswers(a => ({ ...a, [q.id]: ((a[q.id] ? a[q.id] + '\n' : '') + unmapped[i].text).trim() }));
    setUnmapped(u => u.map((x, j) => j === i ? { ...x, assigned: label } : x));
  }

  // ── screens ────────────────────────────────────────────────────────────────
  if (!hasBoard) return <Empty text={`Board papers for ${subject.label} aren't in the app yet.`} />;

  if (phase === 'grading') return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-500 text-sm">Marking your paper against the official solutions…</p>
    </div>
  );

  if (phase === 'results' && result) return (
    <BoardResults data={result} qMap={qMap} showSections title={`${subject.label} · ${paper.label} board paper`} seconds={Math.round((Date.now() - startedAt) / 1000)}
      againLabel="Another paper" onAgain={() => { setPhase('list'); setResult(null); }} onHome={() => navigate(`/${subject.id}/board`)} />
  );

  if (phase === 'list') return (
    <div className="max-w-3xl space-y-5">
      <p className="text-sm text-gray-500">Sit a real {subject.label} board paper with its real structure, choice rules and time. Write on paper, then upload your pages to be marked against the official solutions.</p>
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {resume && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800">You have a paper in progress ({fmtTime((resume.deadline - Date.now()) / 1000)} left).</p>
          <button onClick={() => openPaper({ id: resume.paperId }, resume)} className="bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">Resume</button>
        </div>
      )}
      {loading ? <p className="text-sm text-gray-400">Loading papers…</p> : papers.length === 0 ? <Empty text="No papers uploaded for this subject yet." /> : (
        [['board', 'Board papers'], ['prelim', 'School prelim papers (2025-26)']].map(([src, heading]) => {
          const group = papers.filter(p => (p.source || 'board') === src);
          if (!group.length) return null;
          return (
            <div key={src} className="space-y-2">
              {papers.some(p => (p.source || 'board') === 'prelim') && <p className="text-sm font-semibold text-gray-700">{heading}</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {group.map(p => (
                  <button key={p.id} onClick={() => openPaper(p)} className="text-left bg-white rounded-xl border-2 border-gray-200 hover:border-barca-navy p-4 transition-colors">
                    <p className="font-bold text-gray-900">{p.source === 'prelim' ? p.school : `${subject.label} ${p.label}`}</p>
                    {p.source === 'prelim' && <p className="text-xs text-barca-navy font-medium mt-0.5">{p.exam_label || 'Prelim'} · school prelim</p>}
                    <p className="text-xs text-gray-500 mt-1">{p.max_marks} marks · {p.duration_minutes >= 60 ? `${p.duration_minutes / 60} hr` : `${p.duration_minutes} min`} · {p.question_count} questions</p>
                    {p.sem && <p className="text-xs text-amber-600 mt-1">2022 split-exam paper (Semester {p.sem})</p>}
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}
      <RecentAttempts />
    </div>
  );

  if (phase === 'brief' && paper) return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">{subject.label} {paper.label}</h1>
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 text-sm text-gray-700">
        <p><b>{paper.max_marks} marks</b> · {paper.duration_minutes} minutes{paper.reading_minutes ? ` · plus ${paper.reading_minutes} minutes' reading time (you can read, not write)` : ''}</p>
        {paper.instructions && <p className="text-gray-600">{paper.instructions}</p>}
        <ul className="space-y-1">
          {(paper.sections || []).map((s, i) => (
            <li key={i} className="flex gap-2"><span className="text-barca-navy">▸</span><span><b>{s.name}</b> ({fmtMarks(s.total_marks)} marks): {s.rule || (s.compulsory ? 'Attempt all questions' : '')}</span></li>
          ))}
        </ul>
        <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">If you answer more choice questions than allowed, only the first ones you answer count — just like the real exam.</p>
      </div>
      <div className="bg-barca-navy-light rounded-xl p-5 text-sm text-barca-navy space-y-1">
        <p className="font-semibold">How this works</p>
        <p>The questions and timer are shown here. Write your answers on paper, numbering each one clearly (for example "3 (ii)"). When time is up, upload a photo of each page. You'll see exactly what the app read from your handwriting and can correct it before it's marked.</p>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <button onClick={startExam} className="bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold px-6 py-2.5 rounded-lg">Start paper</button>
        <button onClick={() => setPhase('list')} className="bg-gray-100 text-gray-700 font-semibold px-6 py-2.5 rounded-lg">Back</button>
      </div>
    </div>
  );

  if (phase === 'scan') return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Upload your written answers</h1>
      <p className="text-sm text-gray-500">Take a clear, well-lit photo of each page (or upload scans). The app reads your handwriting and matches each answer to its question number.</p>
      <label className="block bg-white border-2 border-dashed border-gray-300 hover:border-barca-navy rounded-xl p-8 text-center cursor-pointer">
        <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <p className="text-sm font-semibold text-barca-navy">Tap to add page photos</p>
        <p className="text-xs text-gray-400 mt-1">JPG or PNG · you can add more pages any time</p>
      </label>
      {pages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {pages.map((p, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
              <span className="truncate">{p.name}</span>
              <span className={`text-xs font-medium ${p.status === 'done' ? 'text-emerald-600' : p.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                {p.status === 'done' ? `Read ✓ (${p.n} answers)` : p.status === 'error' ? p.error : p.status === 'reading' ? 'Reading…' : 'Waiting…'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={goReview} disabled={!pages.some(p => p.status === 'done')} className="bg-barca-navy disabled:bg-gray-300 text-white font-semibold px-6 py-2.5 rounded-lg">Review what was read →</button>
        <button onClick={() => setPhase('exam')} className="bg-gray-100 text-gray-700 font-semibold px-6 py-2.5 rounded-lg">Back to paper</button>
      </div>
    </div>
  );

  if (phase === 'review') return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Check what was read</h1>
        <p className="text-sm text-gray-500">Handwriting can be misread. Fix anything that's wrong — this exact text is what gets marked.</p>
      </div>
      {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {unmapped.some(u => !u.assigned) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Text the app couldn't match to a question</p>
          {unmapped.map((u, i) => !u.assigned && (
            <div key={i} className="bg-white rounded-lg p-3 text-sm space-y-1">
              <p className="whitespace-pre-wrap text-gray-700">{u.text}</p><p className="text-xs text-gray-400">{u.note}</p>
              <select defaultValue="" onChange={e => e.target.value && assignUnmapped(i, e.target.value)} className="border rounded px-2 py-1 text-xs">
                <option value="">Add to question…</option>{questions.map(q => <option key={q.id} value={q.q_label}>{q.q_label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {overLimitNotes().map((n, i) => <p key={i} className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{n}</p>)}
      {sections.map(sec => (
        <div key={sec.name} className="space-y-3">
          <h2 className="font-bold text-barca-navy">{sec.name}</h2>
          {sec.mains.map(m => m.rows.filter(r => scanMap[r.q_label] || hasAnswer(r, answers[r.id])).map(r => (
            <div key={r.id} className="space-y-1">
              {scanMap[r.q_label] && <p className="text-xs text-gray-400">Read from your page ({scanMap[r.q_label].confidence} confidence): <span className="italic">{scanMap[r.q_label].text.slice(0, 120)}{scanMap[r.q_label].text.length > 120 ? '…' : ''}</span></p>}
              <QuestionCard q={r} compact value={answers[r.id] || ''} onChange={v => setAns(r.id, v)} />
            </div>
          )))}
        </div>
      ))}
      <p className="text-xs text-gray-500">Only questions the app found an answer for are shown. If something is missing, go back and add a clearer photo of that page.</p>
      <div className="flex gap-3 sticky bottom-4">
        <button onClick={() => submit('scan')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow">Mark my paper</button>
        <button onClick={() => setPhase('scan')} className="bg-gray-100 text-gray-700 font-semibold px-6 py-2.5 rounded-lg">Back to pages</button>
      </div>
    </div>
  );

  // ── exam ───────────────────────────────────────────────────────────────────
  if (phase !== 'exam' || !paper) return null;
  const main = sections.flatMap(s => s.mains).find(m => m.main === curMain) || sections[0]?.mains[0];
  const rule = main ? sectionRule(main.main) : null;
  const low = !reading && remaining < 300;

  return (
    <div className="flex gap-5 items-start">
      <aside className="w-48 shrink-0 sticky top-4 space-y-3 hidden md:block">
        <div className={`rounded-xl p-3 text-center ${reading ? 'bg-amber-50 border border-amber-200' : low ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200'}`}>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{reading ? 'Reading time' : 'Time left'}</p>
          <p className={`text-2xl font-bold tabular-nums ${low ? 'text-red-600' : 'text-gray-900'}`}>{fmtTime(reading ? readingLeft : remaining)}</p>
          {reading && <button onClick={skipReading} className="text-xs text-barca-navy underline mt-1">Start writing now</button>}
        </div>
        {sections.map(sec => (
          <div key={sec.name}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">{sec.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {sec.mains.map(m => {
                return (
                  <button key={m.main} onClick={() => setCurMain(m.main)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold border-2 ${m.main === main?.main ? 'border-barca-navy bg-barca-navy text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                    title={`${fmtMarks(mainMarks(m))} marks${m.rows[0].mandatory === 'choice' ? ' · choice' : ''}`}>{m.main}</button>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={() => setPhase('scan')} className="w-full bg-barca-navy hover:bg-barca-navy-dark text-white text-sm font-semibold py-2 rounded-lg">Done writing — upload pages</button>
      </aside>

      <div className="flex-1 min-w-0 space-y-4 max-w-3xl">
        <div className="md:hidden flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2">
          <span className={`font-bold tabular-nums ${low ? 'text-red-600' : ''}`}>{fmtTime(reading ? readingLeft : remaining)}</span>
          <select value={main?.main} onChange={e => setCurMain(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
            {sections.flatMap(s => s.mains).map(m => <option key={m.main} value={m.main}>Question {m.main}</option>)}
          </select>
        </div>
        {reading && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">Reading time — read the whole paper and plan which choice questions to attempt. You can't write yet.</div>}
        {!reading && <div className="bg-barca-navy-light text-barca-navy text-sm rounded-xl px-4 py-3">Write your answers on paper and number each one. When you're done (or time is up), upload your pages.</div>}
        {rule && (
          <div className="text-sm rounded-xl px-4 py-3 border bg-amber-50 border-amber-200 text-amber-800">
            <b>{rule.name}</b>: answer any <b>{rule.attempt_n}</b>{rule.out_of ? ` of ${rule.out_of}` : ''} questions. If you answer more, only the first {rule.attempt_n} you answer count.
          </div>
        )}
        <h2 className="text-lg font-bold text-gray-900">Question {main?.main} <span className="text-sm font-normal text-gray-400">· {fmtMarks(main ? mainMarks(main) : 0)} marks</span></h2>
        {main?.rows.map(r => <QuestionCard key={r.id} q={r} questionOnly compact />)}
        <div className="flex justify-between pt-2">
          {(() => { const all = sections.flatMap(s => s.mains); const i = all.findIndex(m => m.main === main?.main);
            return (<>
              <button disabled={i <= 0} onClick={() => setCurMain(all[i - 1].main)} className="px-4 py-2 rounded-lg bg-gray-100 disabled:opacity-30 text-sm font-semibold">← Previous</button>
              <button disabled={i >= all.length - 1} onClick={() => setCurMain(all[i + 1].main)} className="px-4 py-2 rounded-lg bg-barca-navy text-white disabled:opacity-30 text-sm font-semibold">Next →</button>
            </>); })()}
        </div>
        {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      </div>

    </div>
  );
}

function Empty({ text }) {
  return <div className="max-w-xl bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">{text}</div>;
}
