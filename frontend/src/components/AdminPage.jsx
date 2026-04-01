import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ADMIN_EMAIL = 'shwetadoshireads@gmail.com';

const SUBJECT_META = {
  biology:        { label: 'Biology',          emoji: '🧬', color: 'text-emerald-600 bg-emerald-50' },
  history_civics: { label: 'History & Civics',  emoji: '🏛️', color: 'text-amber-600 bg-amber-50'   },
  chemistry:      { label: 'Chemistry',         emoji: '⚗️', color: 'text-blue-600 bg-blue-50'     },
  geography:      { label: 'Geography',         emoji: '🗺️', color: 'text-purple-600 bg-purple-50' },
};

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);

  // Gate: redirect if not admin
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) navigate('/');
  }, [user]);

  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) return;

    async function fetchAdmin() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      try {
        const res = await fetch('/api/admin', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(e.message);
      }
      setLoading(false);
    }

    fetchAdmin();
  }, [user]);

  if (!user || user.email !== ADMIN_EMAIL) return null;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-700 text-sm">{error}</div>
  );

  const { summary, users } = data;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
            <span className="text-xs font-semibold bg-barca-red text-white px-2 py-0.5 rounded-full uppercase tracking-wide">Private</span>
          </div>
          <p className="text-gray-500 text-sm mt-1">User activity across MyAICoach</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon="👥" label="Total Users" value={summary.totalUsers} />
        <SummaryCard icon="📝" label="Questions Answered" value={summary.totalQuestions.toLocaleString()} />
        <SummaryCard icon="📅" label="Active This Week" value={summary.activeThisWeek} />
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Users ({users.length})</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {users.map(u => {
            const accuracy = u.totalQuestions > 0
              ? Math.round((u.totalCorrect / u.totalQuestions) * 100)
              : null;
            const subjectIds = Object.keys(u.subjects);
            const isExpanded = expandedUser === u.id;

            return (
              <div key={u.id}>
                {/* User row */}
                <button
                  onClick={() => setExpandedUser(isExpanded ? null : u.id)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                >
                  {/* Avatar */}
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-barca-navy flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {u.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  {/* Name + email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>

                  {/* Subjects used */}
                  <div className="flex gap-1 shrink-0">
                    {subjectIds.length === 0
                      ? <span className="text-xs text-gray-300">No activity</span>
                      : subjectIds.map(sid => (
                          <span key={sid} className={`text-xs px-2 py-0.5 rounded-full font-medium ${SUBJECT_META[sid]?.color || 'bg-gray-100 text-gray-600'}`}>
                            {SUBJECT_META[sid]?.emoji} {SUBJECT_META[sid]?.label || sid}
                          </span>
                        ))
                    }
                  </div>

                  {/* Questions + accuracy */}
                  <div className="text-right shrink-0 w-28">
                    <p className="text-sm font-bold text-barca-navy">{u.totalQuestions.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">questions</p>
                  </div>
                  <div className="text-right shrink-0 w-16">
                    {accuracy !== null ? (
                      <>
                        <p className={`text-sm font-bold ${accuracy >= 70 ? 'text-emerald-600' : accuracy >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {accuracy}%
                        </p>
                        <p className="text-xs text-gray-400">accuracy</p>
                      </>
                    ) : <p className="text-xs text-gray-300">—</p>}
                  </div>

                  {/* Last active */}
                  <div className="text-right shrink-0 w-24">
                    <p className="text-xs text-gray-500">{timeAgo(u.lastActive)}</p>
                  </div>

                  {/* Expand chevron */}
                  <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {/* Expanded: per-subject breakdown */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-1 bg-gray-50 border-t border-gray-100 space-y-4">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Subject Breakdown</p>
                    {subjectIds.length === 0 && <p className="text-sm text-gray-400">No quiz activity yet.</p>}
                    {subjectIds.map(sid => {
                      const sub = u.subjects[sid];
                      const meta = SUBJECT_META[sid] || { label: sid, emoji: '📚' };
                      const subAccuracy = sub.questions > 0
                        ? Math.round((sub.correct / sub.questions) * 100)
                        : null;
                      const topSkills = (sub.skills || [])
                        .sort((a, b) => b.attempts - a.attempts)
                        .slice(0, 5);

                      return (
                        <div key={sid} className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{meta.emoji}</span>
                              <span className="font-semibold text-gray-800 text-sm">{meta.label}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>{sub.sessions} session{sub.sessions !== 1 ? 's' : ''}</span>
                              <span className="font-semibold text-gray-800">{sub.questions} questions</span>
                              {subAccuracy !== null && (
                                <span className={`font-bold ${subAccuracy >= 70 ? 'text-emerald-600' : subAccuracy >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                                  {subAccuracy}% accuracy
                                </span>
                              )}
                              <span className="text-xs text-gray-400">Last: {timeAgo(sub.lastStudied)}</span>
                            </div>
                          </div>

                          {/* Skills */}
                          {topSkills.length > 0 && (
                            <div className="space-y-1.5">
                              {topSkills.map(sk => (
                                <div key={sk.skill} className="flex items-center gap-3">
                                  <span className="text-xs text-gray-500 w-48 truncate">{sk.skill}</span>
                                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${sk.accuracy >= 70 ? 'bg-emerald-500' : sk.accuracy >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                                      style={{ width: `${sk.accuracy}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-medium text-gray-600 w-10 text-right">{sk.accuracy}%</span>
                                  <span className="text-xs text-gray-300 w-16 text-right">{sk.attempts} attempts</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-barca-navy">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
