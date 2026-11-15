import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSubject } from '../context/SubjectContext';
import { useAuth } from '../context/AuthContext';
import { useProgress } from '../context/ProgressContext';
import { subjectStyle } from '../lib/subjectStyle';
import { bandOf, MIN_ANSWERS } from './progress/bands';
import SkillRadar from './SkillRadar';

// Skills tab: accuracy by chapter and by topic for the current subject.
// Numbers come from useProgress() (computed from the student's own answers), not the legacy skill_scores table.
export default function SkillTracker() {
  const navigate = useNavigate();
  const { subject } = useSubject();
  const { user } = useAuth();
  const { data, loading, error, refresh } = useProgress();
  const [chapterIds, setChapterIds] = useState({});       // chapter name → chapter_id, for Practice / Reset
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  useEffect(() => {
    let live = true;
    setChapterIds({});
    supabase?.rpc('get_chapters_for_subject', { p_subject: subject.id }).then(({ data: rows }) => {
      if (!live || !rows) return;
      const map = {};
      rows.forEach(c => { if (c.chapter_name && map[c.chapter_name] === undefined) map[c.chapter_name] = c.chapter_id; });
      setChapterIds(map);
    });
    return () => { live = false; };
  }, [subject.id]);

  async function deleteSessions(chapterId) {
    let q = supabase.from('sessions').select('id').eq('subject', subject.id);
    if (user?.id) q = q.eq('user_id', user.id);
    if (chapterId !== undefined) q = q.eq('chapter_id', chapterId);
    const { data: sessions } = await q;
    if (sessions?.length) {
      const ids = sessions.map(s => s.id);
      for (let i = 0; i < ids.length; i += 100) await supabase.from('session_answers').delete().in('session_id', ids.slice(i, i + 100));
      for (let i = 0; i < ids.length; i += 100) await supabase.from('sessions').delete().in('id', ids.slice(i, i + 100));
    }
  }

  async function handleResetAll() {
    setResettingAll(true);
    await deleteSessions();
    setResettingAll(false);
    setResetAllOpen(false);
    refresh();
  }

  const st = subjectStyle(subject.id);
  const entry = data?.subjects?.find(s => s.subject === subject.id);
  const chapters = entry?.chapters || [];
  const skills = entry?.skills || [];
  const hasData = chapters.length > 0 || skills.length > 0;

  // Radar: per-topic if there are enough topics, otherwise per-chapter.
  const useSkills = skills.length >= 3;
  const radarPoints = (useSkills ? skills.map(s => ({ ...s, label: s.skill })) : chapters.map(c => ({ ...c, label: c.chapter })))
    .filter(p => p.accuracy !== null).slice(0, 12);

  const startQuiz = <button onClick={() => navigate(`/${subject.id}/chapters`)} className="btn-primary">Start a quiz</button>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="page-title">Skill tracker</h1>
            <span className={`pill ${st.tile}`}><span>{subject.emoji}</span><span>{subject.label}</span></span>
          </div>
          <p className="text-sm text-ink-3">Your accuracy by chapter and topic, from every answer you've given in {subject.label}.</p>
        </div>
        {hasData && (
          <button onClick={() => setResetAllOpen(true)} className="btn-ghost shrink-0 border border-line text-ink-3 hover:border-bad/30 hover:bg-bad-soft hover:text-bad">
            ↺ Reset all chapters
          </button>
        )}
      </div>

      {resetAllOpen && (
        <ConfirmBar
          title={`Reset all practice history for ${subject.label}?`}
          body="This deletes your quiz answers in this subject so you can start every chapter fresh. Accuracy, XP and time are worked out from those answers, so they will drop accordingly. Board-paper attempts are kept."
          confirmLabel={resettingAll ? 'Resetting…' : 'Yes, reset all'}
          busy={resettingAll}
          onCancel={() => setResetAllOpen(false)}
          onConfirm={handleResetAll}
        />
      )}

      {!data && loading ? (
        <div className="space-y-6">
          <div className="skeleton h-96 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      ) : !data && error ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-2">We couldn't load your skill data. {error}</p>
          <button onClick={refresh} className="btn-primary mt-4">Retry</button>
        </div>
      ) : !hasData ? (
        <div className="card p-8 text-center">
          <p className="mb-4 text-ink-2">No answers in {subject.label} yet. Complete a quiz to see your skill breakdown.</p>
          {startQuiz}
        </div>
      ) : (
        <>
          <SkillRadar points={radarPoints} basis={useSkills ? 'topic' : 'chapter'} title={useSkills ? 'Topic overview' : 'Chapter overview'} emptyAction={startQuiz} />

          <div>
            <p className="eyebrow mb-3">By chapter</p>
            <div className="space-y-3">
              {chapters.map(c => (
                <ChapterRow
                  key={c.chapter}
                  chapter={c}
                  chapterId={chapterIds[c.chapter]}
                  onPractice={(chId) => navigate(chId !== undefined ? `/${subject.id}/chapters?chapter=${chId}` : `/${subject.id}/chapters`)}
                  onReset={async (chId) => { await deleteSessions(chId); refresh(); }}
                />
              ))}
            </div>
          </div>

          {skills.length > 0 && (
            <div className="card p-6">
              <p className="eyebrow">By topic</p>
              <h2 className="section-title mt-0.5">Topic accuracy</h2>
              <div className="mt-4 space-y-3">
                {skills.map(s => <AccuracyRow key={s.skill} label={s.skill} {...s} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChapterRow({ chapter, chapterId, onPractice, onReset }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const b = bandOf(chapter.accuracy, chapter.answered);
  const enough = chapter.answered >= MIN_ANSWERS;

  async function handleReset() {
    setResetting(true);
    await onReset(chapterId);
    setResetting(false);
    setConfirmOpen(false);
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-ink" title={chapter.chapter}>{chapter.chapter}</h2>
          <p className="mt-0.5 text-xs text-ink-3">
            {chapter.correct}/{chapter.answered} correct{!enough && ` · ${MIN_ANSWERS - chapter.answered} more answers for a reliable score`}
          </p>
          <div className="progress-track mt-2 h-1.5"><div className={`progress-fill ${b.bar}`} style={{ width: `${chapter.accuracy ?? 0}%` }} /></div>
        </div>
        <span className={`w-14 text-right font-display text-lg font-bold ${b.text}`}>{chapter.accuracy ?? '—'}%</span>
        <button onClick={() => onPractice(chapterId)} className="btn-primary px-3.5 py-1.5 text-xs">Practise</button>
        {chapterId !== undefined && (
          <button onClick={() => setConfirmOpen(true)} title="Reset practice history for this chapter"
            className="btn-ghost px-2 py-1 text-xs text-ink-3 hover:bg-bad-soft hover:text-bad">
            ↺ Reset
          </button>
        )}
      </div>
      {confirmOpen && (
        <div className="border-t border-line">
          <ConfirmBar
            flat
            title={`Reset practice history for "${chapter.chapter}"?`}
            body="This deletes your quiz answers for this chapter so you can start fresh. Its accuracy, and your XP and time, will be recalculated without them."
            confirmLabel={resetting ? 'Resetting…' : 'Yes, reset'}
            busy={resetting}
            onCancel={() => setConfirmOpen(false)}
            onConfirm={handleReset}
          />
        </div>
      )}
    </div>
  );
}

function AccuracyRow({ label, accuracy, answered, correct }) {
  const b = bandOf(accuracy, answered);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-ink-2">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-ink-3">{correct}/{answered}</span>
          <span className={`w-12 text-right font-semibold ${b.text}`}>{accuracy ?? '—'}%</span>
        </span>
      </div>
      <div className="progress-track h-1.5"><div className={`progress-fill ${b.bar}`} style={{ width: `${accuracy ?? 0}%` }} /></div>
    </div>
  );
}

function ConfirmBar({ title, body, confirmLabel, busy, onCancel, onConfirm, flat }) {
  return (
    <div className={`flex items-center justify-between gap-4 bg-warn-soft px-5 py-4 animate-fade-in ${flat ? '' : 'rounded-xl border border-warn/25'}`}>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-2">{body}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onCancel} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
        <button onClick={onConfirm} disabled={busy}
          className="inline-flex items-center rounded-xl bg-bad px-3 py-1.5 text-xs font-semibold text-surface transition duration-150 hover:bg-bad/90 disabled:opacity-50">
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
