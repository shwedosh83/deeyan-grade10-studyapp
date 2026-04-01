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
        .select('created_at')
        .eq('subject', subject.id)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const daysSinceSession = lastSession
        ? Math.floor((Date.now() - new Date(lastSession.created_at)) / 86400000)
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
      navigate('/quiz?coach=1');
    } else {
      navigate('/quiz');
    }
  }

  if (loading) {
    return (
      <div className="bg-barca-navy rounded-xl p-5 text-white animate-pulse">
        <div className="h-4 bg-white/20 rounded w-3/4 mb-2" />
        <div className="h-4 bg-white/20 rounded w-1/2" />
      </div>
    );
  }

  if (!message) return null;

  return (
    <div className="bg-barca-navy rounded-xl p-5 text-white space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-barca-gold flex items-center justify-center shrink-0 text-barca-navy font-bold text-sm">
          AI
        </div>
        <div>
          <p className="text-xs text-white/60 font-medium mb-1">Your Study Buddy</p>
          <p className="text-sm leading-relaxed text-white/90">{message}</p>
        </div>
      </div>
      <button
        onClick={handleCoachPick}
        className="w-full bg-barca-gold hover:bg-yellow-400 text-barca-navy font-semibold py-2.5 rounded-lg text-sm transition-colors"
      >
        Let's Go 🚀
      </button>
    </div>
  );
}

function useUser() {
  const { user } = useAuth();
  return { user };
}
