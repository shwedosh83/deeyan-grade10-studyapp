import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SUBJECTS } from '../context/SubjectContext';
import { SUBJECTS_WITH_BOARD } from '../lib/board';
import { subjectStyle } from '../lib/subjectStyle';

// Mistake types are worked out by the app from the marking notes; nothing is tagged by hand.
const TYPE_LABEL = { concept: 'Concept / recall', method: 'Method / step missing', units: 'Units / sign', diagram: 'Diagram / labelling',
  reason: 'Reason not given', wording: 'Definition / wording', careless: 'Careless slip', time: 'Not attempted' };
const STATUS = {
  open: { label: 'Open', cls: 'bg-bad-soft text-bad' },
  improving: { label: 'Improving', cls: 'bg-warn-soft text-warn' },
  fixed: { label: 'Fixed', cls: 'bg-good-soft text-good' },
};
const fmt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
const num = v => (Number(v) % 1 ? Number(v).toFixed(1) : String(Number(v)));
const subjectOf = id => SUBJECTS.find(s => s.id === id) || { id, label: id, emoji: '📄' };
const post = body => fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j; });

export default function ErrorLog() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [] });
  const [tab, setTab] = useState('loop');

  const load = () => post({ action: 'errors', userId: user.id })
    .then(d => setState({ loading: false, error: null, rows: d.rows }))
    .catch(e => setState(s => ({ ...s, loading: false, error: e.message })));
  useEffect(() => { if (user?.id) load(); }, [user?.id]); // eslint-disable-line

  const bySubject = useMemo(() => {
    const m = {};
    for (const r of state.rows) {
      const S = (m[r.subject] ||= { subject: r.subject, count: 0, lost: 0, open: 0, improving: 0, fixed: 0, types: {}, chapters: {} });
      S.count++; S.lost += r.lost; S[r.status]++;
      S.types[r.type] = (S.types[r.type] || 0) + 1;
      if (r.status !== 'fixed' && r.chapter) S.chapters[r.chapter] = (S.chapters[r.chapter] || 0) + r.lost;
    }
    return Object.values(m).sort((a, b) => (b.open + b.improving) - (a.open + a.improving) || b.lost - a.lost);
  }, [state.rows]);

  if (state.loading) return <div className="space-y-4"><div className="skeleton h-8 w-56" /><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div>;
  if (state.error) return <div className="card p-6"><p className="text-sm text-ink-2">Couldn't load the error log: {state.error}</p><button onClick={load} className="btn-secondary mt-3">Retry</button></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Learn from every lost mark</p>
          <h1 className="page-title">Error log</h1>
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-soft">
          {[['loop', 'Closing the loop'], ['all', 'All errors']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition duration-150 ${tab === k ? 'bg-brand-soft text-brand-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </header>
      {state.rows.length === 0
        ? <div className="card p-8 text-center text-sm text-ink-2">No lost marks recorded yet. They'll appear here as you practise.</div>
        : tab === 'loop' ? <ClosingTheLoop bySubject={bySubject} rows={state.rows} userId={user.id} /> : <AllErrors bySubject={bySubject} rows={state.rows} />}
    </div>
  );
}

// ── Closing the loop: practice aligned to each subject's open errors ──────────
function ClosingTheLoop({ bySubject, rows, userId }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const active = bySubject.filter(S => S.open + S.improving > 0);

  async function start(subject) {
    setBusy(subject); setErr(null);
    try {
      const d = await post({ action: 'fixit', userId, subject });
      if (!d.quick.length && !d.written.length) { setErr(`No practice questions aligned to your ${subjectOf(subject).label} errors yet.`); setBusy(null); return; }
      sessionStorage.setItem(`fm_fixit_${subject}`, JSON.stringify({ quick: d.quick, written: d.written, at: Date.now() }));
      navigate(`/${subject}/board/fixit`);
    } catch (e) { setErr(e.message); setBusy(null); }
  }

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-ink-2">
        Each set is built from your mistakes that aren't fixed yet. It brings back questions you got wrong (after a few days) and others that test the same idea. Get them right on two different days and the mistake closes by itself.
      </p>
      {err && <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-xs text-warn">{err}</p>}
      {active.length === 0 ? <div className="card p-8 text-center text-sm text-ink-2">Every recorded mistake is fixed. New ones will show up here as you practise.</div> : (
        <div className="grid grid-cols-2 gap-4">
          {active.map(S => {
            const s = subjectOf(S.subject), st = subjectStyle(S.subject);
            const weak = Object.entries(S.chapters).sort((a, b) => b[1] - a[1]).slice(0, 3);
            const total = S.open + S.improving + S.fixed;
            const canRun = SUBJECTS_WITH_BOARD.includes(S.subject);
            return (
              <div key={S.subject} className="card flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${st.tile}`}>{s.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{s.label}</p>
                    <p className="text-xs text-ink-3">{S.open} open · {S.improving} improving · {S.fixed} fixed</p>
                  </div>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="bg-good" style={{ width: `${(100 * S.fixed) / total}%` }} />
                  <div className="bg-warn" style={{ width: `${(100 * S.improving) / total}%` }} />
                  <div className="bg-bad/70" style={{ width: `${(100 * S.open) / total}%` }} />
                </div>
                {weak.length > 0 && (
                  <div className="mt-3 text-xs text-ink-2">
                    <p className="eyebrow mb-1">Where the open mistakes are</p>
                    <ul className="space-y-0.5">{weak.map(([ch, lost]) => <li key={ch} className="flex justify-between gap-3"><span className="truncate">{ch}</span><span className="shrink-0 text-ink-3">{num(lost)} marks</span></li>)}</ul>
                  </div>
                )}
                <div className="mt-auto pt-4">
                  {canRun
                    ? <button onClick={() => start(S.subject)} disabled={!!busy} className="btn-primary w-full">{busy === S.subject ? 'Picking your questions…' : 'Start fix-it set'}</button>
                    : <p className="text-xs text-ink-3">Practice sets need the {s.label} question bank, which isn't in the app yet.</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── All errors: summary by subject + every lost mark ──────────────────────────
function AllErrors({ bySubject, rows: all }) {
  const [subject, setSubject] = useState('all');
  const [show, setShow] = useState('notfixed');
  const [open, setOpen] = useState(null);
  const rows = all.filter(r => (subject === 'all' || r.subject === subject) && (show === 'all' || r.status !== 'fixed'));

  return (
    <div className="space-y-5">
      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2.5 font-semibold">Subject</th><th className="px-3 py-2.5 font-semibold">Mistakes</th><th className="px-3 py-2.5 font-semibold">Marks lost</th>
            {Object.entries(TYPE_LABEL).map(([t, l]) => <th key={t} className="px-2 py-2.5 text-center font-semibold" title={l}>{l.split(' ')[0]}</th>)}
            <th className="px-2 py-2.5 text-center font-semibold">Open</th><th className="px-2 py-2.5 text-center font-semibold">Improving</th><th className="px-4 py-2.5 text-center font-semibold">Fixed</th>
          </tr></thead>
          <tbody>{bySubject.map(S => {
            const s = subjectOf(S.subject);
            return (
              <tr key={S.subject} onClick={() => setSubject(S.subject)} className={`cursor-pointer border-b border-line/60 transition hover:bg-surface-2 ${subject === S.subject ? 'bg-brand-soft/60' : ''}`}>
                <td className="px-4 py-2.5"><span className="flex items-center gap-2 font-medium text-ink"><span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${subjectStyle(S.subject).tile}`}>{s.emoji}</span>{s.label}</span></td>
                <td className="px-3 py-2.5 tabular-nums text-ink-2">{S.count}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-bad">{num(S.lost)}</td>
                {Object.keys(TYPE_LABEL).map(t => <td key={t} className="px-2 py-2.5 text-center tabular-nums text-ink-2">{S.types[t] || <span className="text-ink-3/50">·</span>}</td>)}
                <td className="px-2 py-2.5 text-center tabular-nums text-bad">{S.open}</td>
                <td className="px-2 py-2.5 text-center tabular-nums text-warn">{S.improving}</td>
                <td className="px-4 py-2.5 text-center tabular-nums text-good">{S.fixed}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSubject('all')} className={`chip ${subject === 'all' ? 'chip-on' : ''}`}>All subjects</button>
          {bySubject.map(S => <button key={S.subject} onClick={() => setSubject(S.subject)} className={`chip ${subject === S.subject ? 'chip-on' : ''}`}>{subjectOf(S.subject).emoji} {subjectOf(S.subject).label} · {S.count}</button>)}
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
          {[['notfixed', 'Not fixed yet'], ['all', 'All']].map(([k, l]) => (
            <button key={k} onClick={() => setShow(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${show === k ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Where</th><th className="px-3 py-2.5 font-semibold">Chapter</th>
            <th className="px-3 py-2.5 font-semibold">Question</th><th className="px-3 py-2.5 font-semibold">Lost</th><th className="px-3 py-2.5 font-semibold">Mistake</th><th className="px-4 py-2.5 font-semibold">Status</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-3">Nothing here.</td></tr>}
            {rows.map(r => {
              const key = `${r.source}:${r.ref_id}`, isOpen = open === key, stt = STATUS[r.status];
              return (
                <Fragment key={key}>
                  <tr className={`border-b border-line/60 align-top ${isOpen ? 'bg-surface-2' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-3">{fmt(r.at)}</td>
                    <td className="max-w-[220px] px-3 py-2.5 text-xs text-ink-2">{subjectOf(r.subject).emoji} {r.where}</td>
                    <td className="max-w-[160px] px-3 py-2.5 text-xs text-ink-2">{r.chapter || '—'}</td>
                    <td className="max-w-[340px] px-3 py-2.5">
                      <button onClick={() => setOpen(isOpen ? null : key)} className="text-left text-xs text-ink hover:text-brand">
                        <span className={isOpen ? '' : 'line-clamp-2'}>{r.question || '(question text not available)'}</span>
                        <span className="mt-0.5 block font-semibold text-brand">{isOpen ? 'Hide' : 'See answer'}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-bad">{num(r.lost)}/{num(r.marks)}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-2">{TYPE_LABEL[r.type] || '—'}</td>
                    <td className="px-4 py-2.5"><span className={`pill ${stt.cls}`} title={r.status === 'improving' ? 'Right once since, on a related question' : r.status === 'fixed' ? 'Right on two different days since' : 'Not yet answered right again'}>{stt.label}</span></td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/60 bg-surface-2">
                      <td colSpan={7} className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl bg-surface p-3"><p className="mb-1 font-semibold text-ink-3">Your answer</p><p className="whitespace-pre-wrap text-ink-2">{r.your_answer || '—'}</p></div>
                          <div className="rounded-xl border border-good/30 bg-surface p-3"><p className="mb-1 font-semibold text-good">Correct answer</p><p className="whitespace-pre-wrap text-ink-2">{r.correct || '—'}</p></div>
                        </div>
                        {r.why && <p className="mt-2 text-xs text-ink-2"><b className="text-ink">Why:</b> {r.why}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
