import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

// The student's real progress (XP, level, streak, goal, time, mastery, badges) from /api/progress.
// Loaded once per sign-in; call refresh() after any practice session so the numbers update.
const ProgressContext = createContext({ data: null, loading: true, error: null, refresh: () => {} });

export function ProgressProvider({ children }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setData(json); setError(null);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  return <ProgressContext.Provider value={{ data, loading, error, refresh }}>{children}</ProgressContext.Provider>;
}

export const useProgress = () => useContext(ProgressContext);

// Helpers shared by the progress screens
export function formatHours(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = s / 3600;
  return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
}
