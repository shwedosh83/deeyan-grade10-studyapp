import { useState } from 'react';
import { boardApi, fmtMarks, fmtTime, pickSection } from '../../lib/board';

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
  const tone = pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-500' : 'text-red-500';

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

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500">{title}</p>
        <p className={`text-5xl font-bold mt-1 ${tone}`}>{fmtMarks(res.score)} <span className="text-2xl text-gray-400">/ {fmtMarks(res.maxScore)}</span></p>
        <p className="text-gray-500 text-sm mt-1">{pct}%{seconds ? ` · ${fmtTime(seconds)} used` : ''}</p>
        {pendingIds.length > 0 && <p className="text-xs text-amber-600 mt-2">{pendingIds.length} question{pendingIds.length > 1 ? 's' : ''} need your own marks (below). The total updates when you save them.</p>}
        {showSections && res.sections && Object.keys(res.sections).length > 1 && (
          <div className="flex gap-2 justify-center flex-wrap mt-4">
            {Object.entries(res.sections).map(([name, s]) => (
              <span key={name} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">{name}: <b>{fmtMarks(s.got)}</b>{s.counted_max ? ` / ${fmtMarks(s.counted_max)}` : ''}</span>
            ))}
          </div>
        )}
        <div className="flex gap-3 justify-center mt-5">
          <button onClick={onAgain} className="bg-barca-navy hover:bg-barca-navy-dark text-white font-semibold px-5 py-2 rounded-lg text-sm">{againLabel}</button>
          <button onClick={onHome} className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2 rounded-lg text-sm">Board practice home</button>
        </div>
      </div>

      {pendingIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-800">Mark these yourself against the official solution</p>
          {pendingIds.map(id => {
            const r = res.results.find(x => x.questionId === id); const q = qMap[id];
            return (
              <div key={id} className="bg-white rounded-lg border border-amber-100 p-3 space-y-2">
                <p className="text-xs font-bold text-barca-navy">{r.q_label} <span className="text-gray-400 font-normal">· {fmtMarks(r.marks)} marks</span></p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{q?.question}</p>
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-50 rounded p-2"><p className="font-semibold text-gray-500 mb-1">Your answer</p><p className="whitespace-pre-wrap">{r.answer_text || '—'}</p></div>
                  <div className="bg-emerald-50 rounded p-2"><p className="font-semibold text-emerald-700 mb-1">Official solution</p><p className="whitespace-pre-wrap">{r.solution || 'No solution available.'}</p></div>
                </div>
                {r.marking_points?.length > 0 && <ul className="text-xs text-gray-500 list-disc pl-5">{r.marking_points.map((m, i) => <li key={i}>{m.point} ({fmtMarks(m.marks)})</li>)}</ul>}
                <label className="text-xs text-gray-600 flex items-center gap-2">My marks:
                  <input type="number" min="0" max={r.marks} step="0.5" value={self[id] ?? ''} onChange={e => setSelf(s => ({ ...s, [id]: e.target.value }))} className="border-2 border-gray-200 rounded px-2 py-1 w-20 text-sm" />
                  <span>out of {fmtMarks(r.marks)}</span>
                </label>
              </div>
            );
          })}
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button onClick={saveSelf} disabled={saving} className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white text-sm font-semibold px-4 py-2 rounded-lg">{saving ? 'Saving…' : 'Save my marks'}</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Question-by-question</h2>
        <div className="flex gap-1 text-xs">
          <button onClick={() => setFilter('lost')} className={`px-3 py-1 rounded-full ${filter === 'lost' ? 'bg-barca-navy text-white' : 'bg-gray-100 text-gray-600'}`}>Where I lost marks ({fmtMarks(lostMarks)})</button>
          <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full ${filter === 'all' ? 'bg-barca-navy text-white' : 'bg-gray-100 text-gray-600'}`}>All</button>
        </div>
      </div>

      <div className="space-y-3">
        {shown.length === 0 && <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg p-4">Full marks on everything you attempted. 🎉</p>}
        {shown.map(r => {
          const q = qMap[r.questionId]; const got = Number(r.marks_awarded) || 0; const full = got >= Number(r.marks) && !r.not_counted;
          return (
            <div key={r.questionId} className={`bg-white rounded-xl border p-4 space-y-2 ${full ? 'border-emerald-200' : got > 0 ? 'border-amber-200' : 'border-red-200'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-barca-navy">{r.q_label} <span className="text-gray-400 font-normal">· {r.chapter}</span></p>
                <span className={`text-sm font-bold tabular-nums ${full ? 'text-emerald-600' : got > 0 ? 'text-amber-600' : 'text-red-500'}`}>
                  {r.marks_awarded === null ? '—' : fmtMarks(got)} / {fmtMarks(r.marks)}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{q?.question}</p>
              {r.answer_text && <p className="text-xs bg-gray-50 rounded p-2 whitespace-pre-wrap"><b className="text-gray-500">Your answer: </b>{r.answer_text.startsWith('[') ? safeJoin(r.answer_text) : r.answer_text}</p>}
              {r.points_hit?.length > 0 && <ul className="text-xs text-emerald-700 space-y-0.5">{r.points_hit.map((p, i) => <li key={i}>✓ {p}</li>)}</ul>}
              {r.points_missed?.length > 0 && (
                <div className="bg-red-50 rounded p-2"><p className="text-xs font-semibold text-red-700 mb-1">Missing / to add</p>
                  <ul className="text-xs text-red-700 space-y-0.5">{r.points_missed.map((p, i) => <li key={i}>＋ {p}</li>)}</ul></div>
              )}
              {r.points_wrong?.length > 0 && <ul className="text-xs text-red-700">{r.points_wrong.map((p, i) => <li key={i}>✗ {p}</li>)}</ul>}
              {r.feedback && <p className="text-xs text-gray-500 italic">{r.feedback}</p>}
              <details className="text-xs">
                <summary className="cursor-pointer text-barca-navy font-medium">Official solution</summary>
                <p className="mt-1 whitespace-pre-wrap bg-emerald-50 rounded p-2 text-emerald-900">{r.solution || 'No solution available.'}</p>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function safeJoin(s) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean).join(' · ') : s; } catch { return s; } }
