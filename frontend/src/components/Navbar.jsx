import { NavLink, useNavigate } from 'react-router-dom';
import { useSubject } from '../context/SubjectContext';
import Logo from './Logo';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/quiz', label: 'Quiz' },
  { to: '/skills', label: 'Skills' },
  { to: '/summary', label: 'Weekly Summary' },
];

export default function Navbar() {
  const { subject, setSubject, subjects } = useSubject();
  const navigate = useNavigate();

  function handleSubjectChange(s) {
    setSubject(s);
    navigate('/');
  }

  return (
    <nav className="bg-barca-navy sticky top-0 z-10 shadow-md">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14 gap-4">
        {/* Brand */}
        <Logo size="md" dark={true} />

        {/* Subject switcher */}
        <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5 shrink-0">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSubjectChange(s)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                subject.id === s.id
                  ? 'bg-barca-gold text-barca-navy'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {s.emoji} {s.label}
            </button>
          ))}
        </div>

        {/* Nav links */}
        <div className="flex gap-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/15 text-white border-b-2 border-barca-gold'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
