# Full Marks — design system

Full Marks is an ICSE Class 10 study app for one student. It should look calm, premium and focused, like Linear or Duolingo's grown-up web screens. It must never look childish. The layout is desktop-first; mobile is out of scope.

## Rules that are never broken

1. **Never invent data.** Every number, badge, level, streak and percentage shown must come from `useProgress()` or from data the screen already loads. If something is unknown, show an empty state ("No answers yet — try a Sprint round"), not a placeholder number.
2. **Preserve all existing behaviour.** Restyle markup and classes only. Keep every handler, every API call, every piece of state, every route, every button, every keyboard shortcut and the free navigation between questions. If you are unsure whether a change alters behaviour, don't make it.
3. **Hide difficulty letters (A–D) from the student.** Board difficulty numbers 1–5 may be shown only where they are already shown.
4. **Use semantic tokens so dark mode works.** Don't use `bg-white`, `text-gray-*`, `border-gray-*`, `bg-gray-*` or `text-black`. Map them as follows:
   - `bg-white` → `bg-surface`
   - `bg-gray-50` / `bg-gray-100` → `bg-surface-2`
   - `border-gray-*` → `border-line`
   - `text-gray-900` / `text-gray-800` → `text-ink`
   - `text-gray-700` / `text-gray-600` → `text-ink-2`
   - `text-gray-500` / `text-gray-400` → `text-ink-3`
   - Green, amber and red states → `good`, `warn` and `bad`, with their `-soft` backgrounds (for example `bg-good-soft text-good`)
   - `barca-navy` buttons → `btn-primary`
5. **Motion:** keep transitions between 150 and 300 ms. Use `animate-fade-in`, `animate-slide-up`, `animate-pop`, `animate-shake` and `animate-burst` (all defined in tailwind.config.js). Reduced motion is handled globally in index.css.

## Tokens (tailwind.config.js and index.css)

- **Colours:** `canvas` is the page; `surface` and `surface-2` are cards and wells; `line` is borders; `ink`, `ink-2` and `ink-3` are text. Then `brand`, `brand-soft` and `brand-ink`, `accent` and `accent-soft` (gold), and `good`, `warn` and `bad` with their `-soft` variants. All accept opacity modifiers (for example `bg-brand/10`).
- **Brand:** `barca-navy`, `barca-navy-deep` and `barca-gold` remain available for hero accents.
- **Fonts:** `font-sans` (Inter) for body text; `font-display` (Plus Jakarta Sans) for headings and big numbers.
- **Shadows:** `shadow-soft`, `shadow-lift` and `shadow-glow`.
- **Component classes:** `card`, `card-hover`, `btn-primary`, `btn-secondary`, `btn-ghost`, `chip`, `chip-on`, `input`, `eyebrow`, `page-title`, `section-title`, `pill`, `progress-track`, `progress-fill`, `skeleton`.
- **Subject colours:** `import { subjectStyle } from '../lib/subjectStyle'`, then `subjectStyle(id)` returns `{ tile, bar, ring, text, grad }`. Use them for subject tiles, bars and gradients (for example `bg-gradient-to-r ${st.grad}`).

## Layout

The app shell (Sidebar, the `max-w-6xl` main column, SubjectShell's header and tabs, and BoardLayout's mode cards) is already done; don't edit those files.

- Pages use `space-y-6` between sections.
- Cards use `card p-5` or `card p-6`.
- Section headers use `section-title`, with an `eyebrow` above where helpful.

## Progress data: `useProgress()`

```js
import { useProgress, formatHours } from '../context/ProgressContext';
const { data, loading, error, refresh } = useProgress();
```

- `data` is null while loading. Show `skeleton` blocks while loading and a calm error card with a Retry button that calls `refresh()` on error.
- After a practice session finishes (quiz finished, sprint finished, paper submitted), call `refresh()` once so XP and the streak update.

The full shape is in `api/progress.js`. To see real output locally, POST `{ userId }` to `localhost:3001/api/progress`. The main fields:

- `totals`: `{ answered, correct, accuracy, marks, xp, seconds, active_days }`. Use `formatHours(totals.seconds)` for time spent.
- `level`: `{ name, index, min, next, next_min, progress }`. Levels: Beginner, Explorer, Challenger, Expert, Master. `progress` is a percentage towards the next level.
- `streak`: `{ current, best, active_today }`.
- `today`: `{ answered, goal, done }`. The daily goal is 20 questions.
- `week[7]`: `{ date, answered, correct, minutes }`, oldest first.
- `improvement`: `{ this_week, last_week, answered_this_week, answered_last_week }`. The first two are accuracy percentages, or null.
- `subjects[]`: `{ subject, answered, correct, accuracy, last_active, chapters[{chapter, answered, correct, accuracy}], skills[...] }`.
- `revision[]`: chapters with at least 5 answers and accuracy under 70%.
- `next_challenge`: `{ type: 'revise'|'revisit', subject, chapter, accuracy, ... }`, or null.
- `difficulty[]`: accuracy by board difficulty 1–5.
- `badges[]`: `{ id, name, desc, earned, progress, goal }`.
- `rules`: plain-English explanations of how XP, streaks and time are counted. Show these in a "How this is counted" disclosure on the progress page.

## States

Every data-driven block needs a loading state (skeletons shaped like the content), an empty state (one sentence plus one action button), and an error state (one sentence plus Retry).

## Tone

The copy should be encouraging but adult: "Nice — 3 in a row", not "AMAZING!!! 🎉🎉". Use at most one emoji per element.
