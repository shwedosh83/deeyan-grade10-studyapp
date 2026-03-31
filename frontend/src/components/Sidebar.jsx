import { NavLink, useNavigate } from 'react-router-dom';
import { useSubject } from '../context/SubjectContext';

const navLinks = [
  { to: '/',        label: 'Dashboard', icon: '⊞' },
  { to: '/quiz',    label: 'Quiz',      icon: '✎' },
  { to: '/skills',  label: 'Skills',    icon: '◎' },
  { to: '/summary', label: 'Summary',   icon: '≡' },
];

export default function Sidebar() {
  const { subject, setSubject, subjects } = useSubject();
  const navigate = useNavigate();

  function handleSubjectChange(s) {
    setSubject(s);
    navigate('/');
  }

  return (
    <aside className="w-56 shrink-0 bg-barca-navy min-h-screen flex flex-col sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="w-2 h-5 rounded-sm bg-barca-red" />
            <span className="w-2 h-5 rounded-sm bg-barca-gold" />
          </div>
          <span className="font-extrabold text-white text-base tracking-tight">Deeyan Study</span>
        </div>
      </div>

      {/* Subjects */}
      <div className="px-3 pt-5">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest px-2 mb-2">Subjects</p>
        <div className="space-y-0.5">
          {subjects.map((s) => {
            const active = subject.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleSubjectChange(s)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                  active
                    ? 'bg-barca-gold text-barca-navy'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="text-base leading-none">{s.emoji}</span>
                <span className="truncate">{s.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-barca-navy/40" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Nav links */}
      <div className="px-3 pt-6">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest px-2 mb-2">Navigate</p>
        <div className="space-y-0.5">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/15 text-white border-l-2 border-barca-gold pl-[10px]'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <span className="text-base leading-none opacity-70">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-5 py-4 border-t border-white/10">
        <p className="text-white/30 text-xs">Grade 10 · ICSE</p>
      </div>
    </aside>
  );
}
