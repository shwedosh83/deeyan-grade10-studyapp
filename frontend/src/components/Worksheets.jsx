import { useEffect, useState } from 'react';
import { useSubject } from '../context/SubjectContext';

// Printable practice worksheets for a subject (built offline, stored in the public `papers` bucket under worksheets/<subject>/).
const BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/papers/worksheets`;

export default function Worksheets() {
  const { subject } = useSubject();
  const [state, setState] = useState({ loading: true, error: null, list: [] });
  const [open, setOpen] = useState(null);          // worksheet being viewed
  const [showSol, setShowSol] = useState(false);

  useEffect(() => {
    setState({ loading: true, error: null, list: [] }); setOpen(null);
    fetch(`${BASE}/${subject.id}/index.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : r.status === 400 || r.status === 404 ? [] : Promise.reject(new Error(`Request failed (${r.status})`))))
      .then(list => setState({ loading: false, error: null, list }))
      .catch(e => setState({ loading: false, error: e.message, list: [] }));
  }, [subject.id]);

  if (state.loading) return <div className="grid grid-cols-2 gap-4">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>;
  if (state.error) return <div className="card p-6 text-sm text-ink-2">Couldn't load the worksheets: {state.error}</div>;
  if (!state.list.length) return <div className="card p-6 text-sm text-ink-2">No worksheets for {subject.label} yet.</div>;

  if (open) {
    const url = `${BASE}/${subject.id}/${showSol ? open.solutions : open.questions}`;
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => { setOpen(null); setShowSol(false); }} className="text-xs font-semibold text-brand hover:text-brand-ink">← All worksheets</button>
          <div className="flex items-center gap-2">
            {open.solutions && <div className="inline-flex gap-1 rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Questions or solutions">
              <button type="button" role="radio" aria-checked={!showSol} onClick={() => setShowSol(false)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${!showSol ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>Questions</button>
              <button type="button" role="radio" aria-checked={showSol}
                onClick={() => { if (showSol || window.confirm('Show the solutions? Best after you have finished and timed the set.')) setShowSol(true); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition duration-150 ${showSol ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>Solutions</button>
            </div>}
            <a href={url} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-1.5 text-xs">Open / print ↗</a>
          </div>
        </div>
        <div>
          <p className="eyebrow">{open.guide ? 'Study guide' : `Worksheet ${open.no}`}{showSol ? ' · Solutions' : ''}</p>
          <h2 className="section-title">{open.title}</h2>
        </div>
        <div className="card overflow-hidden p-0">
          <iframe key={url} title={`Worksheet ${open.no} ${showSol ? 'solutions' : 'questions'}`} src={`${url}#view=FitH`} className="block h-[calc(100vh-14rem)] min-h-[600px] w-full bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="max-w-3xl text-sm text-ink-2">
        Topic worksheets built from real board papers, the CISCE competency bank and school prelims, plus new practice in the board's current style. Do one set per sitting with a timer, write on paper, then mark yourself from the solutions.
      </p>
      <div className="grid grid-cols-2 gap-4">
        {state.list.map(w => (
          <button key={w.guide ? `g${w.no}` : w.no} onClick={() => { setOpen(w); setShowSol(false); }} className="card card-hover p-5 text-left">
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-bold ${w.guide ? 'bg-accent-soft text-accent' : 'bg-brand-soft text-brand-ink'}`}>{w.guide ? '★' : w.no}</span>
              <span className="pill bg-surface-2 text-ink-2">{w.guide ? 'Study guide' : w.full_paper ? '80 marks · full paper' : `${w.marks} marks`}</span>
            </div>
            <p className="mt-3 font-semibold leading-snug text-ink">{w.title}</p>
            {w.focus && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{w.focus.replace(/\$[^$]*\$/g, '').trim()}</p>}
            {!w.full_paper && !w.guide && w.sets && <p className="mt-2 text-[11px] text-ink-3">{w.sets.map(s => `${s.name.split(' · ')[0]} ${s.marks}`).join(' · ')}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}
