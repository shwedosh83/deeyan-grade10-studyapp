import { NavLink, Outlet } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import { BOARD_MODES_WITHOUT_APPLIED } from '../../lib/board';
import { MEMORY_SUBJECTS } from '../../lib/memoryDrill';

// Board papers tab: switch between the practice modes.
export default function BoardLayout() {
  const { subject } = useSubject();
  const base = `/${subject.id}/board`;
  const modes = [
    { to: base, label: 'Timed paper', hint: 'Full paper, real time', icon: '⏱️', end: true },
    { to: `${base}/sprint`, label: 'Sprint round', hint: 'Quick-fire objectives', icon: '⚡' },
    ...(BOARD_MODES_WITHOUT_APPLIED.includes(subject.id) ? [] : [{ to: `${base}/applied`, label: 'Applied questions', hint: 'Cases, data, numericals', icon: '🧩' }]),
    ...(MEMORY_SUBJECTS.includes(subject.id) ? [{ to: `${base}/memory`, label: 'Definitions', hint: 'Laws, terms, units', icon: '📖' }] : []),
    { to: `${base}/competency`, label: 'Competency', hint: 'CISCE item bank', icon: '🎯' },
  ];
  return (
    <div className="space-y-6">
      <div className={`grid gap-3 ${modes.length === 5 ? 'grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 max-w-6xl' : modes.length === 4 ? 'grid-cols-2 xl:grid-cols-4 max-w-4xl' : 'grid-cols-3 max-w-4xl'}`}>
        {modes.map(m => (
          <NavLink key={m.to} to={m.to} end={m.end}
            className={({ isActive }) => `group flex items-center gap-3 rounded-2xl border p-3.5 transition duration-150 ${isActive
              ? 'border-brand bg-brand-soft shadow-glow'
              : 'border-line bg-surface shadow-soft hover:-translate-y-0.5 hover:shadow-lift'}`}>
            {({ isActive }) => (<>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${isActive ? 'bg-surface' : 'bg-surface-2'}`}>{m.icon}</span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${isActive ? 'text-brand-ink' : 'text-ink'}`}>{m.label}</span>
                <span className="block truncate text-xs text-ink-3">{m.hint}</span>
              </span>
            </>)}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
