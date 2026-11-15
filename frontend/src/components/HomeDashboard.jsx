import { Link } from 'react-router-dom';
import { SUBJECTS } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { useProgress, formatHours } from '../context/ProgressContext';
import { subjectStyle } from '../lib/subjectStyle';
import { BOARD_ONLY_SUBJECTS, SUBJECTS_WITH_BOARD } from '../lib/board';
import GoalRing from './home/GoalRing';
import WeekChart from './home/WeekChart';

// Home: the student's command centre. Every number here comes from useProgress() (/api/progress).

const subjectMeta = id => SUBJECTS.find(s => s.id === id) || { id, label: id, emoji: '📘' };
const accTone = a => (a >= 75 ? 'text-good' : a >= 50 ? 'text-warn' : 'text-bad');
const practicePath = id => (BOARD_ONLY_SUBJECTS.includes(id) ? `/${id}/board/sprint` : `/${id}`);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function daysAgo(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function HomeDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refresh } = useProgress();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const header = (
    <header className="animate-fade-in">
      <p className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1 className="page-title mt-1">{greeting()}, {firstName}</h1>
      <p className="mt-1 text-sm text-ink-2">Here's where you stand and what to do next.</p>
    </header>
  );

  if (!data && loading) return <div className="space-y-6">{header}<HomeSkeleton /></div>;

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card flex items-center justify-between gap-4 p-6">
          <div>
            <p className="font-semibold text-ink">We couldn't load your progress.</p>
            <p className="mt-1 text-sm text-ink-3">{error ? 'The server didn’t respond as expected. Your practice history is safe.' : 'No progress data yet.'}</p>
          </div>
          <button onClick={refresh} className="btn-secondary shrink-0">Retry</button>
        </div>
      </div>
    );
  }

  const { totals, level, streak, today, week, improvement, revision = [], next_challenge, badges = [] } = data;
  const progressBySubject = Object.fromEntries((data.subjects || []).map(s => [s.subject, s]));
  const isNew = !totals.answered;

  return (
    <div className="space-y-6">
      {header}

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <span>Couldn't refresh your latest numbers — showing the last ones we loaded.</span>
          <button onClick={refresh} className="btn-ghost shrink-0 py-1">Retry</button>
        </div>
      )}

      <StatRow totals={totals} level={level} streak={streak} today={today} />

      {isNew ? (
        <WelcomeCard />
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <NextChallenge challenge={next_challenge} />
          <ContinueLearning subjects={data.subjects || []} />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="section-title">Your subjects</h2>
          <Link to="/progress" className="text-sm font-semibold text-brand transition duration-150 hover:text-brand/80">Full progress</Link>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {SUBJECTS.map(s => <SubjectCard key={s.id} s={s} p={progressBySubject[s.id]} />)}
        </div>
      </section>

      {!isNew && <StrengthsAndGaps subjects={data.subjects || []} revision={revision} />}

      <div className="grid grid-cols-3 gap-6">
        <WeekCard week={week} improvement={improvement} />
        <BadgesCard badges={badges} />
      </div>
    </div>
  );
}

