// One colour identity per subject, used for tiles, progress bars and accents across the app.
// Full class strings are listed (not built) so Tailwind keeps them in the production CSS.
export const SUBJECT_STYLE = {
  biology:            { tile: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', bar: 'bg-emerald-500', ring: 'ring-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-300', grad: 'from-emerald-500 to-teal-500' },
  history_civics:     { tile: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',         bar: 'bg-amber-500',   ring: 'ring-amber-500/30',   text: 'text-amber-600 dark:text-amber-300',   grad: 'from-amber-500 to-orange-500' },
  chemistry:          { tile: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',                 bar: 'bg-sky-500',     ring: 'ring-sky-500/30',     text: 'text-sky-600 dark:text-sky-300',       grad: 'from-sky-500 to-blue-600' },
  geography:          { tile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',     bar: 'bg-violet-500',  ring: 'ring-violet-500/30',  text: 'text-violet-600 dark:text-violet-300', grad: 'from-violet-500 to-purple-600' },
  physics:            { tile: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',     bar: 'bg-orange-500',  ring: 'ring-orange-500/30',  text: 'text-orange-600 dark:text-orange-300', grad: 'from-orange-500 to-rose-500' },
  maths:              { tile: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',     bar: 'bg-indigo-500',  ring: 'ring-indigo-500/30',  text: 'text-indigo-600 dark:text-indigo-300', grad: 'from-indigo-500 to-blue-600' },
  computer_applications: { tile: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300', bar: 'bg-fuchsia-500', ring: 'ring-fuchsia-500/30', text: 'text-fuchsia-600 dark:text-fuchsia-300', grad: 'from-fuchsia-500 to-purple-600' },
  english_literature: { tile: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',             bar: 'bg-rose-500',    ring: 'ring-rose-500/30',    text: 'text-rose-600 dark:text-rose-300',     grad: 'from-rose-500 to-pink-600' },
};
const FALLBACK = { tile: 'bg-surface-2 text-ink-2', bar: 'bg-brand', ring: 'ring-brand/30', text: 'text-brand', grad: 'from-brand to-barca-navy' };
export const subjectStyle = id => SUBJECT_STYLE[id] || FALLBACK;
