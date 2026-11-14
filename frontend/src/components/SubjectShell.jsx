import { NavLink, Navigate, Outlet, useParams, useLocation } from 'react-router-dom';
import { SUBJECTS } from '../context/SubjectContext';
import { SUBJECTS_WITH_BOARD } from '../lib/board';

// Everything inside a subject: header + tabs, then the page.
export default function SubjectShell() {
  const { subjectId } = useParams();
  const { pathname } = useLocation();
  const subject = SUBJECTS.find(s => s.id === subjectId);
  if (!subject) return <Navigate to="/" replace />;

  const tabs = [
    { to: '', label: 'Practice', end: true, also: 'chapters' },
    ...(SUBJECTS_WITH_BOARD.includes(subject.id) ? [{ to: 'board', label: 'Board papers' }] : []),
    { to: 'skills', label: 'Skills' },
    { to: 'weekly', label: 'Weekly summary' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><span>{subject.emoji}</span>{subject.label}</h1>
        <nav className="flex gap-1 mt-3 border-b border-gray-200 overflow-x-auto">
          {tabs.map(t => (
            <NavLink key={t.to} to={`/${subject.id}${t.to ? '/' + t.to : ''}`} end={t.end}
              className={({ isActive }) => { isActive = isActive || (t.also && pathname.startsWith(`/${subject.id}/${t.also}`)); return `px-4 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors ${
                isActive ? 'border-barca-navy text-barca-navy' : 'border-transparent text-gray-500 hover:text-gray-800'}`; }}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
