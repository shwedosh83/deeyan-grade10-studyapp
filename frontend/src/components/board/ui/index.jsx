// Small presentational helpers shared by the board-practice screens. No data, no side effects.

// good / warn / bad tone from a 0–100 percentage.
export function toneOf(pct) {
  return pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';
}
export const TONE = {
  good: { text: 'text-good', soft: 'bg-good-soft', border: 'border-good/40', fill: 'bg-good', stroke: 'stroke-good' },
  warn: { text: 'text-warn', soft: 'bg-warn-soft', border: 'border-warn/40', fill: 'bg-warn', stroke: 'stroke-warn' },
  bad: { text: 'text-bad', soft: 'bg-bad-soft', border: 'border-bad/40', fill: 'bg-bad', stroke: 'stroke-bad' },
  brand: { text: 'text-brand-ink', soft: 'bg-brand-soft', border: 'border-brand/30', fill: 'bg-brand', stroke: 'stroke-brand' },
};

export function Spinner({ label }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 animate-fade-in">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
      {label && <p className="text-sm text-ink-3">{label}</p>}
    </div>
  );
}

// Calm inline message. tone: brand | warn | bad | good
export function Notice({ tone = 'brand', title, children, action, className = '' }) {
  const t = TONE[tone];
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${t.border} ${t.soft} px-4 py-3 text-sm animate-fade-in ${className}`}>
      <div className="min-w-0 flex-1">
        {title && <p className={`font-semibold ${t.text}`}>{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-ink-2' : t.text}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

// Error card used where a request (e.g. AI marking) fails. Keeps the layout intact.
export function ErrorCard({ title = 'Something went wrong', message, hint, action }) {
  return (
    <div className="card flex items-start gap-3 p-4 animate-fade-in">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-sm font-bold text-warn">!</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">{title}</p>
        {message && <p className="mt-0.5 break-words text-ink-2">{message}</p>}
        {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// Segmented control. options = [[value, label], ...]
export function Segmented({ value, options, onChange, size = 'md' }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1" role="radiogroup">
      {options.map(([v, label]) => {
        const on = value === v;
        return (
          <button key={v || 'all'} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={`rounded-lg font-semibold transition duration-150 ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${on
              ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink'}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold text-ink">{label}{hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}</p>
      {children}
    </div>
  );
}

// Calm timer pill; turns warn, then bad near the end.
export function TimerPill({ text, state = 'calm', label, big = false }) {
  const cls = state === 'bad' ? 'bg-bad-soft text-bad border-bad/30'
    : state === 'warn' ? 'bg-warn-soft text-warn border-warn/30'
    : state === 'reading' ? 'bg-brand-soft text-brand-ink border-brand/30'
    : 'bg-surface-2 text-ink border-line';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border font-semibold tabular-nums transition-colors duration-300 ${big ? 'px-4 py-2 text-xl' : 'px-3 py-1 text-sm'} ${cls}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={big ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden="true">
        <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" />
      </svg>
      {label && <span className="text-xs font-medium opacity-80">{label}</span>}
      {text}
    </span>
  );
}

export function ProgressBar({ pct, tone = 'brand' }) {
  return (
    <div className="progress-track">
      <div className={`progress-fill ${TONE[tone].fill}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

// Circular percentage ring.
export function Ring({ pct, size = 112, stroke = 10, tone, children }) {
  const t = tone || toneOf(pct);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${TONE[t].stroke} transition-[stroke-dashoffset] duration-700 ease-out`}
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function EmptyCard({ text }) {
  return <div className="card max-w-xl p-8 text-center text-sm text-ink-3">{text}</div>;
}
