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
    <div>
      <h2 className="font-bold text-gray-900 mb-2">Recent practice</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {recent.map(a => (
          <div key={a.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
            <span className="text-gray-700 capitalize">{a.mode === 'timed' ? `Paper ${a.paper_id?.replace(/^[a-z_]+?_(\d{4}.*)$/, '$1').toUpperCase()}` : a.mode}</span>
            <span className="text-gray-400 text-xs">{new Date(a.submitted_at).toLocaleDateString()}</span>
            <span className="font-semibold tabular-nums">{a.score === null ? '—' : fmtMarks(a.score)} / {fmtMarks(a.max_score)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
