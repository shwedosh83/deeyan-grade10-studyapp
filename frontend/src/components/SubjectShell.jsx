import { NavLink, Navigate, Outlet, useParams, useLocation } from 'react-router-dom';
import { SUBJECTS } from '../context/SubjectContext';
import { SUBJECTS_WITH_BOARD, BOARD_ONLY_SUBJECTS, WORKSHEET_SUBJECTS } from '../lib/board';
import { subjectStyle } from '../lib/subjectStyle';

// Everything inside a subject: header + tabs, then the page.
export default function SubjectShell() {
  const { subjectId } = useParams();
  const { pathname } = useLocation();
  const subject = SUBJECTS.find(s => s.id === subjectId);
  if (!subject) return <Navigate to="/" replace />;

  const boardOnly = BOARD_ONLY_SUBJECTS.includes(subject.id);
  if (boardOnly && pathname === `/${subject.id}`) return <Navigate to={`/${subject.id}/board`} replace />;

  const tabs = boardOnly ? [
    { to: 'board', label: 'Board papers' },
  ] : [
    { to: '', label: 'Practice', end: true, also: 'chapters' },
    ...(SUBJECTS_WITH_BOARD.includes(subject.id) ? [{ to: 'board', label: 'Board papers' }] : []),
    ...(WORKSHEET_SUBJECTS.includes(subject.id) ? [{ to: 'worksheets', label: 'Worksheets' }] : []),
    { to: 'skills', label: 'Skills' },
    { to: 'weekly', label: 'Weekly summary' },
  ];
  const st = subjectStyle(subject.id);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-2xl ${st.tile}`}>{subject.emoji}</span>
          <div>
            <p className="eyebrow">Subject</p>
            <h1 className="page-title leading-tight">{subject.label}</h1>
          </div>
        </div>
        <nav className="scroll-row flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-soft">
          {tabs.map(t => (
            <NavLink key={t.to} to={`/${subject.id}${t.to ? '/' + t.to : ''}`} end={t.end}
              className={({ isActive }) => { isActive = isActive || (t.also && pathname.startsWith(`/${subject.id}/${t.also}`)); return `whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition duration-150 ${
                isActive ? 'bg-brand-soft text-brand-ink' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'}`; }}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