// ── Top stats ───────────────────────────────────────────────────────────────
function StatRow({ totals, level, streak, today }) {
  const left = Math.max(0, today.goal - today.answered);
  const xpToNext = level.next ? level.next_min - totals.xp : 0;
  return (
    <div className="grid grid-cols-4 gap-4 animate-slide-up">
      <div className="card flex items-center gap-4 p-5">
        <GoalRing value={today.answered} goal={today.goal} />
        <div className="min-w-0">
          <p className="eyebrow">Today's goal</p>
          <p className="mt-1 text-sm font-semibold text-ink">{today.done ? 'Goal reached' : `${left} to go`}</p>
          <p className="mt-0.5 text-xs text-ink-3">{today.done ? 'Anything extra is a bonus.' : `${today.goal} questions a day`}</p>
        </div>
      </div>

      <div className="card p-5">
        <p className="eyebrow">Streak</p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-3xl font-bold text-ink">{streak.current}</span>
          <span className="text-sm text-ink-3">day{streak.current === 1 ? '' : 's'}</span>
          {streak.current > 0 && <span className="text-lg" aria-hidden="true">🔥</span>}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {streak.active_today ? 'Done for today' : streak.current > 0 ? 'Answer one question today to keep it' : 'Answer one question to start one'}
          {' · '}best {streak.best}
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Level</p>
          <span className="pill bg-accent-soft text-accent">{totals.xp.toLocaleString()} XP</span>
        </div>
        <p className="mt-2 font-display text-2xl font-bold text-ink">{level.name}</p>
        <div className="progress-track mt-2 h-1.5">
          <div className="progress-fill bg-gradient-to-r from-barca-gold to-amber-400" style={{ width: `${level.progress}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-ink-3">{level.next ? `${xpToNext.toLocaleString()} XP to ${level.next}` : 'Top level reached'}</p>
      </div>

      <div className="card p-5">
        <p className="eyebrow">Time practised</p>
        <p className="mt-2 font-display text-3xl font-bold text-ink">{formatHours(totals.seconds)}</p>
        <p className="mt-1 text-xs text-ink-3">{totals.answered.toLocaleString()} answered · {totals.active_days} active day{totals.active_days === 1 ? '' : 's'}</p>
      </div>
    </div>
  );
}

// ── Hero: next challenge ────────────────────────────────────────────────────
function NextChallenge({ challenge }) {
  if (!challenge) {
    return (
      <div className="card col-span-2 flex flex-col justify-center p-6">
        <p className="eyebrow">Your next challenge</p>
        <p className="mt-2 font-display text-xl font-bold text-ink">Nothing flagged right now</p>
        <p className="mt-1 text-sm text-ink-2">No chapter needs revision yet. Keep practising and we'll point out where to focus.</p>
      </div>
    );
  }
  const meta = subjectMeta(challenge.subject);
  const st = subjectStyle(challenge.subject);
  const revise = challenge.type === 'revise';
  const to = revise
    ? (BOARD_ONLY_SUBJECTS.includes(challenge.subject) ? `/${challenge.subject}/board/sprint` : `/${challenge.subject}/chapters`)
    : practicePath(challenge.subject);
  const last = daysAgo(challenge.last_active);

  return (
    <div className="relative col-span-2 overflow-hidden rounded-2xl bg-gradient-to-br from-barca-navy-deep via-barca-navy to-barca-navy-dark p-6 text-white shadow-lift animate-slide-up">
      <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br ${st.grad} opacity-25 blur-2xl`} />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-wider text-barca-gold">Your next challenge</p>
        <div className="mt-3 flex items-center gap-2 text-sm text-white/70">
          <span aria-hidden="true">{meta.emoji}</span>{meta.label}
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white">
          {revise ? challenge.chapter : `Pick ${meta.label} back up`}
        </h2>
        <p className="mt-2 max-w-lg text-sm text-white/75">
          {revise
            ? `You're at ${challenge.accuracy}% across ${challenge.answered} answers here. A focused round now is the quickest way to lift it.`
            : `This is the subject you've practised least recently${last ? ` (last ${last})` : ''}. A short round keeps it fresh.`}
        </p>
        <Link to={to} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-barca-gold px-5 py-2.5 text-sm font-semibold text-barca-navy-deep shadow-soft transition duration-150 hover:bg-amber-300 active:scale-[0.98]">
          {revise ? 'Practise this chapter' : `Open ${meta.label}`} <Arrow />
        </Link>
      </div>
    </div>
  );
}

// ── Continue learning: most recent subject ─────────────────────────────────
function ContinueLearning({ subjects }) {
  const recent = [...subjects].filter(s => s.last_active).sort((a, b) => b.last_active.localeCompare(a.last_active))[0];
  if (!recent) {
    return (
      <div className="card flex flex-col justify-center p-6">
        <p className="eyebrow">Continue learning</p>
        <p className="mt-2 text-sm text-ink-2">Nothing in progress yet.</p>
      </div>
    );
  }
  const meta = subjectMeta(recent.subject);
  const st = subjectStyle(recent.subject);
  return (
    <Link to={practicePath(recent.subject)} className="card card-hover group flex flex-col p-6 animate-slide-up">
      <p className="eyebrow">Continue learning</p>
      <div className="mt-3 flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${st.tile}`}>{meta.emoji}</span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-ink">{meta.label}</p>
          <p className="text-xs text-ink-3">Last practised {daysAgo(recent.last_active)}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
        <span>{recent.answered} answered</span>
        <span className={`font-semibold ${accTone(recent.accuracy)}`}>{recent.accuracy}% accuracy</span>
      </div>
      <div className="progress-track mt-1.5 h-1.5"><div className={`progress-fill ${st.bar}`} style={{ width: `${recent.accuracy}%` }} /></div>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-brand transition duration-150 group-hover:gap-2.5">Continue <Arrow /></span>
    </Link>
  );
}

// ── Brand-new student ──────────────────────────────────────────────────────
function WelcomeCard() {
  const first = SUBJECTS_WITH_BOARD.find(id => !BOARD_ONLY_SUBJECTS.includes(id)) || SUBJECTS[0].id;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-barca-navy-deep via-barca-navy to-barca-navy-dark p-8 text-white shadow-lift animate-slide-up">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-barca-gold/20 blur-3xl" />
      <div className="relative max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-barca-gold">Welcome to Full Marks</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-white">Start with a Sprint round</h2>
        <p className="mt-2 text-sm text-white/75">
          A Sprint is a quick, timed set of objective questions from past board and prelim papers, checked as you go.
          A few rounds give us enough to show your strengths and the chapters worth revising.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link to={`/${first}/board/sprint`} className="inline-flex items-center gap-2 rounded-xl bg-barca-gold px-5 py-2.5 text-sm font-semibold text-barca-navy-deep shadow-soft transition duration-150 hover:bg-amber-300 active:scale-[0.98]">
            Start a {subjectMeta(first).label} Sprint <Arrow />
          </Link>
          <span className="text-xs text-white/60">or pick any subject below</span>
        </div>
      </div>
    </div>
  );
}

