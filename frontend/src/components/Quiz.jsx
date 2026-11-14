import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';

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

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Start Quiz</h1>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Question type */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Question Type</p>
            <div className="flex gap-2">
              {QUESTION_TYPES.filter(t => t.subjects === null || t.subjects.includes(subject.id)).map((t) => (
                <button
                  key={String(t.value)}
                  onClick={() => { setError(null); setQuestionType(t.value); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    questionType === t.value
                      ? 'border-barca-navy bg-barca-navy-light text-barca-navy'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Number of questions — replaced with chapter progress in continue mode */}
          {isContinueMode ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 space-y-1">
              <p className="text-sm font-semibold text-amber-800">
                📖 Continue Chapter — {remaining} question{remaining !== 1 ? 's' : ''} remaining
              </p>
              <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${singleChapterProgress.completion_pct}%` }}
                />
              </div>
              <p className="text-xs text-amber-600">
                {singleChapterProgress.answered_questions}/{singleChapterProgress.total_questions} done · You'll get 10 at a time from unseen questions
              </p>
            </div>
          ) : chapterComplete ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3.5 space-y-2">
              <p className="text-sm font-semibold text-emerald-700">
                ✓ Chapter complete! Practice again?
              </p>
              <div className="flex gap-2">
                {QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuizSize(n)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                      quizSize === n
                        ? 'border-emerald-600 bg-emerald-100 text-emerald-800'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Number of Questions</p>
              <div className="flex gap-2">
                {QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuizSize(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                      quizSize === n
                        ? 'border-barca-navy bg-barca-navy-light text-barca-navy'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Source filter */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Source</p>
            <div className="flex gap-2 flex-wrap">
              {QUESTION_SOURCES
                .filter(s => s.subjects === null || s.subjects.includes(subject.id))
                .map((s) => (
                <button
                  key={String(s.value)}
                  onClick={() => setSourceFilter(s.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    sourceFilter === s.value
                      ? 'border-barca-navy bg-barca-navy-light text-barca-navy'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Chapters</p>
              <button
                onClick={toggleAllChapters}
                className="text-xs text-barca-navy hover:underline font-medium"
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
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                      checked
                        ? 'border-barca-navy bg-barca-navy-light text-barca-navy'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'bg-barca-navy border-barca-navy' : 'border-gray-300'
                    }`}>
                      {checked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{ch.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {noneSelected ? 'No chapters selected — will draw from all chapters' : `${selectedChapters.size} chapter${selectedChapters.size > 1 ? 's' : ''} selected`}
            </p>
          </div>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <button
            onClick={startQuiz}
            className="w-full bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold py-3 rounded-lg transition-colors"
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
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Loading questions...</p>
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
  const progress = (currentIndex / questions.length) * 100;
  const isMCQ = q.type === 'mcq';
  const isAIGenerated = q.year_tag === 'AI Generated';
  const correctLetter = correctMCQLetter(q.answer);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{chapterName}</p>
          <p className="font-semibold text-gray-700">Question {currentIndex + 1} of {questions.length}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${isMCQ ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
            {TYPE_LABELS[q.type] || 'Short Answer'}
          </span>
          <span className="text-sm text-barca-gold font-semibold tabular-nums">
            {results.filter((r) => r.isCorrect).length} correct
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-barca-navy rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Question card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
              {questionMarks(q)} mark{questionMarks(q) !== 1 ? 's' : ''}
            </span>
            {q.year_tag && !isAIGenerated && (
              <span className="text-xs bg-barca-gold-light text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {q.year_tag}
              </span>
            )}
            {isAIGenerated && (
              <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                AI Generated
              </span>
            )}
          </div>
          <p className="text-gray-800 font-medium leading-relaxed">{q.question}</p>
          {q.skill && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium px-2.5 py-1 rounded-full bg-barca-navy-light text-barca-navy border border-barca-navy/10">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {q.skill}
            </span>
          )}
        </div>

        {/* MCQ options */}
        {isMCQ && (
          <div className="space-y-2">
            {['a', 'b', 'c', 'd'].map((key) => {
              let style = 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 text-gray-700 cursor-pointer';
              if (isAnswered) {
                if (key === correctLetter) style = 'border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold cursor-default';
                else if (key === selectedAnswer) style = 'border-red-400 bg-red-50 text-red-700 cursor-default';
                else style = 'border-gray-200 bg-white text-gray-400 cursor-default';
              }
              return (
                <button
                  key={key}
                  onClick={() => handleMCQAnswer(key)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all text-sm flex items-start gap-3 ${style}`}
                >
                  <span className="font-bold uppercase shrink-0">{key})</span>
                  <span>{optionText(q.options, key)}</span>
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
                className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 pr-12 text-sm text-gray-700 focus:outline-none focus:border-barca-navy resize-none disabled:bg-gray-50 disabled:text-gray-500"
              />
              {voiceSupported && !isAnswered && (
                <button
                  onClick={isListening ? stopVoice : startVoice}
                  title={isListening ? 'Stop recording' : 'Speak your answer'}
                  className={`absolute right-3 top-3 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-gray-100 hover:bg-barca-navy-light text-gray-500 hover:text-barca-navy'
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
              <p className="text-xs text-red-500 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block"/>
                Listening... speak your answer, then click stop
              </p>
            )}
            {!isAnswered && (
              <div className="space-y-2">
                <button
                  onClick={handleShortAnswerSubmit}
                  disabled={evaluating || !typedAnswer.trim()}
                  className="w-full bg-barca-navy hover:bg-barca-navy-dark disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {evaluating ? 'Evaluating...' : 'Submit Answer'}
                </button>
                {!hint && !loadingHint && (
                  <button
                    onClick={getHint}
                    className="w-full text-xs text-gray-400 hover:text-barca-navy py-1 transition-colors"
                  >
                    🤔 Need a hint?
                  </button>
                )}
                {loadingHint && <p className="text-xs text-gray-400 text-center">Getting hint...</p>}
                {hint && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 leading-relaxed">
                    💡 {hint}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Always-visible Prev / Next navigation */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={previousQuestion}
            disabled={currentIndex === 0}
            className="flex-none px-4 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-700 font-semibold py-2.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm"
          >
            ← Prev
          </button>
          <button
            onClick={nextQuestion}
            className="flex-1 bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {currentIndex + 1 >= questions.length ? 'See Results' : 'Next →'}
          </button>
        </div>

        {/* Post-answer feedback */}
        {isAnswered && (
          <div className="space-y-3 pt-1 border-t border-gray-100">

            {/* MCQ result */}
            {isMCQ && (
              <p className={`text-sm font-semibold ${selectedAnswer === correctLetter ? 'text-emerald-600' : 'text-red-500'}`}>
                {selectedAnswer === correctLetter
                  ? 'Correct!'
                  : `Wrong — correct answer: ${correctLetter?.toUpperCase()}) ${optionText(q.options, correctLetter)}`}
              </p>
            )}

            {/* MCQ built-in explanation (from PDF/question bank) */}
            {isMCQ && isAnswered && q.explanation && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
                {q.explanation}
              </div>
            )}

            {/* Short answer evaluation */}
            {!isMCQ && evaluation && evaluation.result !== 'unavailable' && (
              <div className={`rounded-lg p-4 text-sm space-y-3 ${
                evaluation.result === 'correct' ? 'bg-emerald-50 border border-emerald-200' :
                evaluation.result === 'partial' ? 'bg-amber-50 border border-amber-200' :
                'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`font-semibold ${
                    evaluation.result === 'correct' ? 'text-emerald-700' :
                    evaluation.result === 'partial' ? 'text-amber-700' :
                    'text-red-700'
                  }`}>
                    {evaluation.result === 'correct' ? 'Correct!' :
                     evaluation.result === 'partial' ? 'Partially Correct' :
                     evaluation.result === 'incorrect' ? 'Incorrect' : 'Self-marked'}
                  </p>
                  {typeof evaluation.percentCovered === 'number' && (
                    <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                      evaluation.result === 'correct' ? 'text-emerald-700' :
                      evaluation.result === 'partial' ? 'text-amber-700' :
                      'text-red-700'
                    }`}>
                      {evaluation.percentCovered}% covered
                    </span>
                  )}
                </div>

                {typeof evaluation.percentCovered === 'number' && (
                  <div className="h-1.5 bg-white/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        evaluation.result === 'correct' ? 'bg-emerald-500' :
                        evaluation.result === 'partial' ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${evaluation.percentCovered}%` }}
                    />
                  </div>
                )}

                <p className="text-gray-700">{evaluation.feedback}</p>

                {Array.isArray(evaluation.missingPoints) && evaluation.missingPoints.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-1">Still missing:</p>
                    <ul className="space-y-1">
                      {evaluation.missingPoints.map((point, i) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                          <span className="text-gray-400 shrink-0">＋</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-1">
                  <p className="text-xs text-gray-500 font-medium mb-1">Model Answer:</p>
                  <p className="text-gray-600 text-xs">{q.answer}</p>
                </div>
              </div>
            )}

            {/* Self-mark fallback when AI evaluation unavailable */}
            {!isMCQ && evaluation?.result === 'unavailable' && (
              <div className="rounded-lg p-4 text-sm space-y-3 bg-gray-50 border border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1">Model Answer:</p>
                  <p className="text-gray-700 text-xs">{q.answer}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">AI evaluation unavailable — how did you do?</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleSelfMark(q, 'correct')} className="flex-1 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 font-semibold text-xs hover:bg-emerald-200 transition-colors">Got it</button>
                    <button onClick={() => handleSelfMark(q, 'partial')} className="flex-1 py-1.5 rounded-lg bg-amber-100 text-amber-700 font-semibold text-xs hover:bg-amber-200 transition-colors">Partially</button>
                    <button onClick={() => handleSelfMark(q, 'incorrect')} className="flex-1 py-1.5 rounded-lg bg-red-100 text-red-700 font-semibold text-xs hover:bg-red-200 transition-colors">Missed it</button>
                  </div>
                </div>
              </div>
            )}

            {/* ICSE Board Tips */}
            {q.board_tips && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  📋 ICSE Board Tips
                </p>
                <div className="text-xs text-amber-900 leading-relaxed whitespace-pre-line">
                  {q.board_tips}
                </div>
              </div>
            )}

            {/* Explain button (AI deep explanation) */}
            {!explanation && (
              <button
                onClick={getExplanation}
                disabled={loadingExplanation}
                className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
              >
                {loadingExplanation ? 'Getting explanation...' : 'Explain this in detail'}
              </button>
            )}

            {explanation && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-900 leading-relaxed">
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
    pct >= 80 ? { label: 'Excellent!', color: 'text-barca-navy' }
    : pct >= 60 ? { label: 'Good job!', color: 'text-amber-500' }
    : { label: 'Keep practicing!', color: 'text-red-500' };

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

  return (
    <div className="space-y-6">

      {/* Chapter completion celebration */}
      {justCompleted && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-6 text-center space-y-3">
          <p className="text-4xl">🎉</p>
          <p className="font-bold text-emerald-800 text-xl">Chapter Complete!</p>
          <p className="text-sm text-emerald-700">
            You've answered all {postQuizProgress.total_questions} questions in <strong>{chapterName}</strong>
          </p>
          {nextChapter ? (
            <button
              onClick={() => navigate(`/${subject.id}/chapters?chapter=${nextChapter.id}`)}
              className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              Next up: {nextChapter.name} →
            </button>
          ) : (
            <p className="text-xs text-emerald-600 font-medium">You've completed all chapters! 🏆</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className={`text-5xl font-bold ${grade.color}`}>{pct}%</p>
        <p className="text-lg font-semibold text-gray-700 mt-1">{grade.label}</p>
        <p className="text-gray-500 text-sm mt-1">{correct} / {total} correct — {chapterName}</p>
        <div className="flex gap-3 mt-6 justify-center">
          <button onClick={onRestart} className="bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold px-6 py-2 rounded-lg transition-colors">
            Try Again
          </button>
          <button onClick={onHome} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-2 rounded-lg transition-colors">
            Dashboard
          </button>
        </div>
      </div>

      {/* Coach Debrief */}
      {(loadingDebrief || debrief) && (
        <div className="bg-barca-navy rounded-xl p-5 text-white">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-barca-gold flex items-center justify-center shrink-0 text-barca-navy font-bold text-sm">
              AI
            </div>
            <div>
              <p className="text-xs text-white/60 font-medium mb-1">Coach's Take</p>
              {loadingDebrief
                ? <div className="space-y-2 animate-pulse"><div className="h-3 bg-white/20 rounded w-full"/><div className="h-3 bg-white/20 rounded w-4/5"/></div>
                : <p className="text-sm leading-relaxed text-white/90">{debrief}</p>
              }
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {results.map((r, i) => (
          <div key={i} className="p-4 flex items-start gap-3">
            <span className={`mt-0.5 text-lg shrink-0 ${r.isCorrect ? 'text-emerald-500' : r.score === 0.5 ? 'text-amber-400' : 'text-red-400'}`}>
              {r.isCorrect ? '✓' : r.score === 0.5 ? '~' : '✗'}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.type === 'mcq' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                  {r.type === 'mcq' ? 'MCQ' : 'SA'}
                </span>
                {r.question.year_tag === 'AI Generated' && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-violet-50 text-violet-600">AI</span>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-snug">{r.question.question}</p>
              {r.type === 'mcq' && !r.isCorrect && (
                <p className="text-xs text-red-500 mt-1">
                  Your answer: {r.question.options[r.userAnswer]} — Correct: {r.question.options[r.question.answer]}
                </p>
              )}
              {r.type === 'short_answer' && r.feedback && (
                <p className="text-xs text-gray-500 mt-1">{r.feedback}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">{r.question.skill}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
