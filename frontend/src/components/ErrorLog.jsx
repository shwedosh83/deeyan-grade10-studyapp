import { Fragment, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { SUBJECTS } from '../context/SubjectContext';
import { subjectStyle } from '../lib/subjectStyle';

const TYPE_LABEL = { careless: 'Careless slip', concept: 'Concept gap', method: 'Method / step missing', units: 'Units / sign', diagram: 'Diagram / labelling',
  reason: 'No reason given', wording: 'Definition / wording', time: 'Ran out of time', other: 'Other' };
const SOURCE_LABEL = { quiz: 'Chapter quiz', board: 'Board practice', classwork: 'School test' };
const DAY = 86400000;
const fmt = d => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
const num = v => (Number(v) % 1 ? Number(v).toFixed(1) : String(Number(v)));
const subjectOf = id => SUBJECTS.find(s => s.id === id) || { id, label: id, emoji: '📄' };
const post = body => fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`); return j; });

// Every lost mark across subjects, with the student's own mistake type and 3-day / 10-day redo ticks.
export default function ErrorLog() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, rows: [], tagging: true });
  const [subject, setSubject] = useState('all');
  const [show, setShow] = useState('all');        // all | redo | untagged
  const [open, setOpen] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  const load = () => post({ action: 'errors', userId: user.id })
    .then(d => setState({ loading: false, error: null, rows: d.rows, tagging: d.tagging }))
    .catch(e => setState(s => ({ ...s, loading: false, error: e.message })));
  useEffect(() => { if (user?.id) load(); }, [user?.id]); // eslint-disable-line

  const now = Date.now();
  const due = r => {
    const t = new Date(r.at).getTime();
    if (!r.redo_1 && now >= t + 3 * DAY) return 1;
    if (r.redo_1 && !r.redo_2 && now >= t + 10 * DAY) return 2;
    return 0;
  };

  async function update(r, patch) {
    const next = { ...r, ...patch };
    setState(s => ({ ...s, rows: s.rows.map(x => (x.source === r.source && x.ref_id === r.ref_id ? next : x)) }));
    setSaveErr(null);
    try { await post({ action: 'errors_tag', userId: user.id, source: r.source, ref_id: r.ref_id, loss_type: next.loss_type, note: next.note, redo_1: next.redo_1, redo_2: next.redo_2 }); }
    catch (e) { setSaveErr(e.message === 'setup' ? 'Tags can be saved once the one-time database setup is done.' : `Couldn't save: ${e.message}`); }
  }

  const bySubject = useMemo(() => {
    const m = {};
    for (const r of state.rows) {
      const S = (m[r.subject] ||= { subject: r.subject, count: 0, lost: 0, untagged: 0, toRedo: 0, types: {} });
      S.count++; S.lost += r.lost;
      if (!r.loss_type) S.untagged++; else S.types[r.loss_type] = (S.types[r.loss_type] || 0) + 1;
      if (due(r)) S.toRedo++;
    }
    return Object.values(m).sort((a, b) => b.lost - a.lost);
  }, [state.rows]); // eslint-disable-line

  const rows = state.rows.filter(r => (subject === 'all' || r.subject === subject) && (show === 'all' || (show === 'redo' ? due(r) : !r.loss_type)));

  if (state.loading) return <div className="space-y-4"><div className="skeleton h-8 w-56" /><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-72 rounded-2xl" /></div>;
  if (state.error) return <div className="card p-6"><p className="text-sm text-ink-2">Couldn't load the error log: {state.error}</p><button onClick={load} className="btn-secondary mt-3">Retry</button></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="eyebrow">Learn from every lost mark</p>
        <h1 className="page-title">Error log</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">Every mark lost in chapter quizzes, board-paper practice and marked school tests, gathered in one place. Tag each one with the kind of mistake, redo it after 3 days and again after 10, and the pattern shows you what to fix first.</p>
      </header>
      {!state.tagging && <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-xs text-warn">You can see every lost mark now. Tagging and redo ticks will save once a one-time database setup is done.</p>}
      {saveErr && <p className="rounded-xl bg-bad-soft px-4 py-2.5 text-xs text-bad">{saveErr}</p>}

      {state.rows.length === 0 ? <div className="card p-8 text-center text-sm text-ink-2">No lost marks recorded yet. They'll appear here as you practise.</div> : (<>
      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2.5 font-semibold">Subject</th><th className="px-3 py-2.5 font-semibold">Questions</th><th className="px-3 py-2.5 font-semibold">Marks lost</th>
            {Object.keys(TYPE_LABEL).map(t => <th key={t} className="px-2 py-2.5 text-center font-semibold" title={TYPE_LABEL[t]}>{TYPE_LABEL[t].split(' ')[0]}</th>)}
            <th className="px-3 py-2.5 font-semibold">Untagged</th><th className="px-4 py-2.5 font-semibold">To redo</th>
          </tr></thead>
          <tbody>{bySubject.map(S => {
            const s = subjectOf(S.subject);
            return (
              <tr key={S.subject} onClick={() => setSubject(S.subject)} className={`cursor-pointer border-b border-line/60 transition hover:bg-surface-2 ${subject === S.subject ? 'bg-brand-soft/60' : ''}`}>
                <td className="px-4 py-2.5"><span className="flex items-center gap-2 font-medium text-ink"><span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${subjectStyle(S.subject).tile}`}>{s.emoji}</span>{s.label}</span></td>
                <td className="px-3 py-2.5 tabular-nums text-ink-2">{S.count}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums text-bad">{num(S.lost)}</td>
                {Object.keys(TYPE_LABEL).map(t => <td key={t} className="px-2 py-2.5 text-center tabular-nums text-ink-2">{S.types[t] || <span className="text-ink-3/50">·</span>}</td>)}
                <td className="px-3 py-2.5 tabular-nums text-ink-3">{S.untagged}</td>
                <td className="px-4 py-2.5 tabular-nums">{S.toRedo ? <span className="pill bg-warn-soft text-warn">{S.toRedo}</span> : <span className="text-ink-3">0</span>}</td>
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
          {[['all', 'All'], ['redo', 'Due to redo'], ['untagged', 'Untagged']].map(([k, l]) => (
            <button key={k} onClick={() => setShow(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${show === k ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-4 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Where</th><th className="px-3 py-2.5 font-semibold">Chapter</th>
            <th className="px-3 py-2.5 font-semibold">Question</th><th className="px-3 py-2.5 font-semibold">Lost</th><th className="px-3 py-2.5 font-semibold">Mistake type</th>
            <th className="px-2 py-2.5 text-center font-semibold" title="Redo after 3 days">Redo 3d</th><th className="px-4 py-2.5 text-center font-semibold" title="Redo after 10 days">Redo 10d</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-ink-3">Nothing here.</td></tr>}
            {rows.map(r => {
              const key = `${r.source}:${r.ref_id}`, isOpen = open === key, d = due(r), t = new Date(r.at).getTime();
              return (
                <Fragment key={key}>
                  <tr className={`border-b border-line/60 align-top ${isOpen ? 'bg-surface-2' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-3">{fmt(r.at)}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-2"><span className="font-medium text-ink">{subjectOf(r.subject).emoji}</span> {r.where}</td>
                    <td className="max-w-[160px] px-3 py-2.5 text-xs text-ink-2">{r.chapter || '—'}</td>
                    <td className="max-w-[340px] px-3 py-2.5">
                      <button onClick={() => setOpen(isOpen ? null : key)} className="text-left text-xs text-ink hover:text-brand">
                        <span className={isOpen ? '' : 'line-clamp-2'}>{r.question || '(question text not available)'}</span>
                        <span className="mt-0.5 block font-semibold text-brand">{isOpen ? 'Hide' : 'See answer'}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-bad">{num(r.lost)}/{num(r.marks)}</td>
                    <td className="px-3 py-2.5">
                      <select value={r.loss_type || ''} onChange={e => update(r, { loss_type: e.target.value || null })} className="input !w-40 !py-1.5 !text-xs">
                        <option value="">Tag it…</option>
                        {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <label className="flex flex-col items-center gap-0.5 text-[10px] text-ink-3">
                        <input type="checkbox" checked={r.redo_1} onChange={e => update(r, { redo_1: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                        <span className={d === 1 ? 'font-semibold text-warn' : ''}>{fmt(t + 3 * DAY)}</span>
                      </label>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <label className="flex flex-col items-center gap-0.5 text-[10px] text-ink-3">
                        <input type="checkbox" checked={r.redo_2} onChange={e => update(r, { redo_2: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                        <span className={d === 2 ? 'font-semibold text-warn' : ''}>{fmt(t + 10 * DAY)}</span>
                      </label>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-line/60 bg-surface-2">
                      <td colSpan={8} className="px-4 pb-4">
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl bg-surface p-3"><p className="mb-1 font-semibold text-ink-3">Your answer</p><p className="whitespace-pre-wrap text-ink-2">{r.your_answer || '—'}</p></div>
                          <div className="rounded-xl border border-good/30 bg-surface p-3"><p className="mb-1 font-semibold text-good">Correct answer</p><p className="whitespace-pre-wrap text-ink-2">{r.correct || '—'}</p></div>
                        </div>
                        {r.why && <p className="mt-2 text-xs text-ink-2"><b className="text-ink">Why:</b> {r.why}</p>}
                        <input defaultValue={r.note || ''} onBlur={e => e.target.value !== (r.note || '') && update(r, { note: e.target.value })}
                          placeholder="Your note: what will you do differently next time?" className="input mt-2 !text-xs" />
                        <p className="mt-1 text-[11px] text-ink-3">{SOURCE_LABEL[r.source]}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
      </>)}
    </div>
  );
}
