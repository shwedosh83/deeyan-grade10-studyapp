// Seven plain bars (oldest → today) of questions answered per day, from useProgress().week.
export default function WeekChart({ week }) {
  const max = Math.max(1, ...week.map(d => d.answered));
  const lastIdx = week.length - 1;
  return (
    <div className="flex h-40 items-end gap-3" role="img" aria-label="Questions answered on each of the last 7 days">
      {week.map((d, i) => {
        const day = new Date(`${d.date}T00:00:00`);
        const label = i === lastIdx ? 'Today' : day.toLocaleDateString('en-IN', { weekday: 'short' });
        const h = d.answered > 0 ? Math.max(6, Math.round((d.answered / max) * 100)) : 0;
        const acc = d.answered > 0 ? Math.round((d.correct / d.answered) * 100) : null;
        return (
          <div key={d.date} className="group flex h-full flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full flex-1 items-end justify-center">
              <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-canvas opacity-0 transition duration-150 group-hover:opacity-100">
                {d.answered} answered{acc !== null ? ` · ${acc}%` : ''}{d.minutes ? ` · ${d.minutes} min` : ''}
              </span>
              {h > 0 ? (
                <div
                  className={`w-full max-w-[36px] rounded-t-lg transition-[height] duration-300 ease-out ${i === lastIdx ? 'bg-brand' : 'bg-brand/35 group-hover:bg-brand/55'}`}
                  style={{ height: `${h}%` }}
                />
              ) : (
                <div className="h-1 w-full max-w-[36px] rounded-full bg-surface-2" />
              )}
            </div>
            <span className={`text-[11px] font-medium ${i === lastIdx ? 'text-ink' : 'text-ink-3'}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
