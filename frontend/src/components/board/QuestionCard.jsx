import { useRef } from 'react';
import { fmtMarks, getItems, isMCQ, parseItems, correctKeys, KIND_LABELS, MATH_KEYS } from '../../lib/board';

// One-tap symbol buttons for typing maths answers (√, ², ³, …).
// onMouseDown preventDefault keeps the focus (and caret) in the input being edited.
function MathStrip({ onInsert }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <span className="text-xs text-gray-400 mr-1">Insert:</span>
      {MATH_KEYS.map(k => (
        <button key={k} type="button" tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => onInsert(k)}
          className="w-9 h-8 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-700 text-base leading-none">
          {k}
        </button>
      ))}
    </div>
  );
}

// One question row: badges, figure, text, and the right input (options / blanks / written answer).
// `reveal` (Sprint) = { itemFlags?: boolean[] } to colour the options / blanks after checking.
export default function QuestionCard({ q, value, onChange = () => {}, disabled = false, reveal = null, compact = false, questionOnly = false }) {
  const items = getItems(q);
  const mcq = isMCQ(q);
  const keys = reveal ? correctKeys(q) : [];

  // Math strip: insert a symbol at the caret of the input last focused (blank i, or the textarea).
  const inputRefs = useRef({});
  const activeKey = useRef(null);
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
    <div className={`bg-white rounded-xl border border-gray-200 ${compact ? 'p-4' : 'p-5'} space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-barca-navy bg-barca-navy-light px-2 py-0.5 rounded">{q.q_label}</span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
          {fmtMarks(q.marks)} mark{Number(q.marks) !== 1 ? 's' : ''}
        </span>
        {q.mandatory === 'choice' && (
          <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">Choice question</span>
        )}
        {q.applied && q.applied_kind && (
          <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full font-medium">{KIND_LABELS[q.applied_kind] || 'Applied'}</span>
        )}
        {q.chapter && <span className="text-xs text-gray-400 truncate max-w-[16rem]">{q.chapter}</span>}
      </div>

      {q.needs_figure && q.figure_url && (
        <div>
          <p className="text-xs text-gray-400 mb-1">Figure (page from the original paper) — this page may show other questions too</p>
          <a href={q.figure_url} target="_blank" rel="noreferrer">
            <img src={q.figure_url} alt={`Figure for ${q.q_label}`} className="w-full max-w-2xl rounded-lg border border-gray-200" loading="lazy" />
          </a>
        </div>
      )}
      {q.needs_figure && !q.figure_url && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          The figure for this question isn't available in the app. {q.figure_desc ? <>It shows: <em>{q.figure_desc}</em></> : 'Use your own paper copy if you have it.'}
        </div>
      )}

      <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-[15px]">{q.question}</p>

      {questionOnly && mcq && (
        <ul className="space-y-1 text-sm text-gray-700">{Object.entries(q.options).map(([k, text]) => <li key={k}><b className="uppercase">{k})</b> {String(text)}</li>)}</ul>
      )}
      {questionOnly && items.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-gray-700">{items.map((it, i) => <li key={i}>{it.prompt}</li>)}</ul>
      )}

      {!questionOnly && mcq && (
        <div className="space-y-2">
          {Object.entries(q.options).map(([k, text]) => {
            const picked = value === k;
            let style = picked ? 'border-barca-navy bg-barca-navy-light text-barca-navy' : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700';
            if (reveal) {
              if (keys.includes(k)) style = 'border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold';
              else if (picked) style = 'border-red-400 bg-red-50 text-red-700';
              else style = 'border-gray-200 bg-white text-gray-400';
            }
            return (
              <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)}
                className={`w-full text-left px-4 py-2.5 rounded-lg border-2 text-sm flex gap-3 transition-colors ${style} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}>
                <span className="font-bold uppercase shrink-0">{k})</span><span>{String(text)}</span>
              </button>
            );
          })}
        </div>
      )}

      {showStrip && items.length > 0 && <MathStrip onInsert={insertSym} />}
      {!questionOnly && items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => {
            const vals = parseItems(value, items.length);
            const flag = reveal?.itemFlags?.[i];
            return (
              <div key={i} className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600 flex-1 min-w-[10rem]">{it.prompt}</label>
                <input
                  value={vals[i]} disabled={disabled}
                  ref={el => { inputRefs.current[i] = el; }} onFocus={() => { activeKey.current = i; }}
                  onChange={e => { const next = [...vals]; next[i] = e.target.value; onChange(JSON.stringify(next)); }}
                  className={`border-2 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-barca-navy ${
                    flag === true ? 'border-emerald-400 bg-emerald-50' : flag === false ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
                {reveal && flag === false && q.answer_items?.[i] && (
                  <span className="text-xs text-emerald-700">→ {q.answer_items[i].accepted[0]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showStrip && items.length === 0 && <MathStrip onInsert={insertSym} />}
      {!questionOnly && !mcq && items.length === 0 && (
        <textarea
          value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}
          ref={el => { inputRefs.current.text = el; }} onFocus={() => { activeKey.current = 'text'; }}
          rows={Math.min(12, Math.max(3, Math.round(Number(q.marks) * 1.5)))}
          placeholder={q.type === 'program' ? 'Write your program here…' : q.type === 'map_work' ? 'Describe where you would mark/shade it (you will self-mark these)…' : 'Write your answer here…'}
          className="w-full border-2 border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-700 focus:outline-none focus:border-barca-navy resize-y disabled:bg-gray-50 font-[inherit]"
        />
      )}
    </div>
  );
}
