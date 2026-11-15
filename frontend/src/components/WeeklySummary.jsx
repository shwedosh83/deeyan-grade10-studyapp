import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useProgress } from '../context/ProgressContext';
import { subjectStyle } from '../lib/subjectStyle';
import { bandOf } from './progress/bands';

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' });

// Weekly summary tab. Activity numbers come from useProgress() (the sessions table's own counters are not
// maintained, so they are not used). The saved AI summary still lives in weekly_summaries.
export default function WeeklySummary() {
  const weekStart = getWeekStart();
  const { subject } = useSubject();
  const { data, loading: progressLoading, error: progressError, refresh } = useProgress();
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSummary(null);
    setError(null);
    loadSummary();
  }, [subject.id]); // eslint-disable-line

  async function loadSummary() {
    setSummaryLoading(true);
    const { data: row } = await supabase.from('weekly_summaries').select('*').eq('subject', subject.id).eq('week_start', weekStart).maybeSingle();
    if (row) setSummary(row.summary_text);
    setSummaryLoading(false);
  }

  const week = data?.week || [];
  const weekAnswered = week.reduce((s, d) => s + d.answered, 0);
  const weekCorrect = week.reduce((s, d) => s + d.correct, 0);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const weekAccuracy = weekAnswered > 0 ? Math.round((weekCorrect / weekAnswered) * 100) : null;
  const entry = data?.subjects?.find(s => s.subject === subject.id);
  const skills = entry?.skills || [];
  const sevenDaysAgo = week[0]?.date;
  const subjectActiveThisWeek = !!(entry?.last_active && sevenDaysAgo && entry.last_active.slice(0, 10) >= sevenDaysAgo);

  async function generateSummary() {
    if (!entry || !subjectActiveThisWeek) {
      setError(`No ${subject.label} answers in the last 7 days yet. Complete a quiz first, then generate your summary.`);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Same shape the summary API has always taken, filled from real per-answer data for this subject.
          skillScores: skills.map(s => ({ skill: s.skill, total_attempts: s.answered, correct_attempts: s.correct })),
          weekStart,
          totalQuestions: entry.answered,
          correctAnswers: entry.correct,
          subject: subject.id,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      await supabase
        .from('weekly_summaries')
        .upsert({ subject: subject.id, week_start: weekStart, summary_text: json.summary }, { onConflict: 'subject,week_start' });
      setSummary(json.summary);
    } catch (err) {
      setError(err.message || 'Failed to generate summary. Is the backend running?');
    }
    setGenerating(false);
  }

  if ((!data && progressLoading) || summaryLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-56" />
        <div className="grid grid-cols-3 gap-4">{[0, 1, 2].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    );
  }

  const maxA = Math.max(1, ...week.map(d => d.answered));
  const st = subjectStyle(subject.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="page-title">Weekly summary</h1>
        <p className="mt-1 text-sm text-ink-3">
          Week of {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {!data && progressError ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-ink-2">We couldn't load this week's activity. {progressError}</p>
          <button onClick={refresh} className="btn-primary mt-4">Retry</button>
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="eyebrow">Last 7 days · all subjects</p>
              <h2 className="section-title mt-0.5">Your week</h2>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <StatCard label="Questions" value={weekAnswered.toLocaleString()} />
            <StatCard label="Accuracy" value={weekAccuracy !== null ? `${weekAccuracy}%` : '—'} accuracy={weekAccuracy} answered={weekAnswered} />
            <StatCard label="Minutes" value={weekMinutes.toLocaleString()} />
          </div>
          {weekAnswered > 0 && (
            <div className="mt-5 flex h-24 items-end gap-3">
              {week.map(d => (
                <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1" title={`${d.answered} answered · ${d.minutes} min`}>
                  <div className="flex w-full flex-1 items-end justify-center">
                    <div className="w-5 rounded-t bg-brand transition-[height] duration-300" style={{ height: `${d.answered ? Math.max((d.answered / maxA) * 100, 4) : 0}%` }} />
                  </div>
                  <span className="text-[11px] text-ink-3">{fmtDay(d.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary card */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">{subject.label}</p>
            <h2 className="section-title mt-0.5">AI summary</h2>
          </div>
          <button onClick={generateSummary} disabled={generating} className="btn-primary px-4 py-2">
            {generating ? 'Generating…' : summary ? 'Regenerate' : 'Generate'}
          </button>
        </div>

        {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

        {summary ? (
          <p className="leading-relaxed text-ink-2">{summary}</p>
        ) : (
          <p className="text-sm text-ink-3">
            {!subjectActiveThisWeek
              ? `Answer some ${subject.label} questions this week, then generate your summary.`
              : 'Select "Generate" for a personalised summary of your progress in this subject.'}
          </p>
        )}
      </div>

      {/* Topic breakdown (all-time, this subject) */}
      {skills.length > 0 && (
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="section-title">All-time topic accuracy</h2>
            <span className={`pill ${st.tile}`}>{subject.emoji} {subject.label}</span>
          </div>
          <div className="space-y-3">
            {skills.map(s => {
              const b = bandOf(s.accuracy, s.answered);
              return (
                <div key={s.skill}>
                  <div className="mb-1 flex justify-between gap-3 text-sm">
                    <span className="truncate text-ink-2">{s.skill}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-3">{s.correct}/{s.answered}</span>
                      <span className={`font-semibold ${b.text}`}>{s.accuracy ?? '—'}%</span>
                    </span>
                  </div>
                  <div className="progress-track h-1.5"><div className={`progress-fill ${b.bar}`} style={{ width: `${s.accuracy ?? 0}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accuracy, answered }) {
  const color = accuracy === undefined || accuracy === null ? 'text-ink' : bandOf(accuracy, answered).text;
  return (
    <div className="rounded-xl bg-surface-2 p-4 text-center">
      <p className={`font-display text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-3">{label}</p>
    </div>
  );
}
