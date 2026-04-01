import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject, SUBJECTS } from '../context/SubjectContext';

import { useAuth } from '../context/AuthContext';

const SUBJECT_COLORS = {
  biology:        { bg: 'bg-emerald-50',  border: 'border-emerald-200', accent: 'text-emerald-700', bar: 'bg-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  history_civics: { bg: 'bg-amber-50',    border: 'border-amber-200',   accent: 'text-amber-700',   bar: 'bg-amber-500',   btn: 'bg-amber-600 hover:bg-amber-700' },
  chemistry:      { bg: 'bg-blue-50',     border: 'border-blue-200',    accent: 'text-blue-700',    bar: 'bg-blue-500',    btn: 'bg-blue-600 hover:bg-blue-700' },
};

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { subject: activeSubject, setSubject } = useSubject();
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const [subjectStats, setSubjectStats] = useState({});
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      const results = await Promise.all(
        SUBJECTS.map(async (s) => {
          const [scoresRes, weakRes, lastSessionRes, reviewRes] = await Promise.all([
            supabase.from('skill_scores').select('total_attempts, correct_attempts').eq('subject', s.id),
            supabase.rpc('get_weak_skills', { p_subject: s.id, p_limit: 1 }),
            supabase.from('sessions').select('created_at').eq('subject', s.id)
              .order('created_at', { ascending: false }).limit(1).single(),
            supabase.from('review_queue').select('id', { count: 'exact' })
              .eq('subject', s.id).is('completed_at', null)
              .lte('scheduled_for', new Date().toISOString()),
          ]);

          const scores = scoresRes.data || [];
          const total = scores.reduce((sum, r) => sum + r.total_attempts, 0);
          const correct = scores.reduce((sum, r) => sum + r.correct_attempts, 0);
          const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;

          const lastSession = lastSessionRes.data;
          const daysSince = lastSession
            ? Math.floor((Date.now() - new Date(lastSession.created_at)) / 86400000)
            : null;

          const weakSkill = weakRes.data?.[0] || null;
          const reviewCount = reviewRes.count || 0;

          return { id: s.id, total, accuracy, daysSince, weakSkill, reviewCount };
        })
      );

      const statsMap = {};
      let grand = 0;
      results.forEach(r => { statsMap[r.id] = r; grand += r.total; });
      setSubjectStats(statsMap);
      setTotalQuestions(grand);
      setLoading(false);
    }
    loadAll();
  }, []);

  function goToSubject(s) {
    setSubject(s);
    navigate('/dashboard');
  }

  const activeSubjects = SUBJECTS.filter(s => subjectStats[s.id]?.total > 0).length;

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Welcome header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Hey {firstName}! 👋</h1>
        <p className="text-gray-500 mt-1">What are we studying today?</p>
      </div>

      {/* Overall stats */}
      {!loading && totalQuestions > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <OverallStat label="Total Questions Done" value={totalQuestions} icon="📝" />
          <OverallStat label="Subjects Active" value={`${activeSubjects} / ${SUBJECTS.length}`} icon="📚" />
          <OverallStat
            label="Reviews Pending"
            value={Object.values(subjectStats).reduce((s, v) => s + (v.reviewCount || 0), 0) || '—'}
            icon="🔁"
          />
        </div>
      )}

      {/* Subject cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Your Subjects</h2>
        {loading ? (
          <div className="space-y-4">
            {SUBJECTS.map(s => <SkeletonCard key={s.id} />)}
          </div>
        ) : (
          SUBJECTS.map((s) => {
            const stats = subjectStats[s.id] || {};
            const colors = SUBJECT_COLORS[s.id] || SUBJECT_COLORS.biology;
            const notStarted = !stats.total;
            const isActive = activeSubject?.id === s.id;

            return (
              <div
                key={s.id}
                className={`rounded-2xl border-2 ${colors.border} ${colors.bg} p-6 transition-all hover:shadow-md ${isActive ? 'ring-2 ring-offset-2 ring-barca-gold' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-3xl leading-none">{s.emoji}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{s.label}</h3>
                          {isActive && (
                            <span className="text-[10px] font-semibold bg-barca-gold text-barca-navy px-2 py-0.5 rounded-full uppercase tracking-wide">
                              Last studied
                            </span>
                          )}
                        </div>
                        {!notStarted && stats.daysSince !== null && (
                          <p className="text-xs text-gray-400">
                            {stats.daysSince === 0 ? 'Studied today' : `Last studied ${stats.daysSince} day${stats.daysSince > 1 ? 's' : ''} ago`}
                          </p>
                        )}
                        {notStarted && (
                          <p className="text-xs text-gray-400">Not started yet</p>
                        )}
                      </div>
                      </div>
                    </div>

                    {!notStarted && (
                      <div className="space-y-3">
                        {/* Stats row */}
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-600">
                            <span className={`font-bold text-base ${colors.accent}`}>{stats.total}</span>
                            <span className="text-gray-400 ml-1">questions done</span>
                          </span>
                          {stats.accuracy !== null && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="text-gray-600">
                                <span className={`font-bold text-base ${
                                  stats.accuracy >= 70 ? 'text-emerald-600'
                                  : stats.accuracy >= 40 ? 'text-amber-600'
                                  : 'text-red-600'
                                }`}>{stats.accuracy}%</span>
                                <span className="text-gray-400 ml-1">accuracy</span>
                              </span>
                            </>
                          )}
                        </div>

                        {/* Accuracy bar */}
                        {stats.accuracy !== null && (
                          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden w-full max-w-xs">
                            <div
                              className={`h-full rounded-full transition-all ${
                                stats.accuracy >= 70 ? 'bg-emerald-500'
                                : stats.accuracy >= 40 ? 'bg-amber-500'
                                : 'bg-red-500'
                              }`}
                              style={{ width: `${stats.accuracy}%` }}
                            />
                          </div>
                        )}

                        {/* Weak skill badge */}
                        {stats.weakSkill && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">⚠️</span>
                            <span className="text-xs text-gray-500">
                              Focus area: <span className="font-medium text-gray-700">{stats.weakSkill.skill}</span>
                              <span className="text-gray-400 ml-1">({stats.weakSkill.accuracy}%)</span>
                            </span>
                          </div>
                        )}

                        {/* Review badge */}
                        {stats.reviewCount > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">🔁</span>
                            <span className="text-xs text-amber-700 font-medium">
                              {stats.reviewCount} question{stats.reviewCount > 1 ? 's' : ''} ready to review
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: CTA button */}
                  <button
                    onClick={() => goToSubject(s)}
                    className={`shrink-0 ${colors.btn} text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2`}
                  >
                    {notStarted ? 'Start' : 'Study'}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom nudge if nothing started */}
      {!loading && totalQuestions === 0 && (
        <p className="text-center text-gray-400 text-sm py-4">
          Pick a subject above to start your first quiz 🚀
        </p>
      )}
    </div>
  );
}

function OverallStat({ label, value, icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-2xl mb-1">{icon}</p>
      <p className="text-2xl font-bold text-barca-navy">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-6 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gray-200 rounded-full" />
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-32" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded w-3/4" />
    </div>
  );
}
