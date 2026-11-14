import { NavLink, Outlet } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';

// Board papers tab: switch between the three practice modes.
export default function BoardLayout() {
  const { subject } = useSubject();
  const base = `/${subject.id}/board`;
  const modes = [
    { to: base, label: 'Timed paper', end: true },
    { to: `${base}/sprint`, label: 'Sprint round' },
    { to: `${base}/applied`, label: 'Applied questions' },
  ];
  return (
    <div className="space-y-5">
      <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
        {modes.map(m => (
          <NavLink key={m.to} to={m.to} end={m.end}
            className={({ isActive }) => `px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-white text-barca-navy shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {m.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
