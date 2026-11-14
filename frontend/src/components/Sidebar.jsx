import { NavLink, useLocation } from 'react-router-dom';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { SUBJECTS_WITH_BOARD, BOARD_ONLY_SUBJECTS } from '../lib/board';
import Logo from './Logo';

const TAB_SEGMENTS = ['chapters', 'board', 'skills', 'weekly'];

export default function Sidebar() {
  const { subjects } = useSubject();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Switching subject keeps you on the same tab (e.g. Board papers) when that subject has it.
  const parts = pathname.split('/').filter(Boolean);
  const onSubject = subjects.some(s => s.id === parts[0]);
  const currentTab = onSubject && TAB_SEGMENTS.includes(parts[1]) ? parts[1] : '';
  const target = (s) => {
    if (!currentTab || (currentTab === 'board' && !SUBJECTS_WITH_BOARD.includes(s.id))) return `/${s.id}`;
    if (currentTab !== 'board' && BOARD_ONLY_SUBJECTS.includes(s.id)) return `/${s.id}`;   // maths has only the Board tab
    return `/${s.id}/${currentTab}`;
  };

  const linkCls = (isActive) =>
    `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive ? 'bg-white/15 text-white border-l-2 border-barca-gold pl-[10px]' : 'text-white/70 hover:text-white hover:bg-white/10'}`;

  return (
    <aside className="w-56 shrink-0 bg-barca-navy min-h-screen flex flex-col sticky top-0 h-screen overflow-y-auto">
      <div className="px-5 pt-6 pb-4 border-b border-white/10"><Logo size="sm" dark={true} /></div>

      <div className="px-3 pt-5">
        <NavLink to="/home" className={({ isActive }) => linkCls(isActive)}>
          <span className="text-base leading-none opacity-70">⌂</span><span>All subjects</span>
        </NavLink>
      </div>

      <div className="px-3 pt-5">
        <p className="text-white/40 text-xs font-semibold uppercase tracking-widest px-2 mb-2">Subjects</p>
        <div className="space-y-0.5">
          {subjects.map(s => (
            <NavLink key={s.id} to={target(s)} className={() => linkCls(parts[0] === s.id)}>
              <span className="text-base leading-none">{s.emoji}</span><span>{s.label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div className="mt-auto px-4 py-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-barca-gold flex items-center justify-center text-barca-navy text-xs font-bold">{initials}</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{displayName}</p>
            <p className="text-white/30 text-[10px] truncate">Grade 10 · ICSE</p>
          </div>
        </div>
        <button onClick={signOut} className="w-full text-left text-white/40 hover:text-white/70 text-xs px-1 transition-colors">Sign out →</button>
      </div>
    </aside>
  );
}
