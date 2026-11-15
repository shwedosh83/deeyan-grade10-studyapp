import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { subjectStyle } from '../lib/subjectStyle';
import CoachWidget from './CoachWidget';
import ConceptExplainer from './ConceptExplainer';

export default function Dashboard() {
  const navigate = useNavigate();
  const [showExplainer, setShowExplainer] = useState(false);
  const [chapters, setChapters] = useState([]);
  const [chapterProgress, setChapterProgress] = useState({}); // chapter_id → progress obj
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { subject } = useSubject();
  const { user, loading: authLoading } = useAuth();
  const { data: progress } = useProgress();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Deeyan';
  const st = subjectStyle(subject.id);

  // Subject stats come from /api/progress (the old skill_scores / get_weak_skills queries no longer exist).
  const subjProg = progress?.subjects?.find(s => s.subject === subject.id) || null;
  const stats = { total: subjProg?.answered || 0, correct: subjProg?.correct || 0, skills: subjProg?.skills?.length || 0 };
  // Weakest topics: at least 3 answers and under 70%, lowest first (same shape the coach + Focus Areas expect).
  const weakSkills = (subjProg?.skills || [])
    .filter(s => s.answered >= 3 && s.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map(s => ({ ...s, chapter_name: subject.label })); // the coach prompt reads chapter_name

  useEffect(() => {
    // Wait until auth has resolved — user is null while loading
    if (authLoading) return;

    async function load() {
      const [chaptersRes, reviewRes, progressRes] = await Promise.all([
        supabase.rpc('get_chapters_for_subject', { p_subject: subject.id }),
        supabase.from('review_queue').select('id', { count: 'exact' })
          .eq('subject', subject.id).is('completed_at', null)
          .lte('scheduled_for', new Date().toISOString()),
        fetch('/api/chapterProgress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user?.id, subject: subject.id }),
        }).then(r => r.json()).catch(() => ({ progress: [] })),
      ]);

      if (reviewRes.count) setReviewCount(reviewRes.count);

      // Build progress map
      const progMap = {};
      for (const p of progressRes.progress || []) {
        progMap[p.chapter_id] = p;
      }
      setChapterProgress(progMap);

      if (chaptersRes.data) {
        const seen = new Set();
        const unique = chaptersRes.data.filter((c) => {
          if (c.chapter_name === 'Prelim Papers') return false;
          if (seen.has(c.chapter_id)) return false;
          seen.add(c.chapter_id);
          return true;
        });

        // Sort: in-progress first (>0 and <100%), then not started, then complete
        unique.sort((a, b) => {
          const pa = progMap[a.chapter_id]?.completion_pct ?? 0;
          const pb = progMap[b.chapter_id]?.completion_pct ?? 0;
          const aInProgress = pa > 0 && pa < 100;
          const bInProgress = pb > 0 && pb < 100;
          if (aInProgress && !bInProgress) return -1;
          if (!aInProgress && bInProgress) return 1;
          // Within in-progress, higher pct first
          if (aInProgress && bInProgress) return pb - pa;
          // Not started stays in original order
          return 0;
        });

        setChapters(unique);
      }

      setLoading(false);
    }
    load();
  }, [subject, user?.id, authLoading]);

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;

  const accuracyColor =
    accuracy === null ? 'text-ink-3'
    : accuracy >= 70  ? 'text-good'
    : accuracy >= 40  ? 'text-warn'
    : 'text-bad';

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="skeleton h-7 w-40" />
        <div className="skeleton h-24 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
        <div className="card p-6"><div className="skeleton h-4 w-56" /><div className="mt-4 grid grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}</div></div>
      </div>
    );
  }

  const inProgressCount = chapters.filter(ch => {
    const p = chapterProgress[ch.chapter_id];
    return p && p.completion_pct > 0 && p.completion_pct < 100;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <p className="eyebrow">{subject.label} · Practice</p>
        <h1 className="page-title mt-1">Hey {firstName}</h1>
      </div>

      {/* Coach Widget */}
      <CoachWidget subject={subject} weakSkills={weakSkills} totalDone={stats.total} />

      {/* Ask AI Tutor — prominent card */}
      <button
        onClick={() => setShowExplainer(true)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-barca-navy-deep via-barca-navy to-barca-navy-dark p-5 text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99]"
      >
        <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${st.grad} opacity-25 blur-2xl`} />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl">
              🧠
            </div>
            <div>
              <p className="font-display text-base font-bold leading-tight text-white">Ask Your Coach</p>
              <p className="mt-0.5 text-xs text-white/65">Concepts · Memory tricks · Board exam tips</p>
            </div>
          </div>
          <div className="ml-2 shrink-0 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition duration-150 group-hover:bg-white/25">
            Ask now →
          </div>
        </div>
        <div className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5">
          <svg className="h-3.5 w-3.5 shrink-0 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-xs text-white/75">Ask about any {subject.label} concept…</p>
        </div>
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Questions done" value={stats.total || '—'} color="text-ink" />
        <StatCard
          label="Accuracy"
          value={accuracy !== null ? `${accuracy}%` : '—'}
          color={accuracyColor}
        />
        <StatCard label="Topics covered" value={stats.skills || '—'} color="text-ink" />
      </div>

      {/* Spaced repetition review banner */}
      {reviewCount > 0 && (
        <button
          onClick={() => navigate(`/${subject.id}/chapters?mode=review`)}
          className="flex w-full items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-left transition duration-150 hover:border-warn/50"
        >
          <span className="text-2xl">🔁</span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {reviewCount} question{reviewCount > 1 ? 's' : ''} ready for review
            </p>
            <p className="text-xs text-ink-2">These tripped you up last time — time to retry them</p>
          </div>
          <svg className="ml-auto h-4 w-4 shrink-0 text-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      )}

      {/* Start Quiz */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">Chapters — pick one to practise</h2>
          {inProgressCount > 0 && (
            <span className="pill bg-warn-soft text-warn">
              {inProgressCount} chapter{inProgressCount > 1 ? 's' : ''} in progress
            </span>
          )}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <button
            onClick={() => navigate(`/${subject.id}/chapters`)}
            className="btn-primary col-span-2 sm:col-span-3"
          >
            All Chapters
          </button>
          {chapters.map((ch) => {
            const prog = chapterProgress[ch.chapter_id];
            const pct = prog?.completion_pct ?? 0;
            const answered = prog?.answered_questions ?? 0;
            const total = prog?.total_questions ?? 0;
            const isComplete = pct >= 100;
            const isInProgress = pct > 0 && pct < 100;

            return (
              <button
                key={ch.chapter_id}
                onClick={() => navigate(`/${subject.id}/chapters?chapter=${ch.chapter_id}`)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition duration-150 hover:-translate-y-0.5 hover:shadow-soft ${
                  isComplete
                    ? 'border-good/30 bg-good-soft text-ink hover:border-good/50'
                    : isInProgress
                    ? 'border-warn/30 bg-warn-soft text-ink hover:border-warn/50'
                    : 'border-line bg-surface-2 text-ink-2 hover:border-brand/40 hover:text-ink'
                }`}
              >
                <span className="block truncate">
                  {isComplete ? <span className="text-good">✓ </span> : ''}{ch.chapter_name}
                </span>
                {total > 0 && (
                  <div className="mt-1.5">
                    <div className="h-1 overflow-hidden rounded-full bg-line/70">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          isComplete ? 'bg-good' : isInProgress ? 'bg-warn' : 'bg-ink-3/40'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {answered}/{total}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Weak Skills */}
      {weakSkills.length > 0 && (
        <div className="card p-6">
          <h2 className="section-title mb-1">Focus areas</h2>
          <p className="mb-4 text-sm text-ink-3">Topics where you need the most practice</p>
          <div className="space-y-3">
            {weakSkills.map((s) => (
              <div key={s.skill}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-ink-2">{s.skill}</span>
                  <span className="font-semibold text-bad">{s.accuracy}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill bg-bad"
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-ink-3">{s.answered} answered</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <p className="text-center text-sm text-ink-3">
          No attempts yet — pick a chapter above to start.
        </p>
      )}

      {/* Floating icon button */}
      <button
        onClick={() => setShowExplainer(true)}
        className="fixed bottom-6 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-barca-navy text-2xl text-white shadow-lift transition duration-200 hover:scale-110 hover:bg-barca-navy-dark active:scale-95"
        title="Ask Your Coach"
      >
        🧠
      </button>

      {/* Concept Explainer panel */}
      {showExplainer && (
        <ConceptExplainer onClose={() => setShowExplainer(false)} />
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card p-5 text-center">
      <p className={`font-display text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-3">{label}</p>
    </div>
  );
}
