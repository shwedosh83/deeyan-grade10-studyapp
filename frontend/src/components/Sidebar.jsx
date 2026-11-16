import { NavLink, useLocation } from 'react-router-dom';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useProgress } from '../context/ProgressContext';
import { SUBJECTS_WITH_BOARD, BOARD_ONLY_SUBJECTS, WORKSHEET_SUBJECTS } from '../lib/board';
import Logo from './Logo';

const TAB_SEGMENTS = ['chapters', 'board', 'skills', 'weekly', 'worksheets'];

const Icon = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  errors: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><path d="M9 3h6v4H9zM9.5 12.5l5 5m0-5-5 5" /></>,
  upload: <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
};
const Svg = ({ children, className = 'w-[18px] h-[18px]' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export default function Sidebar() {
  const { subjects } = useSubject();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: progress } = useProgress();
  const { pathname } = useLocation();

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Switching subject keeps you on the same tab (e.g. Board papers) when that subject has it.
  const parts = pathname.split('/').filter(Boolean);
  const onSubject = subjects.some(s => s.id === parts[0]);
  const currentTab = onSubject && TAB_SEGMENTS.includes(parts[1]) ? parts[1] : '';
  const target = (s) => {
    if (!currentTab || (currentTab === 'board' && !SUBJECTS_WITH_BOARD.includes(s.id)) || (currentTab === 'worksheets' && !WORKSHEET_SUBJECTS.includes(s.id))) return `/${s.id}`;
    if (currentTab !== 'board' && BOARD_ONLY_SUBJECTS.includes(s.id)) return `/${s.id}`;   // maths has only the Board tab
    return `/${s.id}/${currentTab}`;
  };

  const linkCls = (isActive) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition duration-150 ${
      isActive ? 'bg-white/[0.14] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]' : 'text-white/70 hover:bg-white/[0.08] hover:text-white'}`;
  const activeBar = <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-barca-gold" />;

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto bg-gradient-to-b from-barca-navy-deep via-barca-navy-deep to-[#001B3D] text-white">
      <div className="px-5 pb-5 pt-6"><Logo size="sm" dark={true} /></div>

      <nav className="space-y-1 px-3">
        <NavLink to="/home" className={({ isActive }) => linkCls(isActive)}>
          {({ isActive }) => (<>{isActive && activeBar}<Svg>{Icon.home}</Svg><span>Home</span></>)}
        </NavLink>
        <NavLink to="/progress" className={({ isActive }) => linkCls(isActive)}>
          {({ isActive }) => (<>{isActive && activeBar}<Svg>{Icon.chart}</Svg><span>My progress</span></>)}
        </NavLink>
        <NavLink to="/errors" className={({ isActive }) => linkCls(isActive)}>
          {({ isActive }) => (<>{isActive && activeBar}<Svg>{Icon.errors}</Svg><span>Error log</span></>)}
        </NavLink>
        <NavLink to="/school" className={({ isActive }) => linkCls(isActive)}>
          {({ isActive }) => (<>{isActive && activeBar}<Svg>{Icon.upload}</Svg><span>School tests</span></>)}
        </NavLink>
      </nav>

      <div className="px-3 pt-6">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-white/40">Subjects</p>
        <div className="space-y-0.5">
          {subjects.map(s => {
            const active = parts[0] === s.id;
            return (
              <NavLink key={s.id} to={target(s)} className={() => linkCls(active)}>
                {active && activeBar}
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[15px] leading-none transition ${active ? 'bg-white/15' : 'bg-white/[0.06] group-hover:bg-white/10'}`}>{s.emoji}</span>
                <span className="truncate">{s.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      <div className="mt-auto space-y-3 px-3 pb-4 pt-6">
        {progress && (
          <NavLink to="/progress" className="block rounded-xl bg-white/[0.06] p-3 transition hover:bg-white/10">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">{progress.level.name}</span>
              <span className="flex items-center gap-1 font-semibold text-barca-gold" title="Current streak">🔥 {progress.streak.current} day{progress.streak.current === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-barca-gold to-amber-300 transition-[width] duration-700" style={{ width: `${progress.level.progress}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-white/50">{progress.totals.xp.toLocaleString()} XP{progress.level.next ? ` · ${(progress.level.next_min - progress.totals.xp).toLocaleString()} to ${progress.level.next}` : ' · top level'}</p>
          </NavLink>
        )}

        <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] p-1" role="radiogroup" aria-label="Theme">
          {[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'monitor', 'Auto']].map(([t, ic, label]) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} title={label}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-semibold transition ${theme === t ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>
              <Svg className="h-3.5 w-3.5">{Icon[ic]}</Svg>{label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 px-1 pt-1">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-2 ring-white/10" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-barca-gold text-xs font-bold text-barca-navy-deep">{initials}</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{displayName}</p>
            <p className="truncate text-[11px] text-white/40">Grade 10 · ICSE</p>
          </div>
          <button onClick={signOut} className="rounded-lg px-2 py-1 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white">Sign out</button>
        </div>
      </div>
    </aside>
  );
}
