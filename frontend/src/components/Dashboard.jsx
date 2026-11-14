import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import CoachWidget from './CoachWidget';
import ConceptExplainer from './ConceptExplainer';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, correct: 0, skills: 0 });
  const [showExplainer, setShowExplainer] = useState(false);
  const [weakSkills, setWeakSkills] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [chapterProgress, setChapterProgress] = useState({}); // chapter_id → progress obj
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { subject } = useSubject();
  const { user, loading: authLoading } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Deeyan';

  useEffect(() => {
    // Wait until auth has resolved — user is null while loading
    if (authLoading) return;

    async function load() {
      const [scoresRes, weakRes, chaptersRes, reviewRes, progressRes] = await Promise.all([
        supabase.from('skill_scores').select('total_attempts, correct_attempts').eq('subject', subject.id),
        supabase.rpc('get_weak_skills', { p_subject: subject.id, p_limit: 3 }),
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

      if (scoresRes.data) {
        const total = scoresRes.data.reduce((s, r) => s + r.total_attempts, 0);
        const correct = scoresRes.data.reduce((s, r) => s + r.correct_attempts, 0);
        setStats({ total, correct, skills: scoresRes.data.length });
      }

      if (weakRes.data) setWeakSkills(weakRes.data);
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
    accuracy === null ? 'text-gray-400'
    : accuracy >= 70  ? 'text-barca-navy'
    : accuracy >= 40  ? 'text-amber-500'
    : 'text-barca-red';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const inProgressCount = chapters.filter(ch => {
    const p = chapterProgress[ch.chapter_id];
    return p && p.completion_pct > 0 && p.completion_pct < 100;
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hey {firstName}!</h1>
      </div>

      {/* Coach Widget */}
      <CoachWidget subject={subject} weakSkills={weakSkills} totalDone={stats.total} />

      {/* Ask AI Tutor — prominent card */}
      <button
        onClick={() => setShowExplainer(true)}
        className="w-full text-left bg-gradient-to-r from-barca-navy to-blue-700 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl shrink-0">
              🧠
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Ask Your Coach</p>
              <p className="text-blue-200 text-xs mt-0.5">Concepts · Memory tricks · Board exam tips</p>
            </div>
          </div>
          <div className="bg-white/20 hover:bg-white/30 rounded-xl px-3 py-1.5 text-white text-xs font-semibold shrink-0 ml-2">
            Ask now →
          </div>
        </div>
        <div className="mt-3 bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-blue-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-blue-100 text-xs">Ask about any {subject.label} concept…</p>
        </div>
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Questions Done" value={stats.total || '—'} color="text-barca-navy" />
        <StatCard
          label="Accuracy"
          value={accuracy !== null ? `${accuracy}%` : '—'}
          color={accuracyColor}
        />
        <StatCard label="Topics Covered" value={stats.skills || '—'} color="text-barca-navy" />
      </div>

      {/* Spaced repetition review banner */}
      {reviewCount > 0 && (
        <button
          onClick={() => navigate(`/${subject.id}/chapters?mode=review`)}
          className="w-full flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors text-left"
        >
          <span className="text-2xl">🔁</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {reviewCount} question{reviewCount > 1 ? 's' : ''} ready for review
            </p>
            <p className="text-xs text-amber-600">These tripped you up last time — time to retry them</p>
          </div>
          <svg className="w-4 h-4 text-amber-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      )}

      {/* Start Quiz */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Chapters — pick one to practise</h2>
          {inProgressCount > 0 && (
            <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-full">
              {inProgressCount} chapter{inProgressCount > 1 ? 's' : ''} in progress
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
          <button
            onClick={() => navigate(`/${subject.id}/chapters`)}
            className="col-span-2 sm:col-span-3 bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold py-3 rounded-lg transition-colors"
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
                className={`text-sm font-medium py-2 px-3 rounded-lg transition-colors text-left ${
                  isComplete
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : isInProgress
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-barca-navy-light hover:bg-blue-100 text-barca-navy'
                }`}
              >
                <span className="block truncate">
                  {isComplete ? '✓ ' : ''}{ch.chapter_name}
                </span>
                {total > 0 && (
                  <div className="mt-1.5">
                    <div className="h-1 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isComplete ? 'bg-emerald-500' : isInProgress ? 'bg-amber-400' : 'bg-gray-300'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs opacity-60 mt-0.5 block">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Focus Areas</h2>
          <p className="text-sm text-gray-500 mb-4">Topics where you need the most practice</p>
          <div className="space-y-3">
            {weakSkills.map((s) => (
              <div key={s.skill}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{s.skill}</span>
                  <span className="text-barca-red font-semibold">{s.accuracy}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-barca-red rounded-full"
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{s.chapter_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <p className="text-center text-gray-400 text-sm">
          No attempts yet — start your first quiz above!
        </p>
      )}

      {/* Floating icon button */}
      <button
        onClick={() => setShowExplainer(true)}
        className="fixed bottom-6 right-4 z-40 w-14 h-14 bg-barca-navy hover:bg-barca-navy-dark text-white rounded-full shadow-xl flex items-center justify-center text-2xl transition-all hover:scale-110 active:scale-95"
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
