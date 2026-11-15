import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSubject } from '../../context/SubjectContext';
import { useAuth } from '../../context/AuthContext';
import { fmtMarks } from '../../lib/board';

export default function RecentAttempts() {
  const { subject } = useSubject();
  const { user } = useAuth();
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('board_attempts').select('id,mode,score,max_score,submitted_at,paper_id')
      .eq('user_id', user.id).eq('subject', subject.id).not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false }).limit(6).then(({ data }) => setRecent(data || []));
  }, [user?.id, subject.id]);
  if (!recent.length) return null;
  return (
    <div className="space-y-3">
      <div>
        <p className="eyebrow">History</p>
        <h2 className="section-title">Recent practice</h2>
      </div>
      <div className="card divide-y divide-line overflow-hidden">
        {recent.map(a => {
          const pct = a.score !== null && Number(a.max_score) ? (Number(a.score) / Number(a.max_score)) * 100 : null;
          const tone = pct === null ? 'bg-surface-2 text-ink-3' : pct >= 80 ? 'bg-good-soft text-good' : pct >= 50 ? 'bg-warn-soft text-warn' : 'bg-bad-soft text-bad';
          return (
            <div key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm transition duration-150 hover:bg-surface-2">
              <span className="flex-1 font-medium capitalize text-ink">{a.mode === 'timed' ? `Paper ${a.paper_id?.replace(/^[a-z_]+?_(\d{4}.*)$/, '$1').toUpperCase()}` : a.mode}</span>
              <span className="text-xs text-ink-3">{new Date(a.submitted_at).toLocaleDateString()}</span>
              <span className={`pill tabular-nums ${tone}`}>{a.score === null ? '—' : fmtMarks(a.score)} / {fmtMarks(a.max_score)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
