import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function CoachWidget({ subject, weakSkills, totalDone }) {
  const { user } = useUser();
  const navigate = useNavigate();
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'bro';

  useEffect(() => {
    async function fetchCoachMessage() {
      setLoading(true);
      setMessage(null);

      // Get days since last session for this subject
      const { data: lastSession } = await supabase
        .from('sessions')
        .select('started_at')
        .eq('subject', subject.id)
        .eq('user_id', user?.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      const daysSinceSession = lastSession
        ? Math.floor((Date.now() - new Date(lastSession.started_at)) / 86400000)
        : 999;

      try {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'daily_message',
            data: { weakSkills, daysSinceSession, totalDone, subject: subject.label, firstName },
          }),
        });
        const data = await res.json();
        setMessage(data.message);
      } catch {
        setMessage(null);
      }
      setLoading(false);
    }

    fetchCoachMessage();
  }, [subject.id]);

  // Navigate to quiz pre-selecting the weakest chapter
  function handleCoachPick() {
    if (weakSkills.length > 0) {
      navigate(`/${subject.id}/chapters?coach=1`);
    } else {
      navigate(`/${subject.id}/chapters`);
    }
  }

  if (loading) {
    return (
      <div className="card flex items-start gap-3 p-5" aria-busy="true">
        <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-3.5 w-1/2" />
        </div>
      </div>
    );
  }

  // The coach is AI-written; if it can't answer (e.g. the service is unavailable) show a calm fallback.
  if (!message) {
    return (
      <div className="card flex items-center justify-between gap-4 p-5 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-3">AI</div>
          <div>
            <p className="text-sm font-semibold text-ink">Your coach is unavailable right now</p>
            <p className="mt-0.5 text-sm text-ink-3">No problem — pick up a chapter and keep going.</p>
          </div>
        </div>
        <button onClick={handleCoachPick} className="btn-secondary shrink-0 py-2">Practise</button>
      </div>
    );
  }

  return (
    <div className="relative space-y-4 overflow-hidden rounded-2xl border border-line/80 bg-surface p-5 shadow-soft animate-fade-in">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-barca-gold to-amber-400" />
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">
          AI
        </div>
        <div>
          <p className="eyebrow mb-1">Your Coach</p>
          <p className="text-sm leading-relaxed text-ink">{message}</p>
        </div>
      </div>
      <button
        onClick={handleCoachPick}
        className="btn-primary w-full py-2.5"
      >
        Let's go
      </button>
    </div>
  );
}

function useUser() {
  const { user } = useAuth();
  return { user };
}
