// Shared accuracy colour bands for the progress screens.
// ≥75 good, 50–74 warn, <50 bad; fewer than MIN_ANSWERS answers is "not enough data".
export const MIN_ANSWERS = 5;

export function band(accuracy, answered = MIN_ANSWERS) {
  if (accuracy === null || accuracy === undefined || answered < MIN_ANSWERS) return 'none';
  if (accuracy >= 75) return 'good';
  if (accuracy >= 50) return 'warn';
  return 'bad';
}

// Full class strings (not built) so Tailwind keeps them.
export const BAND = {
  good: { text: 'text-good', bar: 'bg-good', soft: 'bg-good-soft', tile: 'bg-good-soft text-good border-good/25', dot: 'bg-good' },
  warn: { text: 'text-warn', bar: 'bg-warn', soft: 'bg-warn-soft', tile: 'bg-warn-soft text-warn border-warn/25', dot: 'bg-warn' },
  bad:  { text: 'text-bad',  bar: 'bg-bad',  soft: 'bg-bad-soft',  tile: 'bg-bad-soft text-bad border-bad/25',     dot: 'bg-bad' },
  none: { text: 'text-ink-3', bar: 'bg-ink-3/40', soft: 'bg-surface-2', tile: 'bg-surface-2 text-ink-3 border-line', dot: 'bg-ink-3/40' },
};

export const bandOf = (accuracy, answered) => BAND[band(accuracy, answered)];
