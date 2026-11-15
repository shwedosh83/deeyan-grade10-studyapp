// Compact, read-only map of the quiz: one numbered dot per question, coloured by state.
// statuses[i] is one of 'correct' | 'incorrect' | 'answered' | 'pending'.
const DOT = {
  correct: 'bg-good-soft text-good border-good/40',
  incorrect: 'bg-bad-soft text-bad border-bad/40',
  answered: 'bg-brand-soft text-brand-ink border-brand/30',
  pending: 'bg-surface text-ink-3 border-line',
};

export default function QuestionDots({ statuses, current }) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Questions">
      {statuses.map((s, i) => (
        <li
          key={i}
          aria-current={i === current ? 'step' : undefined}
          title={`Question ${i + 1}`}
          className={`flex h-7 min-w-[28px] items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold tabular-nums transition duration-200 ${DOT[s] || DOT.pending} ${
            i === current ? 'ring-2 ring-brand ring-offset-2 ring-offset-canvas' : ''
          }`}
        >
          {i + 1}
        </li>
      ))}
    </ol>
  );
}
