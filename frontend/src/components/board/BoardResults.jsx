import { useState } from 'react';
import { boardApi, fmtMarks, fmtTime, pickSection } from '../../lib/board';
import { Ring, Segmented, TONE, toneOf } from './ui';

// Marks summary + per-question feedback for a graded attempt.
// data = response of /api/boardGrade; qMap = { questionId: question row } for showing the question text.
export default function BoardResults({ data, qMap, title, seconds, onAgain, onHome, againLabel = 'Try another', showSections = false }) {
  const [res, setRes] = useState(data);
  const [filter, setFilter] = useState('lost'); // lost | all
  const [self, setSelf] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const pendingIds = res.results.filter(r => r.marks_awarded === null || r.marks_awarded === undefined).map(r => r.questionId);
  const pct = res.maxScore ? Math.round((res.score / res.maxScore) * 100) : 0;
  const tone = TONE[pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad'].text;

  async function saveSelf() {
    setSaving(true); setErr(null);
    try {
      const marks = pendingIds.map(id => ({ questionId: id, marks: Math.min(Number(self[id] ?? 0) || 0, Number(res.results.find(r => r.questionId === id).marks)) }));
      const out = await boardApi('boardGrade', { action: 'selfmark', attemptId: res.attemptId, marks });
      setRes(prev => {
        const sections = prev.sections ? JSON.parse(JSON.stringify(prev.sections)) : prev.sections;
        for (const m of marks) {
          const r = prev.results.find(x => x.questionId === m.questionId);
          const key = sections && pickSection(Object.keys(sections), r.section);
          if (key) sections[key].got += m.marks;
        }
        return {
          ...prev, score: out.score, sections,
          results: prev.results.map(r => { const m = marks.find(x => x.questionId === r.questionId); return m ? { ...r, marks_awarded: m.marks, graded_by: 'self' } : r; }),
        };
      });
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  const shown = res.results.filter(r => filter === 'all' || r.marks_awarded === null || Number(r.marks_awarded) < Number(r.marks) || r.not_counted);
  const lostMarks = res.results.reduce((s, r) => s + (r.not_counted ? 0 : Math.max(0, Number(r.marks) - (Number(r.marks_awarded) || 0))), 0);

  const sectionEntries = showSections && res.sections ? Object.entries(res.sections) : [];
  const fullCount = res.results.filter(r => !r.not_counted && r.marks_awarded !== null && r.marks_awarded !== undefined && Number(r.marks_awarded) >= Number(r.marks)).length;

  return (
    <div className="max-w-3xl space-y-6 animate-slide-up">
      <div className="card overflow-hidden">
        <div className="flex flex-col items-center gap-6 p-6 sm:flex-row sm:p-8">
          <Ring pct={pct} size={128} stroke={11} tone={pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad'}>
            <span className={`font-display text-3xl font-bold tabular-nums ${tone}`}>{pct}%</span>
          </Ring>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="eyebrow">{title}</p>
            <p className="mt-1 font-display text-5xl font-bold tabular-nums text-ink animate-burst">{fmtMarks(res.score)} <span className="text-2xl font-semibold text-ink-3">/ {fmtMarks(res.maxScore)}</span></p>
            <p className="mt-1.5 text-sm text-ink-2">{fullCount} of {res.results.length} full marks{seconds ? ` · ${fmtTime(seconds)} used` : ''}</p>
            {pendingIds.length > 0 && <p className="mt-2 inline-flex rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn">{pendingIds.length} question{pendingIds.length > 1 ? 's' : ''} need your own marks (below). The total updates when you save them.</p>}
            <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
              <button onClick={onAgain} className="btn-primary">{againLabel}</button>
              <button onClick={onHome} className="btn-secondary">Board practice home</button>
            </div>
          </div>
        </div>
        {sectionEntries.length > 1 && (
          <div className="grid gap-3 border-t border-line bg-surface-2/60 p-5 sm:grid-cols-2">
            {sectionEntries.map(([name, s]) => {
              const sp = s.counted_max ? Math.round((Number(s.got) / Number(s.counted_max)) * 100) : null;
              const st = TONE[sp === null ? 'brand' : toneOf(sp)];
              return (
                <div key={name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">{name}</span>
                    <span className={`font-semibold tabular-nums ${st.text}`}>{fmtMarks(s.got)}{s.counted_max ? ` / ${fmtMarks(s.counted_max)}` : ''}</span>
                  </div>
                  {sp !== null && <div className="progress-track"><div className={`progress-fill ${st.fill}`} style={{ width: `${Math.min(100, sp)}%` }} /></div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingIds.length > 0 && (
        <div className="card space-y-4 border-warn/40 p-5">
          <div>
            <p className="eyebrow text-warn">Self-marking</p>
            <h2 className="section-title">Mark these yourself against the official solution</h2>
          </div>
          {pendingIds.map(id => {
            const r = res.results.find(x => x.questionId === id); const q = qMap[id];
            return (
              <div key={id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="pill bg-brand-soft text-brand-ink">{r.q_label}</span>
                  <span className="pill bg-accent-soft text-accent">{fmtMarks(r.marks)} marks</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink">{q?.question}</p>
                <div className="grid gap-2 text-xs md:grid-cols-2">
                  <div className="rounded-xl bg-surface-2 p-3"><p className="mb-1 font-semibold text-ink-3">Your answer</p><p className="whitespace-pre-wrap text-ink-2">{r.answer_text || '—'}</p></div>
                  <div className="rounded-xl border border-good/30 bg-surface-2 p-3"><p className="mb-1 font-semibold text-good">Official solution</p><p className="whitespace-pre-wrap text-ink-2">{r.solution || 'No solution available.'}</p></div>
                </div>
                {r.marking_points?.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-3">{r.marking_points.map((m, i) => <li key={i}>{m.point} ({fmtMarks(m.marks)})</li>)}</ul>}
                <label className="flex items-center gap-2 text-xs text-ink-2">My marks:
                  <input type="number" min="0" max={r.marks} step="0.5" value={self[id] ?? ''} onChange={e => setSelf(s => ({ ...s, [id]: e.target.value }))} className="input !w-24 !py-1.5" />
                  <span>out of {fmtMarks(r.marks)}</span>
                </label>
              </div>
            );
          })}
          {err && <p className="rounded-xl bg-bad-soft px-3 py-2 text-xs text-bad">{err}</p>}
          <button onClick={saveSelf} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save my marks'}</button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Breakdown</p>
          <h2 className="section-title">Question-by-question</h2>
        </div>
        <Segmented size="sm" value={filter} onChange={setFilter}
          options={[['lost', `Where I lost marks (${fmtMarks(lostMarks)})`], ['all', 'All']]} />
      </div>

      <div className="space-y-3">
        {shown.length === 0 && <p className="rounded-xl bg-good-soft p-4 text-sm font-medium text-good animate-pop">Full marks on everything you attempted. 🎉</p>}
        {shown.map(r => {
          const q = qMap[r.questionId]; const got = Number(r.marks_awarded) || 0; const full = got >= Number(r.marks) && !r.not_counted;
          const t = TONE[full ? 'good' : got > 0 ? 'warn' : 'bad'];
          return (
            <div key={r.questionId} className={`card space-y-3 border-l-4 p-5 animate-fade-in ${full ? 'border-l-good' : got > 0 ? 'border-l-warn' : 'border-l-bad'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="pill bg-brand-soft text-brand-ink">{r.q_label}</span>
                  <span className="truncate text-xs text-ink-3">{r.chapter}</span>
                </div>
                <span className={`pill tabular-nums text-sm ${t.soft} ${t.text}`}>
                  {r.marks_awarded === null ? '—' : fmtMarks(got)} / {fmtMarks(r.marks)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink">{q?.question}</p>
              {r.answer_text && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs text-ink-2"><b className="text-ink-3">Your answer: </b>{r.answer_text.startsWith('[') ? safeJoin(r.answer_text) : r.answer_text}</p>}
              {r.points_hit?.length > 0 && <ul className="space-y-0.5 text-xs text-good">{r.points_hit.map((p, i) => <li key={i}>✓ {p}</li>)}</ul>}
              {r.points_missed?.length > 0 && (
                <div className="rounded-xl bg-bad-soft p-3"><p className="mb-1 text-xs font-semibold text-bad">Missing / to add</p>
                  <ul className="space-y-0.5 text-xs text-ink-2">{r.points_missed.map((p, i) => <li key={i}>＋ {p}</li>)}</ul></div>
              )}
              {r.points_wrong?.length > 0 && <ul className="text-xs text-bad">{r.points_wrong.map((p, i) => <li key={i}>✗ {p}</li>)}</ul>}
              {r.feedback && <p className="text-xs italic text-ink-3">{r.feedback}</p>}
              <details className="group text-xs">
                <summary className="cursor-pointer font-semibold text-brand transition-colors duration-150 hover:text-brand-ink">Official solution</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-surface-2 p-3 text-ink-2 animate-fade-in">{r.solution || 'No solution available.'}</p>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function safeJoin(s) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean).join(' · ') : s; } catch { return s; } }
