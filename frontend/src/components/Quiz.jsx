import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { subjectStyle } from '../lib/subjectStyle';
import QuestionDots from './quiz/QuestionDots';

const QUESTION_COUNTS = [5, 10, 15, 20, 30];

// Normalise MCQ answer to a single lowercase letter (a/b/c/d).
// Handles stored values like 'c', 'C', '(C)', 'c)', '(C) its geometric centre...'
function correctMCQLetter(answer) {
  if (!answer) return null;
  const t = answer.trim();
  if (/^[a-d]$/i.test(t)) return t.toLowerCase();
  const m = t.match(/\b([A-Da-d])\b/);
  return m ? m[1].toLowerCase() : null;
}

// Get option text for a key regardless of whether keys are upper or lower case.
function optionText(options, key) {
  if (!options || !key) return '';
  return options[key] ?? options[key.toUpperCase()] ?? options[key.toLowerCase()] ?? '';
}

const TYPE_LABELS = {
  mcq: 'MCQ',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
  numerical: 'Numerical',
};

// The questions table has no `marks` column yet, so infer from type
// (mirrors the fallback the backend evaluator uses) unless a question
// carries an explicit marks value.
function questionMarks(q) {
  if (q.marks) return q.marks;
  if (q.type === 'mcq') return 1;
  if (q.type === 'long_answer') return 4;
  return 2; // short_answer, numerical
}

const QUESTION_TYPES = [
  { value: null,            label: 'Mixed',        subjects: null },
  { value: 'mcq',          label: 'MCQ',           subjects: null },
  { value: 'short_answer', label: 'Short Answer',  subjects: null },
  { value: 'long_answer',  label: 'Long Answer',   subjects: null },
  { value: 'numerical',    label: 'Numericals',    subjects: ['physics', 'chemistry'] },
];

const QUESTION_SOURCES = [
  { value: null,      label: 'All Sources',   subjects: null },
  { value: 'prelim',  label: 'Prelim Papers', subjects: ['geography'] },
  { value: 'board',   label: 'Unsolved board papers', subjects: ['biology', 'history_civics', 'chemistry', 'geography', 'physics'] },
];

