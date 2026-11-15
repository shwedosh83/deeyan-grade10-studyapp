// Circular progress ring for today's question goal. value/goal come straight from useProgress().today.
export default function GoalRing({ value, goal, size = 76, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = goal > 0 && value >= goal;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-2" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className={`${done ? 'stroke-good' : 'stroke-brand'} transition-[stroke-dashoffset] duration-300 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-lg font-bold text-ink">{value}</span>
        <span className="mt-0.5 text-[10px] font-medium text-ink-3">of {goal}</span>
      </div>
    </div>
  );
}
