import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import SkillRadar from './SkillRadar';

export default function SkillTracker() {
  const navigate = useNavigate();
  const [skillsByChapter, setSkillsByChapter] = useState({});
  const [allSkillScores, setAllSkillScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const { subject } = useSubject();

  useEffect(() => { load(); }, [subject]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('skill_scores')
      .select('*')
      .eq('subject', subject.id)
      .order('chapter_id')
      .order('skill');

    if (data) {
      setAllSkillScores(data);
      const grouped = {};
      data.forEach((s) => {
        const key = s.chapter_name;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(s);
      });
      setSkillsByChapter(grouped);
    }
    setLoading(false);
  }

  async function handleResetAll() {
    setResettingAll(true);
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('subject', subject.id);

    if (sessions?.length) {
      const ids = sessions.map(s => s.id);
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('session_answers').delete().in('session_id', ids.slice(i, i + 100));
      }
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('sessions').delete().in('id', ids.slice(i, i + 100));
      }
    }
    setResettingAll(false);
    setResetAllOpen(false);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-barca-navy border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = Object.keys(skillsByChapter).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Skill Tracker</h1>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-barca-navy-light text-barca-navy border border-barca-navy/10">
              <span>{subject.emoji}</span>
              <span>{subject.label}</span>
            </span>
          </div>
          <p className="text-gray-500 text-sm">Your accuracy by topic · skill scores are preserved when you reset practice history</p>
        </div>
        {hasData && (
          <button
            onClick={() => setResetAllOpen(true)}
            className="text-sm text-gray-400 hover:text-barca-red hover:bg-barca-red-light px-3 py-1.5 rounded-lg font-medium transition-colors border border-gray-200 hover:border-barca-red/20"
          >
            ↺ Reset All Chapters
          </button>
        )}
      </div>

      {/* Reset All Confirmation */}
      {resetAllOpen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Reset all practice history for {subject.label}?</p>
            <p className="text-xs text-amber-600 mt-0.5">
              All session records will be cleared so you can start every chapter fresh. Your skill scores and accuracy are <strong>not</strong> affected.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setResetAllOpen(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleResetAll}
              disabled={resettingAll}
              className="text-xs px-3 py-1.5 rounded-lg bg-barca-red text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {resettingAll ? 'Resetting...' : 'Yes, Reset All'}
            </button>
          </div>
        </div>
      )}

      <SkillRadar skillScores={allSkillScores} subjectId={subject.id} />

      {!hasData ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-4">No data yet. Complete a quiz to see your skill breakdown.</p>
          <button
            onClick={() => navigate('/quiz')}
            className="bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            Start Quiz
          </button>
        </div>
      ) : (
        Object.entries(skillsByChapter).map(([chapter, skills]) => (
          <ChapterSection
            key={chapter}
            chapter={chapter}
            skills={skills}
            subject={subject}
            onPractice={(chId) => navigate(`/quiz?chapter=${chId}`)}
            onReset={load}
          />
        ))
      )}
    </div>
  );
}

function ChapterSection({ chapter, skills, subject, onPractice, onReset }) {
  const totalAttempts = skills.reduce((s, r) => s + r.total_attempts, 0);
  const totalCorrect  = skills.reduce((s, r) => s + r.correct_attempts, 0);
  const chapterAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  const chapterId = skills[0]?.chapter_id;
  const [resetting, setResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleReset() {
    setResetting(true);
    // Find all sessions for this chapter
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('subject', subject.id)
      .eq('chapter_id', chapterId);

    if (sessions?.length) {
      const ids = sessions.map(s => s.id);
      // Delete session_answers for those sessions
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('session_answers').delete().in('session_id', ids.slice(i, i + 100));
      }
      // Delete the sessions themselves
      for (let i = 0; i < ids.length; i += 100) {
        await supabase.from('sessions').delete().in('id', ids.slice(i, i + 100));
      }
    }

    setResetting(false);
    setConfirmOpen(false);
    onReset(); // refresh skill tracker (skill_scores unchanged)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Chapter header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-barca-navy-light">
        <div>
          <h2 className="font-semibold text-barca-navy text-sm">{chapter}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{totalAttempts} attempts</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${accuracyColor(chapterAccuracy)}`}>
            {chapterAccuracy}%
          </span>
          <button
            onClick={() => onPractice(chapterId)}
            className="text-xs bg-barca-navy hover:bg-barca-navy-dark text-white px-3 py-1 rounded-full font-medium transition-colors"
          >
            Practice
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            title="Reset practice history for this chapter"
            className="text-xs text-gray-400 hover:text-barca-red hover:bg-barca-red-light px-2 py-1 rounded-full font-medium transition-colors"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Confirm reset dialog */}
      {confirmOpen && (
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-amber-800">Reset practice history for "{chapter}"?</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Your session records will be cleared so you can start fresh. Your skill scores and accuracy are <strong>not</strong> affected.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmOpen(false)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-xs px-3 py-1.5 rounded-lg bg-barca-red text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Yes, Reset'}
            </button>
          </div>
        </div>
      )}

      {/* Skill rows */}
      <div className="divide-y divide-gray-50">
        {skills.map((s) => {
          const acc = s.total_attempts > 0
            ? Math.round((s.correct_attempts / s.total_attempts) * 100)
            : 0;
          return (
            <div key={s.skill} className="px-5 py-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm text-gray-700">{s.skill}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {s.correct_attempts}/{s.total_attempts}
                  </span>
                  <span className={`text-sm font-semibold w-12 text-right ${accuracyColor(acc)}`}>
                    {acc}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor(acc)}`}
                  style={{ width: `${acc}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function accuracyColor(acc) {
  if (acc >= 70) return 'text-barca-navy';
  if (acc >= 40) return 'text-amber-500';
  return 'text-barca-red';
}

function barColor(acc) {
  if (acc >= 70) return 'bg-barca-navy';
  if (acc >= 40) return 'bg-amber-400';
  return 'bg-barca-red';
}
