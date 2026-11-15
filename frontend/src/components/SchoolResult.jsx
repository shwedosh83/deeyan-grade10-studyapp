import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { SUBJECTS } from '../context/SubjectContext';
import { boardApi } from '../lib/board';
import { subjectStyle } from '../lib/subjectStyle';

const num = v => (Number(v) % 1 ? Number(v).toFixed(1) : String(Number(v)));
const VERDICT = {
  correct:    { label: 'Full marks', cls: 'bg-good-soft text-good',   bar: 'border-l-good' },
  partial:    { label: 'Part marks', cls: 'bg-warn-soft text-warn',   bar: 'border-l-warn' },
  wrong:      { label: 'Lost marks', cls: 'bg-bad-soft text-bad',     bar: 'border-l-bad' },
  unanswered: { label: 'Not attempted', cls: 'bg-surface-2 text-ink-3', bar: 'border-l-line' },
};

// The marked result of one uploaded class test: score, per-question marking, and what to practise.
export default function SchoolResult() {
  const { id } = useParams();
  const { user } = useAuth();
  const { refresh } = useProgress();
  const [state, setState] = useState({ loading: true, error: null, upload: null });
  const [filter, setFilter] = useState('lost');

  useEffect(() => {
    if (!user?.id) return;
    boardApi('classwork', { action: 'get', userId: user.id, id })
      .then(d => { setState({ loading: false, error: null, upload: d.upload }); refresh(); })
      .catch(e => setState({ loading: false, error: e.message, upload: null }));
  }, [id, user?.id]); // eslint-disable-line

  if (state.loading) return <div className="space-y-4"><div className="skeleton h-8 w-64" /><div className="skeleton h-40 w-full rounded-2xl" /><div className="skeleton h-64 w-full rounded-2xl" /></div>;
  if (state.error || !state.upload) return <div className="card p-6"><p className="text-sm text-ink-2">Couldn't load this result: {state.error || 'not found'}.</p><Link to="/school" className="btn-secondary mt-3">Back to school tests</Link></div>;

  const u = state.upload, ev = u.evaluation;
  const subject = SUBJECTS.find(s => s.id === u.subject) || { id: u.subject, label: u.subject, emoji: '📄' };
  const st = subjectStyle(u.subject);
  if (u.status !== 'processed' || !ev) return <div className="card p-6"><p className="text-sm text-ink-2">This paper hasn't been marked yet.</p><Link to="/school" className="btn-primary mt-3">Go to school tests</Link></div>;

  const qs = ev.questions || [];
  const lost = qs.filter(q => q.got < q.marks);
  const shown = filter === 'lost' ? lost : qs;
  const teacherTotal = qs.every(q => q.teacher_marks !== null && q.teacher_marks !== undefined) ? qs.reduce((s, q) => s + q.teacher_marks, 0) : null;
  const pct = ev.total?.pct ?? 0;
  const ring = pct >= 75 ? 'text-good' : pct >= 50 ? 'text-warn' : 'text-bad';

  return (
    <div className="space-y-6 animate-fade-in">
      <Link to="/school" className="text-xs font-semibold text-brand hover:text-brand-ink">← School tests</Link>

      <section className="card grid grid-cols-3 gap-6 p-6">
        <div className="col-span-2">
          <p className="flex items-center gap-2 text-sm text-ink-3"><span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${st.tile}`}>{subject.emoji}</span>{subject.label}</p>
          <h1 className="page-title mt-1">{u.title || ev.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{ev.summary}</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {ev.strengths?.length > 0 && <div><p className="eyebrow text-good">Done well</p><ul className="mt-1 space-y-1 text-sm text-ink-2">{ev.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>}
            {ev.focus?.length > 0 && <div><p className="eyebrow text-warn">Practise next</p><ul className="mt-1 space-y-1 text-sm text-ink-2">{ev.focus.map((s, i) => <li key={i}>• {s}</li>)}</ul></div>}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-2xl bg-surface-2 p-5 text-center">
          <p className={`font-display text-5xl font-extrabold ${ring}`}>{num(ev.total.got)}<span className="text-2xl text-ink-3">/{num(ev.total.marks)}</span></p>
          <p className="mt-1 text-sm font-semibold text-ink-2">{pct}%</p>
          {teacherTotal !== null && <p className="mt-2 text-xs text-ink-3">Teacher's marks on the sheet: {num(teacherTotal)}/{num(ev.total.marks)}</p>}
          <p className="mt-3 text-xs text-ink-3">{qs.length} questions marked · {lost.length} lost marks</p>
          <Link to={`/${u.subject}/board/school`} className="btn-primary mt-4 w-full px-3 py-2 text-xs">Practise these questions</Link>
        </div>
      </section>

      {ev.skipped?.length > 0 && (
        <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-xs text-warn">Not marked: {ev.skipped.map(s => `${s.label} (${s.reason})`).join('; ')}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="section-title">Question by question</h2>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
          {[['lost', `Lost marks (${lost.length})`], ['all', `All (${qs.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${filter === k ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 && <div className="card p-6 text-center text-sm text-ink-2">Full marks on every question. Nothing to fix here.</div>}
      <div className="space-y-4">{shown.map(q => <QuestionResult key={q.label} q={q} />)}</div>
    </div>
  );
}

function QuestionResult({ q }) {
  const v = VERDICT[q.verdict] || VERDICT.wrong;
  const code = q.type === 'program';
  return (
    <article className={`card border-l-4 p-5 ${v.bar}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-brand-soft text-brand-ink">{q.label}</span>
            <span className={`pill ${v.cls}`}>{v.label}</span>
            <span className="text-xs text-ink-3">{q.chapter}{q.topic ? ` · ${q.topic}` : ''}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-ink">{q.question}</p>
          {q.options?.length > 0 && <ul className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-ink-2">{q.options.map(o => (
            <li key={o.key} className={`rounded-lg px-2.5 py-1.5 ${o.key === q.correct_option ? 'bg-good-soft text-good' : 'bg-surface-2'}`}>({o.key}) {o.text}</li>
          ))}</ul>}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-xl font-bold text-ink">{num(q.got)}<span className="text-sm text-ink-3">/{num(q.marks)}</span></p>
          {q.teacher_marks !== null && q.teacher_marks !== undefined && <p className="text-[11px] text-ink-3">teacher: {num(q.teacher_marks)}</p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="mb-1 font-semibold text-ink-3">Your answer</p>
          <p className={`whitespace-pre-wrap text-ink-2 ${code ? 'font-mono' : ''}`}>{q.student_answer || '(not attempted)'}</p>
        </div>
        <div className="rounded-xl border border-good/30 bg-surface-2 p-3">
          <p className="mb-1 font-semibold text-good">Model answer</p>
          <p className={`whitespace-pre-wrap text-ink-2 ${code ? 'font-mono' : ''}`}>{q.model_answer}</p>
        </div>
      </div>

      {q.feedback && <p className="mt-3 text-sm text-ink-2">{q.feedback}</p>}
      {q.marking_points?.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold text-brand hover:text-brand-ink">How the marks are given</summary>
          <ul className="mt-2 space-y-1 text-ink-2">{q.marking_points.map((m, i) => <li key={i} className="flex justify-between gap-4"><span>{m.point}</span><span className="shrink-0 text-ink-3">{num(m.marks)}</span></li>)}</ul>
        </details>
      )}
    </article>
  );
}
