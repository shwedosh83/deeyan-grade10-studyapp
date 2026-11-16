import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { useProgress } from '../../context/ProgressContext';
import { boardApi, fmtTime, fmtMarks, getItems, hasAnswer, isMCQ, parseOption, sectionOf, groupMains, mainMarks, fileToJpegBase64, SUBJECTS_WITH_BOARD } from '../../lib/board';
import QuestionCard from './QuestionCard';
import BoardResults from './BoardResults';
import RecentAttempts from './RecentAttempts';
import { EmptyCard, ErrorCard, Notice, Spinner, TimerPill } from './ui';

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
  const { refresh } = useProgress();
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
  const [view, setView] = useState('pdf');      // 'pdf' = the original printed paper (when we have it), 'text' = question by question
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
      refresh();
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

  if (phase === 'grading') return <Spinner label="Marking your paper against the official solutions…" />;

  if (phase === 'results' && result) return (
    <BoardResults data={result} qMap={qMap} showSections title={`${subject.label} · ${paper.label} board paper`} seconds={Math.round((Date.now() - startedAt) / 1000)}
      againLabel="Another paper" onAgain={() => { setPhase('list'); setResult(null); }} onHome={() => navigate(`/${subject.id}/board`)} />
  );

  if (phase === 'list') return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div>
        <p className="eyebrow">Timed paper</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">Sit a real {subject.label} board paper with its real structure, choice rules and time. Write on paper, then upload your pages to be marked against the official solutions.</p>
      </div>
      {error && <ErrorCard title="Couldn't load that" message={error} />}
      {resume && (
        <Notice tone="warn" title="You have a paper in progress"
          action={<button onClick={() => openPaper({ id: resume.paperId }, resume)} className="btn-primary !py-2">Resume</button>}>
          {fmtTime((resume.deadline - Date.now()) / 1000)} left on the clock.
        </Notice>
      )}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
      ) : papers.length === 0 ? <Empty text="No papers uploaded for this subject yet." /> : (
        [['board', 'Board papers'], ['prelim', 'School prelim papers (2025-26)']].map(([src, heading]) => {
          const group = papers.filter(p => (p.source || 'board') === src);
          if (!group.length) return null;
          return (
            <div key={src} className="space-y-3">
              {papers.some(p => (p.source || 'board') === 'prelim') && <h2 className="section-title">{heading}</h2>}
              <div className="grid gap-3 sm:grid-cols-2">
                {group.map(p => (
                  <button key={p.id} onClick={() => openPaper(p)} className="card card-hover group p-5 text-left hover:border-brand/50">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-base font-bold text-ink">{p.source === 'prelim' ? p.school : `${subject.label} ${p.label}`}</p>
                      <span className={`pill shrink-0 ${p.source === 'prelim' ? 'bg-brand-soft text-brand-ink' : 'bg-accent-soft text-accent'}`}>{p.source === 'prelim' ? 'Prelim' : 'Board'}</span>
                    </div>
                    {p.source === 'prelim' && <p className="mt-0.5 text-xs font-medium text-brand">{p.exam_label || 'Prelim'} · school prelim</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                      <span className="pill bg-surface-2 text-ink-2">{p.max_marks} marks</span>
                      <span className="pill bg-surface-2 text-ink-2">{p.duration_minutes >= 60 ? `${p.duration_minutes / 60} hr` : `${p.duration_minutes} min`}</span>
                      <span className="pill bg-surface-2 text-ink-2">{p.question_count} questions</span>
                    </div>
                    {p.sem && <p className="mt-2 text-xs text-warn">2022 split-exam paper (Semester {p.sem})</p>}
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
    <div className="max-w-2xl space-y-6 animate-slide-up">
      <div>
        <p className="eyebrow">Before you start</p>
        <h1 className="page-title">{subject.label} {paper.label}</h1>
      </div>
      <div className="card space-y-4 p-6 text-sm text-ink-2">
        <div className="flex flex-wrap gap-2">
          <span className="pill bg-accent-soft py-1 text-sm text-accent">{paper.max_marks} marks</span>
          <span className="pill bg-surface-2 py-1 text-sm text-ink">{paper.duration_minutes} minutes</span>
          {paper.reading_minutes ? <span className="pill bg-brand-soft py-1 text-sm text-brand-ink">+ {paper.reading_minutes} min reading</span> : null}
        </div>
        {paper.reading_minutes ? <p className="text-xs text-ink-3">Plus {paper.reading_minutes} minutes' reading time (you can read, not write).</p> : null}
        {paper.instructions && <p className="text-ink-2">{paper.instructions}</p>}
        <ul className="divide-y divide-line rounded-xl border border-line">
          {(paper.sections || []).map((s, i) => (
            <li key={i} className="flex gap-3 px-4 py-3"><span className="text-brand">▸</span><span><b className="text-ink">{s.name}</b> <span className="text-ink-3">({fmtMarks(s.total_marks)} marks)</span>: {s.rule || (s.compulsory ? 'Attempt all questions' : '')}</span></li>
          ))}
        </ul>
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-ink-2">If you answer more choice questions than allowed, only the first ones you answer count — just like the real exam.</p>
      </div>
      <div className="card space-y-1.5 border-brand/30 bg-brand-soft p-5 text-sm text-ink-2">
        <p className="font-semibold text-brand-ink">How this works</p>
        <p>The questions and timer are shown here. Write your answers on paper, numbering each one clearly (for example "3 (ii)"). When time is up, upload a photo of each page. You'll see exactly what the app read from your handwriting and can correct it before it's marked.</p>
      </div>
      {error && <ErrorCard title="Something went wrong" message={error} />}
      <div className="flex gap-3">
        <button onClick={startExam} className="btn-primary px-8">Start paper</button>
        <button onClick={() => setPhase('list')} className="btn-secondary">Back</button>
      </div>
    </div>
  );

  if (phase === 'scan') return (
    <div className="max-w-2xl space-y-6 animate-slide-up">
      <div>
        <p className="eyebrow">Step 1 of 2</p>
        <h1 className="page-title">Upload your written answers</h1>
        <p className="mt-1 text-sm text-ink-2">Take a clear, well-lit photo of each page (or upload scans). The app reads your handwriting and matches each answer to its question number.</p>
      </div>
      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-line bg-surface p-10 text-center transition duration-200 hover:border-brand hover:bg-brand-soft/40">
        <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        </span>
        <p className="text-sm font-semibold text-brand">Tap to add page photos</p>
        <p className="mt-1 text-xs text-ink-3">JPG or PNG · you can add more pages any time</p>
      </label>
      {pages.length > 0 && (
        <div className="card divide-y divide-line overflow-hidden">
          {pages.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm animate-fade-in">
              <span className="truncate text-ink">{p.name}</span>
              <span className={`pill shrink-0 ${p.status === 'done' ? 'bg-good-soft text-good' : p.status === 'error' ? 'bg-bad-soft text-bad' : 'bg-surface-2 text-ink-3'}`}>
                {p.status === 'done' ? `Read ✓ (${p.n} answers)` : p.status === 'error' ? p.error : p.status === 'reading' ? 'Reading…' : 'Waiting…'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={goReview} disabled={!pages.some(p => p.status === 'done')} className="btn-primary">Review what was read →</button>
        <button onClick={() => setPhase('exam')} className="btn-secondary">Back to paper</button>
      </div>
    </div>
  );

  if (phase === 'review') return (
    <div className="max-w-3xl space-y-6 animate-slide-up">
      <div>
        <p className="eyebrow">Step 2 of 2</p>
        <h1 className="page-title">Check what was read</h1>
        <p className="mt-1 text-sm text-ink-2">Handwriting can be misread. Fix anything that's wrong — this exact text is what gets marked.</p>
      </div>
      {error && <ErrorCard title="Your paper couldn't be marked just now" message={error} hint="Nothing is lost — your answers are still here. Try “Mark my paper” again in a little while." />}
      {unmapped.some(u => !u.assigned) && (
        <div className="card space-y-3 border-warn/40 p-5">
          <p className="text-sm font-semibold text-warn">Text the app couldn't match to a question</p>
          {unmapped.map((u, i) => !u.assigned && (
            <div key={i} className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
              <p className="whitespace-pre-wrap text-ink-2">{u.text}</p><p className="text-xs text-ink-3">{u.note}</p>
              <select defaultValue="" onChange={e => e.target.value && assignUnmapped(i, e.target.value)} className="input !w-auto !py-1.5 text-xs">
                <option value="">Add to question…</option>{questions.map(q => <option key={q.id} value={q.q_label}>{q.q_label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {overLimitNotes().map((n, i) => <Notice key={i} tone="bad">{n}</Notice>)}
      {sections.map(sec => (
        <div key={sec.name} className="space-y-3">
          <h2 className="section-title">{sec.name}</h2>
          {sec.mains.map(m => m.rows.filter(r => scanMap[r.q_label] || hasAnswer(r, answers[r.id])).map(r => (
            <div key={r.id} className="space-y-1.5">
              {scanMap[r.q_label] && <p className="text-xs text-ink-3">Read from your page <span className="pill bg-surface-2 text-ink-2">{scanMap[r.q_label].confidence} confidence</span> <span className="italic">{scanMap[r.q_label].text.slice(0, 120)}{scanMap[r.q_label].text.length > 120 ? '…' : ''}</span></p>}
              <QuestionCard q={r} compact value={answers[r.id] || ''} onChange={v => setAns(r.id, v)} />
            </div>
          )))}
        </div>
      ))}
      <p className="text-xs text-ink-3">Only questions the app found an answer for are shown. If something is missing, go back and add a clearer photo of that page.</p>
      <div className="sticky bottom-4 flex gap-3 rounded-2xl border border-line bg-surface/90 p-3 shadow-lift backdrop-blur">
        <button onClick={() => submit('scan')} className="btn-primary flex-1">Mark my paper</button>
        <button onClick={() => setPhase('scan')} className="btn-secondary">Back to pages</button>
      </div>
    </div>
  );

  // ── exam ───────────────────────────────────────────────────────────────────
  if (phase !== 'exam' || !paper) return null;
  const main = sections.flatMap(s => s.mains).find(m => m.main === curMain) || sections[0]?.mains[0];
  const rule = main ? sectionRule(main.main) : null;
  const low = !reading && remaining < 300;
  const timerState = reading ? 'reading' : low ? 'bad' : remaining < 900 ? 'warn' : 'calm';
  const allMains = sections.flatMap(s => s.mains);
  const posIdx = allMains.findIndex(m => m.main === main?.main);
  const showPdf = !!paper.pdf_url && view === 'pdf';
  const viewToggle = paper.pdf_url ? (
    <div className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="How to show the paper">
      {[['pdf', 'Original paper'], ['text', 'Text view']].map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${view === v ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
      ))}
    </div>
  ) : null;

  return (
    <div className="flex items-start gap-6">
      <aside className="sticky top-4 hidden w-56 shrink-0 space-y-4 md:block">
        <div className="card space-y-2 p-4 text-center">
          <p className="eyebrow">{reading ? 'Reading time' : 'Time left'}</p>
          <TimerPill big text={fmtTime(reading ? readingLeft : remaining)} state={timerState} />
          {reading && <button onClick={skipReading} className="btn-ghost w-full !py-1.5 text-xs text-brand">Start writing now</button>}
        </div>
        {viewToggle && <div className="flex justify-center">{viewToggle}</div>}
        {!showPdf && <div className="card space-y-4 p-4">
          {sections.map(sec => (
            <div key={sec.name}>
              <p className="eyebrow mb-2">{sec.name}</p>
              <div className="flex flex-wrap gap-1.5">
                {sec.mains.map(m => {
                  const cur = m.main === main?.main;
                  const choice = m.rows[0].mandatory === 'choice';
                  return (
                    <button key={m.main} onClick={() => setCurMain(m.main)}
                      className={`h-9 w-9 rounded-full text-sm font-semibold transition duration-150 ${cur
                        ? 'bg-brand text-white shadow-glow dark:text-slate-950'
                        : choice ? 'border border-dashed border-warn/60 bg-warn-soft text-ink-2 hover:border-warn' : 'border border-line bg-surface-2 text-ink-2 hover:border-brand/50 hover:text-ink'}`}
                      title={`${fmtMarks(mainMarks(m))} marks${choice ? ' · choice' : ''}`}>{m.main}</button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-3">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" />Current</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-warn/60 bg-warn-soft" />Choice</span>
          </div>
        </div>}
        <button onClick={() => setPhase('scan')} className="btn-primary w-full">Done writing — upload pages</button>
      </aside>

      {showPdf ? (
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between text-xs text-ink-3">
          <span>{paper.label} · original paper</span>
          <a href={paper.pdf_url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:text-brand-ink">Open in a new tab ↗</a>
        </div>
        {reading && <Notice tone="brand" title="Reading time">Read the whole paper and plan which choice questions to attempt. You can't write yet.</Notice>}
        {!reading && <Notice tone="brand">Write your answers on paper and number each one. When you're done (or time is up), upload your pages.</Notice>}
        <div className="card overflow-hidden p-0">
          <iframe title={`${paper.label} question paper`} src={`${paper.pdf_url}#view=FitH`} className="block h-[calc(100vh-10rem)] min-h-[600px] w-full bg-white" />
        </div>
        <button onClick={() => setPhase('scan')} className="btn-primary w-full md:hidden">Done writing — upload pages</button>
        {error && <ErrorCard title="Something went wrong" message={error} />}
      </div>
      ) : (
      <div className="min-w-0 max-w-3xl flex-1 space-y-4">
        <div className="card flex items-center justify-between gap-3 px-4 py-2.5 md:hidden">
          <TimerPill text={fmtTime(reading ? readingLeft : remaining)} state={timerState} />
          <select value={main?.main} onChange={e => setCurMain(Number(e.target.value))} className="input !w-auto !py-1.5">
            {sections.flatMap(s => s.mains).map(m => <option key={m.main} value={m.main}>Question {m.main}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <span>{paper.label}</span>
            <span className="tabular-nums">{posIdx + 1} / {allMains.length}</span>
          </div>
          <div className="progress-track"><div className="progress-fill bg-brand" style={{ width: `${allMains.length ? ((posIdx + 1) / allMains.length) * 100 : 0}%` }} /></div>
        </div>
        {reading && <Notice tone="brand" title="Reading time">Read the whole paper and plan which choice questions to attempt. You can't write yet.</Notice>}
        {!reading && <Notice tone="brand">Write your answers on paper and number each one. When you're done (or time is up), upload your pages.</Notice>}
        {rule && (
          <Notice tone="warn">
            <span className="text-ink-2"><b className="text-ink">{rule.name}</b>: answer any <b className="text-ink">{rule.attempt_n}</b>{rule.out_of ? ` of ${rule.out_of}` : ''} questions. If you answer more, only the first {rule.attempt_n} you answer count.</span>
          </Notice>
        )}
        <div key={main?.main} className="space-y-4 animate-slide-in-right">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-2xl font-bold text-ink">Question {main?.main}</h2>
            <span className="pill bg-accent-soft text-accent">{fmtMarks(main ? mainMarks(main) : 0)} marks</span>
          </div>
          {main?.rows.map(r => <QuestionCard key={r.id} q={r} questionOnly compact />)}
        </div>
        <div className="flex justify-between pt-2">
          {(() => { const all = sections.flatMap(s => s.mains); const i = all.findIndex(m => m.main === main?.main);
            return (<>
              <button disabled={i <= 0} onClick={() => setCurMain(all[i - 1].main)} className="btn-secondary">← Previous</button>
              <button disabled={i >= all.length - 1} onClick={() => setCurMain(all[i + 1].main)} className="btn-primary">Next →</button>
            </>); })()}
        </div>
        {error && <ErrorCard title="Something went wrong" message={error} />}
      </div>
      )}

    </div>
  );
}

function Empty({ text }) {
  return <EmptyCard text={text} />;
}
