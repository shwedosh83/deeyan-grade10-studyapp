import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress, formatHours } from '../context/ProgressContext';
import { SUBJECTS } from '../context/SubjectContext';
import { subjectStyle } from '../lib/subjectStyle';
import { bandOf, MIN_ANSWERS } from './progress/bands';

// My progress: every number on this page comes from useProgress() (api/progress.js). Nothing is estimated here.

const subjectMeta = id => SUBJECTS.find(s => s.id === id) || { id, label: id.replace(/_/g, ' '), emoji: '📘' };
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
const fmtLong = iso => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function ProgressPage() {
  const { data, loading, error, refresh } = useProgress();

  if (!data && loading) return <ProgressSkeleton />;
  if (!data && error) return <ErrorCard message={error} onRetry={refresh} />;
  if (!data) return <ErrorCard message="We couldn't load your progress." onRetry={refresh} />;

  const isNew = data.totals.answered === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="eyebrow">Your record</p>
        <h1 className="page-title mt-1">My progress</h1>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span>Couldn't refresh just now — showing your last loaded numbers.</span>
          <button onClick={refresh} className="btn-ghost py-1">Retry</button>
        </div>
      )}

      <Hero data={data} />

      {isNew ? (
        <div className="card p-8 text-center">
          <p className="section-title">No answers yet</p>
          <p className="mt-1 text-sm text-ink-2">Answer a few questions and your accuracy, mastery map and weekly chart will appear here.</p>
          <Link to="/home" className="btn-primary mt-5">Start practising</Link>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3"><WeeklyChart week={data.week} improvement={data.improvement} /></div>
            <div className="lg:col-span-2"><Revision revision={data.revision} next={data.next_challenge} /></div>
          </div>
          <MasteryMap subjects={data.subjects} />
          {data.difficulty?.length > 0 && <Difficulty rows={data.difficulty} />}
        </>
      )}

      <Badges badges={data.badges} />
      <Levels levels={data.levels} level={data.level} xp={data.totals.xp} />
      <Rules rules={data.rules} />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */
