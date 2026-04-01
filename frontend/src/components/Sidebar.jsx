import { NavLink, useNavigate } from 'react-router-dom';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

const navLinks = [
  { to: '/',          label: 'Home',      icon: '⌂', end: true  },
  { to: '/dashboard', label: 'Dashboard', icon: '⊞', end: false },
  { to: '/quiz',      label: 'Quiz',      icon: '✎', end: false },
  { to: '/skills',    label: 'Skills',    icon: '◎', end: false },
  { to: '/summary',   label: 'Summary',   icon: '≡', end: false },
];

export default function Sidebar() {
  const { subject, setSubject, subjects } = useSubject();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function handleSubjectChange(s) {
    setSubject(s);
    navigate('/dashboard');
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside className="w-56 shrink-0 bg-barca-navy min-h-screen flex flex-col sticky top-0 h-screen">
      {/* Brand */}
      <div className="px-5 pt-6 pb-4 border-b border-white/10">
        <Logo size="sm" dark={true} />
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
              end={link.end}
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

      {/* User + Sign out */}
      <div className="mt-auto px-4 py-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-barca-gold flex items-center justify-center text-barca-navy text-xs font-bold">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{displayName}</p>
            <p className="text-white/30 text-[10px] truncate">Grade 10 · ICSE</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-left text-white/40 hover:text-white/70 text-xs px-1 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  );
}