export default function Quiz() {
  const navigate = useNavigate();
  const { subject } = useSubject();
  const { user } = useAuth();
  const { refresh: refreshProgress } = useProgress();
  const [searchParams] = useSearchParams();
  const preselectedChapter = searchParams.get('chapter') ? parseInt(searchParams.get('chapter')) : null;

  const [phase, setPhase] = useState('setup');
  const [quizSize, setQuizSize] = useState(10);
  const [questionType, setQuestionType] = useState(null);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [selectedChapters, setSelectedChapters] = useState(
    preselectedChapter ? new Set([preselectedChapter]) : new Set()
  );
  const [allChapters, setAllChapters] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // MCQ state
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  // Short answer state
  const [typedAnswer, setTypedAnswer] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [evaluating, setEvaluating] = useState(false);

  // Shared state
  const [isAnswered, setIsAnswered] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [results, setResults] = useState([]);
  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [chapterName, setChapterName] = useState('All Chapters');
  const [error, setError] = useState(null);

  // Coach / hint state
  const [hint, setHint] = useState(null);
  const [loadingHint, setLoadingHint] = useState(false);

  // Per-question state cache for Prev/Next navigation
  const [questionStates, setQuestionStates] = useState({});

  // Chapter progress for continue-mode UX
  const [singleChapterProgress, setSingleChapterProgress] = useState(null);
  const [allChapterProgress, setAllChapterProgress] = useState([]);

  // Load chapters dynamically when subject changes
  useEffect(() => {
    setSelectedChapters(preselectedChapter ? new Set([preselectedChapter]) : new Set());
    setSourceFilter(null);
    setQuestionType(null);
    setError(null);
    setPhase('setup');
    supabase
      .rpc('get_chapters_for_subject', { p_subject: subject.id })
      .then(({ data }) => {
        if (!data) return;
        setAllChapters(
          data
            .filter(c => c.chapter_name !== 'Prelim Papers')
            .map(c => ({ id: c.chapter_id, name: c.chapter_name }))
        );
      });
  }, [subject]);

  // Fetch chapter progress whenever a single chapter is selected
  useEffect(() => {
    if (selectedChapters.size !== 1 || !user?.id) {
      setSingleChapterProgress(null);
      return;
    }
    const chapterId = [...selectedChapters][0];
    fetch('/api/chapterProgress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, subject: subject.id }),
    })
      .then(r => r.json())
      .then(({ progress }) => {
        setAllChapterProgress(progress || []);
        const found = (progress || []).find(p => p.chapter_id === chapterId);
        setSingleChapterProgress(found || null);
      })
      .catch(() => setSingleChapterProgress(null));
  }, [selectedChapters, subject, user?.id]);

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const voiceSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setTypedAnswer(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  function toggleChapter(id) {
    setError(null);
    setSelectedChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllChapters() {
    setError(null);
    setSelectedChapters(prev => prev.size === allChapters.length ? new Set() : new Set(allChapters.map(c => c.id)));
  }

  async function startQuiz() {
    // Compute continue mode here too (outside setup screen scope)
    const _isSingle = selectedChapters.size === 1;
    const _complete = _isSingle && singleChapterProgress?.completion_pct >= 100;
    const _continueMode = _isSingle && singleChapterProgress && !_complete;
    const effectiveQuizSize = _continueMode ? 10 : quizSize;

    setPhase('loading');
    setError(null);

    // Determine which chapters to query
    const chaptersToQuery = selectedChapters.size === 0
      ? [null]  // null = all chapters in RPC
      : [...selectedChapters];

    // Build chapter label
    if (selectedChapters.size === 0) {
      setChapterName('All Chapters');
    } else if (selectedChapters.size === 1) {
      const ch = allChapters.find(c => c.id === [...selectedChapters][0]);
      setChapterName(ch?.name || 'Selected Chapter');
    } else {
      setChapterName(`${selectedChapters.size} Chapters`);
    }

    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .insert({ subject: subject.id, chapter_id: selectedChapters.size === 1 ? [...selectedChapters][0] : null, user_id: user?.id })
      .select()
      .single();

    if (sessionErr) { setError('Could not start session'); setPhase('setup'); return; }
    setSessionId(session.id);

    let allQuestions = [];

    // All question fetching goes through /api/questions which applies
    // spaced repetition: unseen first → wrong → correct (oldest)
    {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.id,
          source: sourceFilter,
          chapters: chaptersToQuery[0] !== null ? chaptersToQuery : [],
          questionType,
          limit: effectiveQuizSize,
          userId: user?.id || null,
        }),
      });
      const json = await res.json();
      allQuestions = json.questions || [];
    }

    if (allQuestions.length === 0) {
      setError('No questions found for this selection.');
      setPhase('setup');
      return;
    }

    setQuestions(allQuestions);
    setCurrentIndex(0);
    setResults([]);
    resetAnswerState();
    setPhase('running');
  }

  function saveCurrentState(index) {
    setQuestionStates(prev => ({
      ...prev,
      [index]: { selectedAnswer, typedAnswer, evaluation, isAnswered, explanation, hint },
    }));
  }

  function restoreState(index) {
    const saved = questionStates[index];
    if (saved) {
      setSelectedAnswer(saved.selectedAnswer);
      setTypedAnswer(saved.typedAnswer);
      setEvaluation(saved.evaluation);
      setIsAnswered(saved.isAnswered);
      setExplanation(saved.explanation);
      setHint(saved.hint);
    } else {
      resetAnswerState();
    }
  }

  function resetAnswerState() {
    setSelectedAnswer(null);
    setTypedAnswer('');
    setEvaluation(null);
    setIsAnswered(false);
    setExplanation(null);
    setHint(null);
  }

  async function getHint() {
    const q = questions[currentIndex];
    setLoadingHint(true);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hint',
          data: { question: q.question, correctAnswer: q.answer, subject: subject.id, skill: q.skill },
        }),
      });
      const data = await res.json();
      setHint(data.message);
    } catch {
      setHint('Think about the core concept behind this topic. You got this! 💪');
    }
    setLoadingHint(false);
  }

  async function handleMCQAnswer(answer) {
    if (isAnswered) return;
    const q = questions[currentIndex];
    const isCorrect = answer === correctMCQLetter(q.answer);
    setSelectedAnswer(answer);
    setIsAnswered(true);
    await recordAnswer(q, answer, isCorrect);
    setResults((prev) => [...prev, { question: q, userAnswer: answer, isCorrect, type: 'mcq' }]);
  }

  async function handleShortAnswerSubmit() {
    if (isAnswered || !typedAnswer.trim()) return;
    const q = questions[currentIndex];
    setEvaluating(true);
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          modelAnswer: q.answer,
          studentAnswer: typedAnswer,
          skill: q.skill,
          type: q.type,
          marks: questionMarks(q),
          subject: subject.id,
          chapterId: q.chapter_id,
          chapterName: q.chapter_name,
        }),
      });
      const data = await res.json();
      setEvaluation(data);
      const isCorrect = data.score >= 0.5;
      setIsAnswered(true);
      await recordAnswer(q, typedAnswer, isCorrect);
      setResults((prev) => [...prev, { question: q, userAnswer: typedAnswer, isCorrect, score: data.score, feedback: data.feedback, type: 'short_answer' }]);
    } catch {
      setEvaluation({ result: 'unavailable' });
      setIsAnswered(true);
    }
    setEvaluating(false);
  }

  async function handleSelfMark(q, mark) {
    const score = mark === 'correct' ? 1 : mark === 'partial' ? 0.5 : 0;
    setEvaluation({ result: mark, score, feedback: 'Self-marked.' });
    await recordAnswer(q, typedAnswer, score >= 0.5);
    setResults((prev) => [...prev, { question: q, userAnswer: typedAnswer, isCorrect: score >= 0.5, score, feedback: 'Self-marked.', type: 'short_answer' }]);
  }

  async function recordAnswer(q, answer, isCorrect) {
    await supabase.from('session_answers').insert({
      session_id: sessionId,
      question_id: q.id,
      user_answer: answer,
      is_correct: isCorrect,
    });
    await supabase.rpc('update_skill_score', {
      p_subject: q.subject,
      p_skill: q.skill,
      p_chapter_id: q.chapter_id,
      p_chapter_name: q.chapter_name,
      p_is_correct: isCorrect,
    });
    // Spaced repetition: queue wrong answers to review in 3 days
    if (!isCorrect && user?.id) {
      const reviewDate = new Date();
      reviewDate.setDate(reviewDate.getDate() + 3);
      await supabase.from('review_queue').upsert({
        user_id: user.id,
        question_id: q.id,
        subject: q.subject,
        scheduled_for: reviewDate.toISOString(),
      }, { onConflict: 'user_id,question_id' });
    }
  }

  async function getExplanation() {
    const q = questions[currentIndex];
    setLoadingExplanation(true);
    setExplanation(null);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.question,
          options: q.type === 'mcq' ? q.options : null,
          correctAnswer: q.answer,
          userAnswer: q.type === 'mcq' ? selectedAnswer : typedAnswer,
          skill: q.skill,
          questionType: q.type,
          evaluationResult: evaluation?.result || null,
          evaluationFeedback: evaluation?.feedback || null,
        }),
      });
      const data = await res.json();
      setExplanation(data.explanation || data.error);
    } catch {
      setExplanation('Could not load explanation. Is the backend running?');
    }
    setLoadingExplanation(false);
  }

  async function nextQuestion() {
    saveCurrentState(currentIndex);
    const next = currentIndex + 1;
    if (next >= questions.length) {
      const correct = results.filter((r) => r.isCorrect).length;
      await supabase.from('sessions').update({
        ended_at: new Date().toISOString(),
        chapter_name: chapterName,
        total_questions: questions.length,
        correct_answers: correct,
      }).eq('id', sessionId);
      refreshProgress(); // session saved: update XP / streak
      setPhase('results');
    } else {
      setCurrentIndex(next);
      restoreState(next);
    }
  }

  function previousQuestion() {
    if (currentIndex === 0) return;
    saveCurrentState(currentIndex);
    const prev = currentIndex - 1;
    setCurrentIndex(prev);
    restoreState(prev);
  }

  // ── Setup screen ───────────────────────────────────────────
  if (phase === 'setup') {
    const allSelected = selectedChapters.size === allChapters.length;
    const noneSelected = selectedChapters.size === 0;

    // Chapter progress / continue mode
    const isSingleChapter = selectedChapters.size === 1;
    const chapterComplete = isSingleChapter && singleChapterProgress?.completion_pct >= 100;
    const remaining = isSingleChapter && singleChapterProgress
      ? Math.max(0, singleChapterProgress.total_questions - singleChapterProgress.answered_questions)
      : null;
    const isContinueMode = isSingleChapter && singleChapterProgress && !chapterComplete;

    const optCls = (on) => `chip flex-1 justify-center ${on ? 'chip-on' : ''}`;

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div>
          <p className="eyebrow">{subject.emoji} {subject.label}</p>
          <h1 className="page-title mt-1">Start a quiz</h1>
        </div>

        <div className="card p-6 space-y-6">
          {/* Question type */}
          <div>
            <p className="eyebrow mb-2.5">Question type</p>
            <div className="flex gap-2">
              {QUESTION_TYPES.filter(t => t.subjects === null || t.subjects.includes(subject.id)).map((t) => (
                <button
                  key={String(t.value)}
                  onClick={() => { setError(null); setQuestionType(t.value); }}
                  className={optCls(questionType === t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Number of questions — replaced with chapter progress in continue mode */}
          {isContinueMode ? (
            <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3.5 space-y-2">
              <p className="text-sm font-semibold text-ink">
                📖 Continue chapter — {remaining} question{remaining !== 1 ? 's' : ''} remaining
              </p>
              <div className="progress-track bg-surface/70">
                <div
                  className="progress-fill bg-warn"
                  style={{ width: `${singleChapterProgress.completion_pct}%` }}
                />
              </div>
              <p className="text-xs text-ink-2">
                {singleChapterProgress.answered_questions}/{singleChapterProgress.total_questions} done · You'll get 10 at a time from unseen questions
              </p>
            </div>
          ) : chapterComplete ? (
            <div className="rounded-xl border border-good/30 bg-good-soft px-4 py-3.5 space-y-2.5">
              <p className="text-sm font-semibold text-good">
                ✓ Chapter complete — practise again?
              </p>
              <div className="flex gap-2">
                {QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuizSize(n)}
                    className={`chip flex-1 justify-center ${quizSize === n ? 'border-good bg-surface text-good hover:border-good hover:text-good' : ''}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="eyebrow mb-2.5">Number of questions</p>
              <div className="flex gap-2">
                {QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuizSize(n)}
                    className={`${optCls(quizSize === n)} tabular-nums`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Source filter */}
          <div>
            <p className="eyebrow mb-2.5">Source</p>
            <div className="flex gap-2 flex-wrap">
              {QUESTION_SOURCES
                .filter(s => s.subjects === null || s.subjects.includes(subject.id))
                .map((s) => (
                <button
                  key={String(s.value)}
                  onClick={() => setSourceFilter(s.value)}
                  className={optCls(sourceFilter === s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter selection */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="eyebrow">Chapters</p>
              <button
                onClick={toggleAllChapters}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {allChapters.map((ch) => {
                const checked = selectedChapters.has(ch.id);
                return (
                  <button
                    key={ch.id}
                    onClick={() => toggleChapter(ch.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-sm transition duration-150 ${
                      checked
                        ? 'border-brand bg-brand-soft text-brand-ink'
                        : 'border-line bg-surface text-ink-2 hover:border-ink-3/50 hover:bg-surface-2'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors duration-150 ${
                      checked ? 'bg-brand border-brand' : 'border-line'
                    }`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-surface" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{ch.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-3 mt-2">
              {noneSelected ? 'No chapters selected — will draw from all chapters' : `${selectedChapters.size} chapter${selectedChapters.size > 1 ? 's' : ''} selected`}
            </p>
          </div>

          {error && <p className="text-sm text-bad bg-bad-soft rounded-xl px-3.5 py-2.5 animate-fade-in">{error}</p>}

          <button
            onClick={startQuiz}
            className="btn-primary w-full"
          >
            {isContinueMode
              ? `Continue — 10 Questions`
              : `Start — ${quizSize} Questions`}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in" aria-busy="true">
        <div className="flex items-center justify-between">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-6 w-24" />
        </div>
        <div className="skeleton h-2 w-full" />
        <div className="card p-8 space-y-4">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-6 w-full" />
          <div className="skeleton h-6 w-4/5" />
          <div className="space-y-2.5 pt-2">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
          </div>
        </div>
        <p className="text-center text-sm text-ink-3">Loading questions...</p>
      </div>
    );
  }

  if (phase === 'results') {
    return (
      <Results
        results={results}
        chapterName={chapterName}
        subject={subject}
        onRestart={() => setPhase('setup')}
        onHome={() => navigate(`/${subject.id}`)}
        userId={user?.id}
        selectedChapterId={selectedChapters.size === 1 ? [...selectedChapters][0] : null}
        preQuizProgress={singleChapterProgress}
        allChapters={allChapters}
      />
    );
  }

  const q = questions[currentIndex];
  const isMCQ = q.type === 'mcq';
  const isAIGenerated = q.year_tag === 'AI Generated';
  const correctLetter = correctMCQLetter(q.answer);

  // ── Display-only values derived from existing state ──
  const st = subjectStyle(subject.id);
  const correctCount = results.filter((r) => r.isCorrect).length;
  const answeredCount = results.length;
  const answeredPct = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const resultFor = (question) => {
    for (let i = results.length - 1; i >= 0; i--) if (results[i].question.id === question.id) return results[i];
    return null;
  };
  const dotStatuses = questions.map((question, i) => {
    const r = resultFor(question);
    if (r) return r.isCorrect ? 'correct' : 'incorrect';
    const answered = i === currentIndex ? isAnswered : questionStates[i]?.isAnswered;
    return answered ? 'answered' : 'pending';
  });
  // Consecutive correct answers ending with this question (only when this was the latest answer)
  let streak = 0;
  if (results.length && results[results.length - 1].question.id === q.id) {
    for (let i = results.length - 1; i >= 0 && results[i].isCorrect; i--) streak++;
  }
  const streakNote = streak >= 3 ? ` Nice — that's ${streak} in a row.` : '';

  const TONE = {
    good: { panel: 'bg-good-soft border-good/30', text: 'text-good', bar: 'bg-good' },
    warn: { panel: 'bg-warn-soft border-warn/30', text: 'text-warn', bar: 'bg-warn' },
    bad:  { panel: 'bg-bad-soft border-bad/30',   text: 'text-bad',  bar: 'bg-bad' },
  };
  const evalTone = evaluation?.result === 'correct' ? TONE.good : evaluation?.result === 'partial' ? TONE.warn : TONE.bad;
  const evalFailed = !isMCQ && evaluation && !evaluation.result; // evaluate endpoint returned an error body

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <span className={`pill py-1 max-w-[60%] ${st.tile}`}>
          <span aria-hidden="true">{subject.emoji}</span>
          <span className="truncate">{subject.label} · {chapterName}</span>
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="pill bg-surface-2 text-ink-2">
            {TYPE_LABELS[q.type] || 'Short Answer'}
          </span>
          <span className="text-sm font-semibold text-accent tabular-nums">
            {correctCount} correct
          </span>
        </div>
      </div>

      {/* Progress: answered / total */}
      <div className="flex items-center gap-3">
        <div className="progress-track flex-1">
          <div className="progress-fill bg-brand" style={{ width: `${answeredPct}%` }} />
        </div>
        <span className="text-xs font-medium text-ink-3 tabular-nums shrink-0">
          {answeredCount}/{questions.length} answered
        </span>
      </div>

      {/* Question map */}
      <QuestionDots statuses={dotStatuses} current={currentIndex} />

      {/* Question card */}
      <div key={currentIndex} className="card p-8 space-y-6 animate-slide-up">
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="eyebrow mr-1">Question {currentIndex + 1} of {questions.length}</span>
            <span className="pill bg-surface-2 text-ink-2">
              {questionMarks(q)} mark{questionMarks(q) !== 1 ? 's' : ''}
            </span>
            {q.year_tag && !isAIGenerated && (
              <span className="pill bg-accent-soft text-ink-2">
                {q.year_tag}
              </span>
            )}
            {isAIGenerated && (
              <span className="pill bg-brand-soft text-brand-ink">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                AI Generated
              </span>
            )}
          </div>
          <p className="font-display text-xl font-semibold leading-relaxed tracking-tight text-ink">{q.question}</p>
          {q.skill && (
            <span className="pill bg-brand-soft text-brand-ink py-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {q.skill}
            </span>
          )}
        </div>

        {/* MCQ options */}
        {isMCQ && (
          <div className="space-y-2.5">
            {['a', 'b', 'c', 'd'].map((key) => {
              let row = 'border-line bg-surface text-ink hover:border-brand/50 hover:bg-brand-soft/40 hover:shadow-soft cursor-pointer';
              let badge = 'bg-surface-2 text-ink-2 group-hover:bg-brand-soft group-hover:text-brand-ink';
              let mark = null;
              if (isAnswered) {
                if (key === correctLetter) {
                  row = 'border-good bg-good-soft text-ink font-medium cursor-default animate-pop';
                  badge = 'bg-good text-surface';
                  mark = <span className="ml-auto shrink-0 text-good font-bold" aria-label="Correct answer">✓</span>;
                } else if (key === selectedAnswer) {
                  row = 'border-bad bg-bad-soft text-ink cursor-default animate-shake';
                  badge = 'bg-bad text-surface';
                  mark = <span className="ml-auto shrink-0 text-bad font-bold" aria-label="Your answer">✗</span>;
                } else {
                  row = 'border-line bg-surface text-ink-3 cursor-default';
                  badge = 'bg-surface-2 text-ink-3';
                }
              }
              return (
                <button
                  key={key}
                  onClick={() => handleMCQAnswer(key)}
                  className={`group w-full text-left px-4 py-3.5 rounded-xl border-2 transition duration-150 text-[15px] leading-relaxed flex items-start gap-4 ${row}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase transition duration-150 ${badge}`}>{key}</span>
                  <span className="pt-0.5">{optionText(q.options, key)}</span>
                  {mark && <span className="ml-auto pl-2 pt-0.5">{mark}</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* Short answer input */}
        {!isMCQ && (
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                disabled={isAnswered}
                placeholder="Type your answer here, or use the mic to speak..."
                rows={4}
                className="input px-4 py-3 pr-14 text-[15px] leading-relaxed resize-none disabled:bg-surface-2 disabled:text-ink-2"
              />
              {voiceSupported && !isAnswered && (
                <button
                  onClick={isListening ? stopVoice : startVoice}
                  title={isListening ? 'Stop recording' : 'Speak your answer'}
                  className={`absolute right-3 top-3 w-9 h-9 rounded-full flex items-center justify-center transition duration-150 ${
                    isListening
                      ? 'bg-bad text-surface animate-pulse'
                      : 'bg-surface-2 text-ink-3 hover:bg-brand-soft hover:text-brand-ink'
                  }`}
                >
                  {isListening ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 3a4 4 0 014 4v4a4 4 0 01-8 0V7a4 4 0 014-4z"/>
                    </svg>
                  )}
                </button>
              )}
            </div>
            {isListening && (
              <p className="text-xs text-bad flex items-center gap-1.5">
                <span className="w-2 h-2 bg-bad rounded-full animate-pulse inline-block"/>
                Listening... speak your answer, then click stop
              </p>
            )}
            {!isAnswered && (
              <div className="space-y-2">
                <button
                  onClick={handleShortAnswerSubmit}
                  disabled={evaluating || !typedAnswer.trim()}
                  className="btn-primary w-full"
                >
                  {evaluating ? 'Evaluating...' : 'Submit Answer'}
                </button>
                {!hint && !loadingHint && (
                  <button
                    onClick={getHint}
                    className="btn-ghost w-full text-xs text-ink-3 hover:text-brand"
                  >
                    🤔 Need a hint?
                  </button>
                )}
                {loadingHint && <p className="text-xs text-ink-3 text-center py-2">Getting hint...</p>}
                {hint && (
                  <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink-2 leading-relaxed animate-fade-in">
                    💡 {hint}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Always-visible Prev / Next navigation */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={previousQuestion}
            disabled={currentIndex === 0}
            className="btn-secondary flex-none px-4 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <button
            onClick={nextQuestion}
            className="btn-primary flex-1"
          >
            {currentIndex + 1 >= questions.length ? 'See Results' : 'Next →'}
          </button>
        </div>

        {/* Post-answer feedback */}
        {isAnswered && (
          <div className="space-y-3 pt-5 border-t border-line animate-fade-in">

            {/* MCQ result */}
            {isMCQ && (
              <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                selectedAnswer === correctLetter ? 'border-good/30 bg-good-soft text-good animate-pop' : 'border-bad/30 bg-bad-soft text-bad'
              }`}>
                {selectedAnswer === correctLetter
                  ? `Correct.${streakNote}`
                  : `Not quite — the answer is ${correctLetter?.toUpperCase()}) ${optionText(q.options, correctLetter)}`}
              </div>
            )}

            {/* MCQ built-in explanation (from PDF/question bank) */}
            {isMCQ && isAnswered && q.explanation && (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-ink-2 leading-relaxed">
                {q.explanation}
              </div>
            )}

            {/* Evaluate endpoint returned an error: calm note + model answer */}
            {evalFailed && (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm space-y-3">
                <p className="text-ink-2">Automatic marking isn't available right now. Compare your answer with the model answer below.</p>
                <div>
                  <p className="eyebrow mb-1">Model answer</p>
                  <p className="text-ink-2 leading-relaxed">{q.answer}</p>
                </div>
              </div>
            )}

            {/* Short answer evaluation */}
            {!isMCQ && evaluation && evaluation.result !== 'unavailable' && !evalFailed && (
              <div className={`rounded-xl border p-4 text-sm space-y-3 ${evaluation.result === 'correct' ? 'animate-pop' : ''} ${evalTone.panel}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`font-semibold ${evalTone.text}`}>
                    {evaluation.result === 'correct' ? `Correct.${streakNote}` :
                     evaluation.result === 'partial' ? 'Partially correct' :
                     evaluation.result === 'incorrect' ? 'Not quite' : 'Self-marked'}
                  </p>
                  {typeof evaluation.percentCovered === 'number' && (
                    <span className={`text-xs font-semibold tabular-nums shrink-0 ${evalTone.text}`}>
                      {evaluation.percentCovered}% covered
                    </span>
                  )}
                </div>

                {typeof evaluation.percentCovered === 'number' && (
                  <div className="h-1.5 bg-surface/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${evalTone.bar}`}
                      style={{ width: `${evaluation.percentCovered}%` }}
                    />
                  </div>
                )}

                {evaluation.feedback && <p className="text-ink-2 leading-relaxed">{evaluation.feedback}</p>}

                {Array.isArray(evaluation.missingPoints) && evaluation.missingPoints.length > 0 && (
                  <div>
                    <p className="eyebrow mb-1.5">Still missing</p>
                    <ul className="space-y-1">
                      {evaluation.missingPoints.map((point, i) => (
                        <li key={i} className="text-xs text-ink-2 flex items-start gap-1.5">
                          <span className="text-ink-3 shrink-0">＋</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-1">
                  <p className="eyebrow mb-1">Model answer</p>
                  <p className="text-ink-2 text-xs leading-relaxed">{q.answer}</p>
                </div>
              </div>
            )}

            {/* Self-mark fallback when AI evaluation unavailable */}
            {!isMCQ && evaluation?.result === 'unavailable' && (
              <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm space-y-4">
                <div>
                  <p className="eyebrow mb-1">Model answer</p>
                  <p className="text-ink-2 text-sm leading-relaxed">{q.answer}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-3 mb-2">Automatic marking isn't available — how did you do?</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleSelfMark(q, 'correct')} className="flex-1 py-2 rounded-xl bg-good-soft text-good font-semibold text-xs border border-good/20 hover:border-good/50 transition duration-150">Got it</button>
                    <button onClick={() => handleSelfMark(q, 'partial')} className="flex-1 py-2 rounded-xl bg-warn-soft text-warn font-semibold text-xs border border-warn/20 hover:border-warn/50 transition duration-150">Partially</button>
                    <button onClick={() => handleSelfMark(q, 'incorrect')} className="flex-1 py-2 rounded-xl bg-bad-soft text-bad font-semibold text-xs border border-bad/20 hover:border-bad/50 transition duration-150">Missed it</button>
                  </div>
                </div>
              </div>
            )}

            {/* ICSE Board Tips */}
            {q.board_tips && (
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4 space-y-1.5">
                <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  📋 ICSE Board Tips
                </p>
                <div className="text-xs text-ink-2 leading-relaxed whitespace-pre-line">
                  {q.board_tips}
                </div>
              </div>
            )}

            {/* Explain button (AI deep explanation) */}
            {!explanation && (
              <button
                onClick={getExplanation}
                disabled={loadingExplanation}
                className="btn-ghost -ml-3 text-brand hover:text-brand disabled:text-ink-3"
              >
                {loadingExplanation ? 'Getting explanation...' : 'Explain this in detail'}
              </button>
            )}

            {explanation && (
              <div className="rounded-xl border border-line bg-surface-2 p-5 text-sm text-ink-2 leading-relaxed whitespace-pre-line animate-fade-in">
                {explanation}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

function Results({ results, chapterName, subject, onRestart, onHome, userId, selectedChapterId, preQuizProgress, allChapters }) {
  const navigate = useNavigate();
  const correct = results.filter((r) => r.isCorrect).length;
  const total = results.length;
  const pct = Math.round((correct / total) * 100);
  const grade =
    pct >= 80 ? { label: 'Excellent work', color: 'text-good' }
    : pct >= 60 ? { label: 'Good work', color: 'text-warn' }
    : { label: 'Keep practising', color: 'text-bad' };

  const [debrief, setDebrief] = useState(null);
  const [loadingDebrief, setLoadingDebrief] = useState(true);
  const [postQuizProgress, setPostQuizProgress] = useState(null);
  const [allPostProgress, setAllPostProgress] = useState([]);

  // Fetch updated progress after quiz to detect chapter completion
  useEffect(() => {
    if (!selectedChapterId || !userId || !subject?.id) return;
    fetch('/api/chapterProgress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subject: subject.id }),
    })
      .then(r => r.json())
      .then(({ progress }) => {
        setAllPostProgress(progress || []);
        const found = (progress || []).find(p => p.chapter_id === selectedChapterId);
        setPostQuizProgress(found || null);
      })
      .catch(() => {});
  }, []);

  const justCompleted =
    postQuizProgress?.completion_pct >= 100 &&
    (preQuizProgress?.completion_pct ?? 0) < 100;

  const nextChapter = justCompleted
    ? (allChapters || []).find(ch =>
        ch.id !== selectedChapterId &&
        ((allPostProgress.find(p => p.chapter_id === ch.id)?.completion_pct) ?? 0) < 100
      )
    : null;

  useEffect(() => {
    async function fetchDebrief() {
      try {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'debrief',
            data: { results, subject: subject?.label || subject?.id },
          }),
        });
        const data = await res.json();
        setDebrief(data.message);
      } catch {
        setDebrief(null);
      }
      setLoadingDebrief(false);
    }
    fetchDebrief();
  }, []);

  // Score ring (display only)
  const hasAnswers = total > 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const ringPct = hasAnswers ? pct : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">

      {/* Chapter completion celebration */}
      {justCompleted && (
        <div className="rounded-2xl border border-good/30 bg-good-soft p-6 text-center space-y-3 animate-burst">
          <p className="text-4xl" aria-hidden="true">🎉</p>
          <p className="font-display font-bold text-ink text-xl">Chapter complete</p>
          <p className="text-sm text-ink-2">
            You've answered all {postQuizProgress.total_questions} questions in <strong className="text-ink">{chapterName}</strong>
          </p>
          {nextChapter ? (
            <button
              onClick={() => navigate(`/${subject.id}/chapters?chapter=${nextChapter.id}`)}
              className="btn-primary mt-1"
            >
              Next up: {nextChapter.name} →
            </button>
          ) : (
            <p className="text-xs text-good font-semibold">You've completed all chapters.</p>
          )}
        </div>
      )}

      <div className="card p-8">
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center">
          <div className="relative h-36 w-36 shrink-0 animate-burst">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="60" cy="60" r={R} fill="none" strokeWidth="10" className="text-surface-2" stroke="currentColor" />
              <circle
                cx="60" cy="60" r={R} fill="none" strokeWidth="10" strokeLinecap="round"
                className={`${grade.color} transition-[stroke-dashoffset] duration-300`}
                stroke="currentColor"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - ringPct / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-display text-4xl font-bold tabular-nums ${hasAnswers ? grade.color : 'text-ink-3'}`}>{hasAnswers ? `${pct}%` : '—'}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">accuracy</span>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <p className="eyebrow">{subject?.label} · {chapterName}</p>
            <p className="font-display text-2xl font-bold tracking-tight text-ink mt-1">
              {hasAnswers ? grade.label : 'No answers this round'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 max-w-xs mx-auto sm:mx-0">
              <div className="rounded-xl bg-surface-2 px-4 py-3">
                <p className="font-display text-xl font-bold text-good tabular-nums">{correct}</p>
                <p className="text-xs text-ink-3">correct</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-4 py-3">
                <p className="font-display text-xl font-bold text-ink tabular-nums">{total}</p>
                <p className="text-xs text-ink-3">answered</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6 justify-center sm:justify-start">
              <button onClick={onRestart} className="btn-primary">
                Try Again
              </button>
              <button onClick={onHome} className="btn-secondary">
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Coach Debrief */}
      {(loadingDebrief || debrief) && (
        <div className="rounded-2xl bg-gradient-to-br from-barca-navy to-barca-navy-deep p-5 text-white shadow-soft animate-slide-up">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-barca-gold flex items-center justify-center shrink-0 text-barca-navy font-bold text-sm">
              AI
            </div>
            <div className="flex-1">
              <p className="text-xs text-white/60 font-semibold uppercase tracking-wider mb-1">Coach's take</p>
              {loadingDebrief
                ? <div className="space-y-2 animate-pulse"><div className="h-3 bg-barca-navy-light/20 rounded w-full"/><div className="h-3 bg-barca-navy-light/20 rounded w-4/5"/></div>
                : <p className="text-sm leading-relaxed text-white/90">{debrief}</p>
              }
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="card divide-y divide-line">
          {results.map((r, i) => {
            const tone = r.isCorrect ? 'bg-good-soft text-good' : r.score === 0.5 ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad';
            return (
              <div key={i} className="p-4 flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tone}`}>
                  {r.isCorrect ? '✓' : r.score === 0.5 ? '~' : '✗'}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`pill ${r.type === 'mcq' ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2'}`}>
                      {r.type === 'mcq' ? 'MCQ' : 'SA'}
                    </span>
                    {r.question.year_tag === 'AI Generated' && (
                      <span className="pill bg-accent-soft text-ink-2">AI</span>
                    )}
                  </div>
                  <p className="text-sm text-ink leading-snug">{r.question.question}</p>
                  {r.type === 'mcq' && !r.isCorrect && (
                    <p className="text-xs text-bad mt-1">
                      Your answer: {r.question.options[r.userAnswer]} — Correct: {r.question.options[r.question.answer]}
                    </p>
                  )}
                  {r.type === 'short_answer' && r.feedback && (
                    <p className="text-xs text-ink-2 mt-1">{r.feedback}</p>
                  )}
                  <p className="text-xs text-ink-3 mt-0.5">{r.question.skill}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