function Hero({ data }) {
  const { level, totals, streak } = data;
  const toNext = level.next ? level.next_min - totals.xp : 0;
  const stats = [
    { label: 'Time spent answering', value: formatHours(totals.seconds), hint: 'Active answering time' },
    { label: 'Current streak', value: `${streak.current} day${streak.current === 1 ? '' : 's'}`, hint: `Best: ${streak.best} day${streak.best === 1 ? '' : 's'}` },
    { label: 'Active days', value: totals.active_days.toLocaleString(), hint: 'Days with at least one answer' },
    { label: 'Questions answered', value: totals.answered.toLocaleString(), hint: `${totals.correct.toLocaleString()} correct` },
    { label: 'Accuracy', value: totals.accuracy === null ? '—' : `${totals.accuracy}%`, hint: 'Across all subjects' },
  ];
  return (
    <section className="card overflow-hidden">
      <div className="bg-gradient-to-br from-barca-navy-deep via-barca-navy to-barca-navy-dark p-6 text-white">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Level {level.index + 1} of {data.levels.length}</p>
            <p className="mt-1 font-display text-3xl font-bold tracking-tight">{level.name}</p>
            <p className="mt-1 text-sm text-white/70">
              {level.next ? <>{toNext.toLocaleString()} XP to {level.next}</> : 'Top level reached'}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold tracking-tight text-barca-gold">{totals.xp.toLocaleString()}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Total XP</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-barca-navy-deep/60">
            <div className="h-full rounded-full bg-gradient-to-r from-barca-gold to-amber-300 transition-[width] duration-300" style={{ width: `${level.progress}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-white/50">
            <span>{level.min.toLocaleString()} XP</span>
            <span>{level.progress}%</span>
            <span>{level.next ? `${level.next_min.toLocaleString()} XP` : 'Max'}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
        {stats.map(s => (
          <div key={s.label} className="p-4">
            <p className="eyebrow">{s.label}</p>
            <p className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">{s.value}</p>
            <p className="text-xs text-ink-3">{s.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Weekly chart ────────────────────────────────────────────────────── */
function WeeklyChart({ week, improvement }) {
  const maxA = Math.max(1, ...week.map(d => d.answered));
  const maxM = Math.max(1, ...week.map(d => d.minutes));
  const totalA = week.reduce((s, d) => s + d.answered, 0);
  const totalM = week.reduce((s, d) => s + d.minutes, 0);
  const { this_week: tw, last_week: lw } = improvement;
  const delta = tw !== null && lw !== null ? tw - lw : null;

  return (
    <section className="card h-full p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Last 7 days</p>
          <h2 className="section-title mt-0.5">This week</h2>
        </div>
        <div className="flex gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Answered</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-accent" />Minutes</span>
        </div>
      </div>

      {totalA === 0 ? (
        <div className="mt-6 rounded-xl bg-surface-2 p-6 text-center text-sm text-ink-2">
          No answers in the last 7 days. A short Sprint round is an easy way back in.
        </div>
      ) : (
        <div className="mt-5 flex h-40 items-end gap-3">
          {week.map(d => (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center gap-1.5" title={`${d.answered} answered · ${d.minutes} min`}>
              <div className="flex w-full flex-1 items-end justify-center gap-1">
                <Bar h={(d.answered / maxA) * 100} cls="bg-brand" label={d.answered} />
                <Bar h={(d.minutes / maxM) * 100} cls="bg-accent" label={d.minutes} />
              </div>
              <span className="text-[11px] font-medium text-ink-3">{fmtDate(d.date)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <MiniStat label="Answered" value={totalA.toLocaleString()} />
        <MiniStat label="Minutes" value={totalM.toLocaleString()} />
        <div>
          <p className="eyebrow">Accuracy vs last week</p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink">
            {tw === null ? '—' : `${tw}%`}
            {delta !== null && (
              <span className={`ml-2 text-sm ${delta > 0 ? 'text-good' : delta < 0 ? 'text-bad' : 'text-ink-3'}`}>
                {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)} pts
              </span>
            )}
          </p>
          <p className="text-xs text-ink-3">
            {lw === null ? 'No answers the week before' : `Last week ${lw}% (${improvement.answered_last_week} answered)`}
          </p>
        </div>
      </div>
    </section>
  );
}

function Bar({ h, cls, label }) {
  return (
    <div className="relative flex h-full w-3.5 items-end">
      <div className={`w-full rounded-t ${cls} transition-[height] duration-300`} style={{ height: `${label > 0 ? Math.max(h, 4) : 0}%` }} />
    </div>
  );
}

const MiniStat = ({ label, value }) => (
  <div>
    <p className="eyebrow">{label}</p>
    <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
  </div>
);

/* ── Revision & next challenge ───────────────────────────────────────── */
function Revision({ revision, next }) {
  return (
    <section className="card h-full p-5">
      <p className="eyebrow">Worth another look</p>
      <h2 className="section-title mt-0.5">Revision list</h2>

      {next && (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-ink">Recommended next</p>
          {next.type === 'revise' ? (
            <p className="mt-1 text-sm text-ink">
              Revise <span className="font-semibold">{next.chapter}</span> in {subjectMeta(next.subject).label}: {next.from === 'school' ? `your school tests on it came to ${next.got}/${next.marks} marks` : `you're at ${next.accuracy}% over ${next.answered} answers`}.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink">
              Revisit <span className="font-semibold">{subjectMeta(next.subject).label}</span>
              {next.last_active ? ` — last practised ${fmtLong(next.last_active)}.` : '.'}
            </p>
          )}
          <Link to={`/${next.subject}`} className="btn-primary mt-3 px-4 py-2">Practise</Link>
        </div>
      )}

      {revision.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Nothing flagged. Chapters appear here once you have {MIN_ANSWERS}+ answers and are under 70%.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {revision.map(r => {
            const b = bandOf(r.accuracy, r.from === 'school' ? 99 : r.answered);
            const m = subjectMeta(r.subject);
            return (
              <li key={`${r.subject}-${r.chapter}`} className="flex items-center gap-3 py-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${subjectStyle(r.subject).tile}`}>{m.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={r.chapter}>{r.chapter}</p>
                  <p className="text-xs text-ink-3">{m.label} · {r.from === 'school' ? `school tests: ${r.got}/${r.marks} marks` : `${r.correct}/${r.answered} correct`}</p>
                </div>
                <span className={`text-sm font-semibold ${b.text}`}>{r.accuracy}%</span>
                <Link to={`/${r.subject}`} className="btn-ghost px-2.5 py-1 text-xs">Practise</Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Mastery map ─────────────────────────────────────────────────────── */
function MasteryMap({ subjects }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">By chapter</p>
          <h2 className="section-title mt-0.5">Mastery map</h2>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink-2">
          <Legend cls="bg-good" label="75%+" />
          <Legend cls="bg-warn" label="50–74%" />
          <Legend cls="bg-bad" label="Under 50%" />
          <Legend cls="bg-ink-3/40" label={`Under ${MIN_ANSWERS} answers`} />
        </div>
      </div>

      <div className="mt-5 space-y-6">
        {subjects.map(s => {
          const m = subjectMeta(s.subject);
          const st = subjectStyle(s.subject);
          return (
            <div key={s.subject}>
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${st.tile}`}>{m.emoji}</span>
                <Link to={`/${s.subject}`} className="font-display font-semibold text-ink transition duration-150 hover:text-brand">{m.label}</Link>
                <span className="text-xs text-ink-3">{s.answered} answered · {s.accuracy ?? '—'}% accuracy</span>
                <div className="ml-auto hidden w-40 sm:block">
                  <div className="progress-track h-1.5"><div className={`progress-fill bg-gradient-to-r ${st.grad}`} style={{ width: `${s.accuracy ?? 0}%` }} /></div>
                </div>
              </div>
              {s.chapters.length === 0 ? (
                <p className="mt-2 text-xs text-ink-3">No chapter-tagged answers yet.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                  {s.chapters.map(c => {
                    const b = bandOf(c.accuracy, c.answered);
                    const enough = c.answered >= MIN_ANSWERS;
                    return (
                      <div key={c.chapter} className={`rounded-xl border p-3 ${b.tile}`} title={c.chapter}>
                        <p className="line-clamp-2 min-h-[2.5rem] text-xs font-medium text-ink">{c.chapter}</p>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="font-display text-lg font-bold">{enough ? `${c.accuracy}%` : '—'}</span>
                          <span className="text-[11px] text-ink-3">{enough ? `${c.answered} answered` : `${c.answered} of ${MIN_ANSWERS} needed`}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const Legend = ({ cls, label }) => <span className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />{label}</span>;

/* ── Difficulty ──────────────────────────────────────────────────────── */
function Difficulty({ rows }) {
  return (
    <section className="card p-5">
      <p className="eyebrow">Board questions</p>
      <h2 className="section-title mt-0.5">Accuracy by board difficulty</h2>
      <div className="mt-4 space-y-3">
        {rows.map(r => {
          const b = bandOf(r.accuracy, r.answered);
          return (
            <div key={r.difficulty} className="flex items-center gap-4">
              <span className="w-24 shrink-0 text-sm font-medium text-ink-2">Difficulty {r.difficulty}</span>
              <div className="progress-track flex-1"><div className={`progress-fill ${b.bar}`} style={{ width: `${r.accuracy ?? 0}%` }} /></div>
              <span className={`w-12 text-right text-sm font-semibold ${b.text}`}>{r.accuracy ?? '—'}%</span>
              <span className="w-24 text-right text-xs text-ink-3">{r.answered} answered</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Badges ──────────────────────────────────────────────────────────── */
function Badges({ badges }) {
  const earned = badges.filter(b => b.earned).length;
  return (
    <section className="card p-5">
      <div className="flex items-end justify-between">
        <div>
          <p className="eyebrow">Milestones</p>
          <h2 className="section-title mt-0.5">Badges</h2>
        </div>
        <span className="text-sm text-ink-3">{earned} of {badges.length} earned</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {badges.map(b => (
          <div key={b.id}
            className={`rounded-xl border p-4 transition duration-200 ${b.earned ? 'animate-pop border-accent/40 bg-accent-soft' : 'border-line bg-surface-2'}`}>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-base ${b.earned ? 'bg-accent text-barca-navy-deep' : 'bg-line text-ink-3'}`}>
                {b.earned ? '★' : '☆'}
              </span>
              <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${b.earned ? 'text-ink' : 'text-ink-2'}`}>{b.name}</p>
                <p className="text-xs text-ink-3">{b.desc}</p>
              </div>
            </div>
            {!b.earned && (
              <div className="mt-3">
                <div className="progress-track h-1.5"><div className="progress-fill bg-ink-3/50" style={{ width: `${(b.progress / b.goal) * 100}%` }} /></div>
                <p className="mt-1 text-[11px] text-ink-3">{b.progress.toLocaleString()} / {b.goal.toLocaleString()}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Levels ladder ───────────────────────────────────────────────────── */
function Levels({ levels, level, xp }) {
  return (
    <section className="card p-5">
      <p className="eyebrow">XP thresholds</p>
      <h2 className="section-title mt-0.5">Levels</h2>
      <ol className="mt-4 grid grid-cols-5 gap-2">
        {levels.map((l, i) => {
          const cur = i === level.index, done = i < level.index;
          return (
            <li key={l.name}
              className={`rounded-xl border p-3 text-center transition duration-200 ${cur ? 'border-brand bg-brand-soft shadow-glow' : done ? 'border-line bg-surface-2' : 'border-dashed border-line'}`}>
              <p className={`text-sm font-semibold ${cur ? 'text-brand-ink' : done ? 'text-ink-2' : 'text-ink-3'}`}>{done ? '✓ ' : ''}{l.name}</p>
              <p className="text-xs text-ink-3">{l.min.toLocaleString()} XP</p>
              {cur && <p className="mt-1 text-[11px] font-semibold text-brand-ink">You · {xp.toLocaleString()} XP</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ── How this is counted ─────────────────────────────────────────────── */
function Rules({ rules }) {
  const [open, setOpen] = useState(false);
  const labels = { xp: 'XP', streak: 'Streak', goal: 'Daily goal', time: 'Time spent' };
  return (
    <section className="card">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left">
        <span className="section-title">How this is counted</span>
        <span className={`text-ink-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <dl className="animate-fade-in space-y-3 border-t border-line px-5 py-4">
          {Object.entries(rules).map(([k, v]) => (
            <div key={k} className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <dt className="text-sm font-semibold text-ink">{labels[k] || k}</dt>
              <dd className="text-sm text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/* ── States ──────────────────────────────────────────────────────────── */
function ProgressSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="skeleton h-72 rounded-2xl lg:col-span-3" />
        <div className="skeleton h-72 rounded-2xl lg:col-span-2" />
      </div>
      <div className="skeleton h-64 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  );
}

function ErrorCard({ message, onRetry }) {
  return (
    <div className="card p-8 text-center">
      <p className="section-title">We couldn't load your progress</p>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      <button onClick={onRetry} className="btn-primary mt-5">Retry</button>
    </div>
  );
}
