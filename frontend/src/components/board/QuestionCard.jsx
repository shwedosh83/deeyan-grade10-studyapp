import { lazy, Suspense, useRef } from 'react';
const CodeEditor = lazy(() => import('./CodeEditor'));
import { fmtMarks, getItems, isMCQ, parseItems, correctKeys, KIND_LABELS, MATH_KEYS } from '../../lib/board';

// One-tap symbol buttons for typing maths answers (√, ², ³, …).
// onMouseDown preventDefault keeps the focus (and caret) in the input being edited.
function MathStrip({ onInsert }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <span className="mr-1 text-xs text-ink-3">Insert:</span>
      {MATH_KEYS.map(k => (
        <button key={k} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => onInsert(k)}
          className="h-8 w-9 rounded-lg border border-line bg-surface-2 text-base leading-none text-ink-2 transition duration-150 hover:border-brand/40 hover:text-ink active:scale-95">
          {k}
        </button>
      ))}
    </div>
  );
}

// One question row: badges, figure, text, and the right input (options / blanks / written answer).
// `reveal` (Sprint) = { itemFlags?: boolean[] } to colour the options / blanks after checking.
// `tag` (optional) = source caption shown as a pill, e.g. "2024 board paper" / "School prelim".
export default function QuestionCard({ q, value, onChange = () => {}, disabled = false, reveal = null, compact = false, questionOnly = false, tag = null }) {
  const items = getItems(q);
  const mcq = isMCQ(q);
  const keys = reveal ? correctKeys(q) : [];

  // Math strip: insert a symbol at the caret of the input last focused (blank i, or the textarea).
  const inputRefs = useRef({});
  const activeKey = useRef(null);
  const code = q.type === 'program' || q.applied_kind === 'program';   // Java answers: monospace, no spell-check
  const showStrip = q.subject === 'maths' && !questionOnly && !disabled && !mcq;
  function insertSym(sym) {
    const key = activeKey.current ?? (items.length ? 0 : 'text');
    const el = inputRefs.current[key];
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
    const next = el.value.slice(0, start) + sym + el.value.slice(end);
    if (key === 'text') onChange(next);
    else { const vals = parseItems(value, items.length); vals[key] = next; onChange(JSON.stringify(vals)); }
    requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(start + sym.length, start + sym.length); } catch { /* number inputs */ } });
  }

  return (
    <div className={`card ${compact ? 'p-5' : 'p-6'} space-y-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill bg-brand text-white dark:text-slate-950">{q.q_label}</span>
        <span className="pill bg-accent-soft text-accent">
          {fmtMarks(q.marks)} mark{Number(q.marks) !== 1 ? 's' : ''}
        </span>
        {tag && <span className={`pill ${q.source === 'prelim' ? 'bg-brand-soft text-brand-ink' : 'bg-surface-2 text-ink-2'}`}>{tag}</span>}
        {q.mandatory === 'choice' && (
          <span className="pill bg-warn-soft text-warn">Choice question</span>
        )}
        {q.applied && q.applied_kind && (
          <span className="pill bg-brand-soft text-brand-ink">{KIND_LABELS[q.applied_kind] || 'Applied'}</span>
        )}
        {q.chapter && <span className="max-w-[16rem] truncate text-xs text-ink-3">{q.chapter}</span>}
      </div>

      {q.needs_figure && q.figure_url && (
        <div>
          <p className="mb-1.5 text-xs text-ink-3">Figure (page from the original paper) — this page may show other questions too</p>
          <a href={q.figure_url} target="_blank" rel="noreferrer" className="block w-full max-w-2xl rounded-xl border border-line bg-white p-2 transition duration-150 hover:shadow-lift">
            <img src={q.figure_url} alt={`Figure for ${q.q_label}`} className="w-full rounded-lg" loading="lazy" />
          </a>
        </div>
      )}
      {q.needs_figure && !q.figure_url && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-ink-2">
          The figure for this question isn't available in the app. {q.figure_desc ? <>It shows: <em>{q.figure_desc}</em></> : 'Use your own paper copy if you have it.'}
        </div>
      )}

      <p className={`whitespace-pre-wrap leading-relaxed text-ink ${compact ? 'text-[15px]' : 'text-base'}`}>{q.question}</p>

      {questionOnly && mcq && (
        <ul className="space-y-1.5 text-sm text-ink-2">{Object.entries(q.options).map(([k, text]) => <li key={k} className="flex gap-2.5"><b className="w-5 shrink-0 uppercase text-ink-3">{k})</b><span>{String(text)}</span></li>)}</ul>
      )}
      {questionOnly && items.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{items.map((it, i) => <li key={i}>{it.prompt}</li>)}</ul>
      )}

      {!questionOnly && mcq && (
        <div className="space-y-2">
          {Object.entries(q.options).map(([k, text]) => {
            const picked = value === k;
            let style = picked ? 'border-brand bg-brand-soft text-brand-ink shadow-glow' : 'border-line bg-surface hover:border-brand/40 hover:bg-surface-2 text-ink';
            let badge = picked ? 'bg-brand text-white dark:text-slate-950' : 'bg-surface-2 text-ink-2';
            let anim = '';
            if (reveal) {
              if (keys.includes(k)) { style = 'border-good bg-good-soft text-ink font-semibold'; badge = 'bg-good text-white dark:text-slate-950'; anim = 'animate-pop'; }
              else if (picked) { style = 'border-bad bg-bad-soft text-ink'; badge = 'bg-bad text-white dark:text-slate-950'; anim = 'animate-shake'; }
              else { style = 'border-line bg-surface text-ink-3'; badge = 'bg-surface-2 text-ink-3'; }
            }
            return (
              <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)}
                className={`flex w-full items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left text-[15px] transition duration-150 ${style} ${anim} ${disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase transition-colors duration-150 ${badge}`}>{k}</span><span>{String(text)}</span>
              </button>
            );
          })}
        </div>
      )}

      {showStrip && items.length > 0 && <MathStrip onInsert={insertSym} />}
      {!questionOnly && items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((it, i) => {
            const vals = parseItems(value, items.length);
            const flag = reveal?.itemFlags?.[i];
            return (
              <div key={i} className="flex items-center gap-3 flex-wrap">
                <label className="min-w-[10rem] flex-1 text-sm text-ink-2">{it.prompt}</label>
                <input
                  value={vals[i]} disabled={disabled}
                  ref={el => { inputRefs.current[i] = el; }} onFocus={() => { activeKey.current = i; }}
                  onChange={e => { const next = [...vals]; next[i] = e.target.value; onChange(JSON.stringify(next)); }}
                  className={`input !w-56 disabled:opacity-90 ${
                    flag === true ? '!border-good !bg-good-soft animate-pop' : flag === false ? '!border-bad !bg-bad-soft animate-shake' : ''}`}
                />
                {reveal && flag === false && q.answer_items?.[i] && (
                  <span className="pill bg-good-soft text-good">→ {q.answer_items[i].accepted[0]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showStrip && items.length === 0 && <MathStrip onInsert={insertSym} />}
      {!questionOnly && !mcq && items.length === 0 && code && (
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-[#1c2333]" />}>
          <CodeEditor value={value || ''} onChange={onChange} disabled={disabled} />
        </Suspense>
      )}
      {!questionOnly && !mcq && items.length === 0 && !code && (
        <textarea
          value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}
          ref={el => { inputRefs.current.text = el; }} onFocus={() => { activeKey.current = 'text'; }}
          rows={code ? 16 : Math.min(12, Math.max(3, Math.round(Number(q.marks) * 1.5)))}
          spellCheck={!code}
          placeholder={code ? 'Write your program here…' : q.type === 'map_work' ? 'Describe where you would mark/shade it (you will self-mark these)…' : 'Write your answer here…'}
          className={`input resize-y px-4 py-3 leading-relaxed disabled:bg-surface-2 ${code ? 'font-mono text-[13px]' : 'font-[inherit]'}`}
        />
      )}
    </div>
  );
}
