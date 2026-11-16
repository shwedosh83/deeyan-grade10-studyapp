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

  // Last result is kept in localStorage so pages show numbers instantly; fresh data replaces it a moment later.
  const cacheKey = user?.id ? `fm_progress_${user.id}` : null;
  const refresh = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const res = await fetch('/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setData(json); setError(null);
      try { localStorage.setItem(`fm_progress_${user.id}`, JSON.stringify(json)); } catch { /* storage full or blocked */ }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    let cached = null;
    try { cached = cacheKey ? JSON.parse(localStorage.getItem(cacheKey) || 'null') : null; } catch { cached = null; }
    if (cached) { setData(cached); setLoading(false); } else setLoading(true);
    refresh();
  }, [refresh, cacheKey]);

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