// ── Subject cards ──────────────────────────────────────────────────────────
function SubjectCard({ s, p }) {
  const st = subjectStyle(s.id);
  const started = p && p.answered > 0;
  return (
    <Link to={practicePath(s.id)} className="card card-hover group flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${st.tile}`}>{s.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{s.label}</p>
          <p className="text-xs text-ink-3">{started ? `${p.answered} answered · ${daysAgo(p.last_active)}` : 'Not started'}</p>
        </div>
        {started && <span className={`font-display text-lg font-bold ${accTone(p.accuracy)}`}>{p.accuracy}%</span>}
      </div>
      {started ? (
        <div className="mt-4">
          <div className="progress-track h-1.5"><div className={`progress-fill ${st.bar}`} style={{ width: `${p.accuracy}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-ink-3">Accuracy · {p.correct} of {p.answered} correct</p>
        </div>
      ) : (
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand transition-all duration-150 group-hover:gap-2.5">Start <Arrow /></span>
      )}
    </Link>
  );
}

// ── Strengths vs needs work ────────────────────────────────────────────────
function StrengthsAndGaps({ subjects, revision }) {
  const strengths = subjects
    .flatMap(s => (s.chapters || []).map(c => ({ ...c, subject: s.subject })))
    .filter(c => c.answered >= 5 && c.accuracy >= 75)
    .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)
    .slice(0, 5);
  const gaps = revision.slice(0, 5);

  const Row = ({ c, tone }) => {
    const meta = subjectMeta(c.subject);
    return (
      <div className="flex items-center gap-3 px-1 py-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${subjectStyle(c.subject).tile}`}>{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{c.chapter}</p>
          <p className="text-xs text-ink-3">{meta.label} · {c.answered} answered</p>
        </div>
        <span className={`pill ${tone}`}>{c.accuracy}%</span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="card p-6">
        <p className="eyebrow">Strengths</p>
        <h2 className="section-title mt-1">Chapters you've got</h2>
        {strengths.length ? (
          <ul className="mt-2 divide-y divide-line">{strengths.map(c => <li key={c.subject + c.chapter}><Row c={c} tone="bg-good-soft text-good" /></li>)}</ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">No chapter at 75% or above yet (with at least 5 answers). Your first one will show up here.</p>
        )}
      </section>
      <section className="card p-6">
        <p className="eyebrow">Needs work</p>
        <h2 className="section-title mt-1">Worth revising</h2>
        {gaps.length ? (
          <ul className="mt-2 divide-y divide-line">
            {gaps.map(c => (
              <li key={c.subject + c.chapter}>
                <Link to={BOARD_ONLY_SUBJECTS.includes(c.subject) ? `/${c.subject}/board/sprint` : `/${c.subject}/chapters`} className="block rounded-lg transition duration-150 hover:bg-surface-2">
                  <Row c={c} tone="bg-bad-soft text-bad" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-3">Nothing below 70% with 5 or more answers. Nicely balanced.</p>
        )}
      </section>
    </div>
  );
}

// ── Weekly activity ────────────────────────────────────────────────────────
function WeekCard({ week, improvement }) {
  const { this_week, last_week, answered_this_week, answered_last_week } = improvement;
  const delta = this_week != null && last_week != null ? this_week - last_week : null;
  const empty = !week.some(d => d.answered > 0);
  return (
    <section className="card col-span-2 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Last 7 days</p>
          <h2 className="section-title mt-1">This week</h2>
        </div>
        <div className="text-right text-sm">
          <p className="text-ink-2">
            <span className="font-display text-xl font-bold text-ink">{answered_this_week}</span> answered
            <span className="text-ink-3"> · {answered_last_week} last week</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-3">
            {this_week == null
              ? 'Accuracy shows once you answer this week'
              : <>Accuracy {this_week}%{last_week != null && <> vs {last_week}% last week{' '}
                  <span className={`font-semibold ${delta > 0 ? 'text-good' : delta < 0 ? 'text-bad' : 'text-ink-2'}`}>({delta > 0 ? '+' : ''}{delta})</span></>}
                </>}
          </p>
        </div>
      </div>
      <div className="mt-6">
        {empty ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl bg-surface-2 text-center">
            <p className="text-sm font-medium text-ink-2">No answers in the last 7 days</p>
            <p className="mt-1 text-xs text-ink-3">A short round today starts the chart.</p>
          </div>
        ) : (
          <WeekChart week={week} />
        )}
      </div>
    </section>
  );
}

// ── Badges ─────────────────────────────────────────────────────────────────
function BadgesCard({ badges }) {
  const earned = badges.filter(b => b.earned);
  const nextUp = badges.filter(b => !b.earned).sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0];
  return (
    <section className="card flex flex-col p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Badges</p>
          <h2 className="section-title mt-1">{earned.length} of {badges.length} earned</h2>
        </div>
        <Link to="/progress" className="text-sm font-semibold text-brand transition duration-150 hover:text-brand/80">All</Link>
      </div>
      {earned.length ? (
        <ul className="mt-4 space-y-2">
          {earned.slice(-4).reverse().map(b => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl bg-accent-soft/60 px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm" aria-hidden="true">🏅</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
                <p className="truncate text-xs text-ink-3">{b.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink-3">No badges yet. Keep practising and the first one will land here.</p>
      )}
      {nextUp && (
        <div className="mt-auto pt-4">
          <p className="text-xs text-ink-3">Next: <span className="font-semibold text-ink-2">{nextUp.name}</span> · {nextUp.progress}/{nextUp.goal}</p>
          <div className="progress-track mt-1.5 h-1.5"><div className="progress-fill bg-accent" style={{ width: `${Math.min(100, (nextUp.progress / nextUp.goal) * 100)}%` }} /></div>
        </div>
      )}
    </section>
  );
}

// ── Loading ────────────────────────────────────────────────────────────────
function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your progress">
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className="card p-5"><div className="skeleton h-3 w-20" /><div className="skeleton mt-3 h-8 w-24" /><div className="skeleton mt-3 h-2.5 w-32" /></div>)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="skeleton col-span-2 h-48 rounded-2xl" />
        <div className="card p-6"><div className="skeleton h-3 w-28" /><div className="skeleton mt-4 h-11 w-40" /><div className="skeleton mt-6 h-2 w-full" /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {SUBJECTS.map(s => <div key={s.id} className="card p-5"><div className="flex items-center gap-3"><div className="skeleton h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-28" /><div className="skeleton h-2.5 w-20" /></div></div><div className="skeleton mt-4 h-1.5 w-full" /></div>)}
      </div>
    </div>
  );
}
