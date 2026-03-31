import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export default function WeeklySummary() {
  const weekStart = getWeekStart();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const { subject } = useSubject();
  const [generating, setGenerating] = useState(false);
  const [weekStats, setWeekStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [summaryRes, skillsRes, sessionsRes] = await Promise.all([
      supabase.from('weekly_summaries').select('*').eq('subject', subject.id).eq('week_start', weekStart).maybeSingle(),
      supabase.from('skill_scores').select('*').eq('subject', subject.id).order('correct_attempts'),
      supabase
        .from('sessions')
        .select('total_questions, correct_answers, started_at')
        .gte('started_at', `${weekStart}T00:00:00`)
        .not('ended_at', 'is', null),
    ]);
    if (summaryRes.data) setSummary(summaryRes.data.summary_text);
    if (sessionsRes.data) {
      const total = sessionsRes.data.reduce((s, r) => s + (r.total_questions || 0), 0);
      const correct = sessionsRes.data.reduce((s, r) => s + (r.correct_answers || 0), 0);
      setWeekStats({ total, correct, sessions: sessionsRes.data.length, skills: skillsRes.data || [] });
    }
    setLoading(false);
  }

  async function generateSummary() {
    if (!weekStats || weekStats.total === 0) {
      setError('No quiz activity this week yet. Complete some quizzes first!');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillScores: weekStats.skills,
          weekStart,
          totalQuestions: weekStats.total,
          correctAnswers: weekStats.correct,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await supabase
        .from('weekly_summaries')
        .upsert({ subject: 'biology', week_start: weekStart, summary_text: data.summary }, { onConflict: 'subject,week_start' });
      setSummary(data.summary);
    } catch (err) {
      setError(err.message || 'Failed to generate summary. Is the backend running?');
    }
    setGenerating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const accuracy =
    weekStats && weekStats.total > 0
      ? Math.round((weekStats.correct / weekStats.total) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Weekly Summary</h1>
        <p className="text-gray-500 text-sm mt-1">
          Week of {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Week stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Questions" value={weekStats?.total || 0} />
        <StatCard label="Accuracy" value={accuracy !== null ? `${accuracy}%` : '—'} highlight={accuracy} />
        <StatCard label="Sessions" value={weekStats?.sessions || 0} />
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">AI Summary</h2>
          <button
            onClick={generateSummary}
            disabled={generating}
            className="text-sm bg-barca-navy hover:bg-barca-navy-dark text-white px-4 py-1.5 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : summary ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {error && (
          <p className="text-sm text-barca-red bg-barca-red-light rounded-lg px-4 py-3 mb-4">{error}</p>
        )}

        {summary ? (
          <p className="text-gray-700 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-gray-400 text-sm">
            {weekStats?.total === 0
              ? 'Complete some quizzes this week, then generate your summary.'
              : 'Click "Generate" to get your personalised weekly summary from Claude.'}
          </p>
        )}
      </div>

      {/* Skill breakdown */}
      {weekStats?.skills && weekStats.skills.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">All-time Skill Scores</h2>
          <div className="space-y-3">
            {weekStats.skills.map((s) => {
              const acc = s.total_attempts > 0
                ? Math.round((s.correct_attempts / s.total_attempts) * 100)
                : 0;
              const col = acc >= 70 ? 'text-barca-navy' : acc >= 40 ? 'text-amber-500' : 'text-barca-red';
              const bar = acc >= 70 ? 'bg-barca-navy' : acc >= 40 ? 'bg-amber-400' : 'bg-barca-red';
              return (
                <div key={s.skill}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{s.skill}</span>
                    <span className={`font-semibold ${col}`}>{acc}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${acc}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  const color =
    highlight === null || highlight === undefined ? 'text-barca-navy'
    : highlight >= 70 ? 'text-barca-navy'
    : highlight >= 40 ? 'text-amber-500'
    : 'text-barca-red';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
