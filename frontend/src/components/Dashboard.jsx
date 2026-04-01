import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import CoachWidget from './CoachWidget';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, correct: 0, skills: 0 });
  const [weakSkills, setWeakSkills] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { subject } = useSubject();
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Deeyan';

  useEffect(() => {
    async function load() {
      const [scoresRes, weakRes, chaptersRes, reviewRes] = await Promise.all([
        supabase.from('skill_scores').select('total_attempts, correct_attempts').eq('subject', subject.id),
        supabase.rpc('get_weak_skills', { p_subject: subject.id, p_limit: 3 }),
        supabase.rpc('get_chapters_for_subject', { p_subject: subject.id }),
        supabase.from('review_queue').select('id', { count: 'exact' })
          .eq('subject', subject.id).is('completed_at', null)
          .lte('scheduled_for', new Date().toISOString()),
      ]);

      if (scoresRes.data) {
        const total = scoresRes.data.reduce((s, r) => s + r.total_attempts, 0);
        const correct = scoresRes.data.reduce((s, r) => s + r.correct_attempts, 0);
        setStats({ total, correct, skills: scoresRes.data.length });
      }

      if (weakRes.data) setWeakSkills(weakRes.data);

      if (reviewRes.count) setReviewCount(reviewRes.count);

      if (chaptersRes.data) {
        const seen = new Set();
        const unique = chaptersRes.data.filter((c) => {
          if (seen.has(c.chapter_id)) return false;
          seen.add(c.chapter_id);
          return true;
        });
        setChapters(unique);
      }

      setLoading(false);
    }
    load();
  }, [subject]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Hey {firstName}!</h1>
      </div>

      {/* Coach Widget */}
      <CoachWidget subject={subject} weakSkills={weakSkills} totalDone={stats.total} />

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
          onClick={() => navigate('/quiz?mode=review')}
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
        <h2 className="font-semibold text-gray-800 mb-4">Start a Quiz</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
          <button
            onClick={() => navigate('/quiz')}
            className="col-span-2 sm:col-span-3 bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold py-3 rounded-lg transition-colors"
          >
            All Chapters
          </button>
          {chapters.map((ch) => (
            <button
              key={ch.chapter_id}
              onClick={() => navigate(`/quiz?chapter=${ch.chapter_id}`)}
              className="bg-barca-navy-light hover:bg-blue-100 text-barca-navy text-sm font-medium py-2 px-3 rounded-lg transition-colors text-left truncate"
            >
              {ch.chapter_name}
            </button>
          ))}
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
