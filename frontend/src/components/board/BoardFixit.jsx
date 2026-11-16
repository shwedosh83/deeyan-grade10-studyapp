import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import BoardSprint from './BoardSprint';
import BoardApplied from './BoardApplied';
import { Segmented } from './ui';

// Runs the fix-it set chosen on the Error log page (questions aligned to this subject's open errors).
export default function BoardFixit() {
  const { subject } = useSubject();
  let set = null;
  try { set = JSON.parse(sessionStorage.getItem(`fm_fixit_${subject.id}`) || 'null'); } catch { set = null; }
  const [tab, setTab] = useState(set?.quick?.length ? 'quick' : 'written');

  if (!set || (!set.quick?.length && !set.written?.length)) return (
    <div className="card p-6 text-sm text-ink-2">
      No fix-it set is ready for {subject.label}. <Link to="/errors" className="font-semibold text-brand hover:text-brand-ink">Choose one from the error log →</Link>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="max-w-2xl">
        <p className="eyebrow">Closing the loop</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {set.quick.length + set.written.length} questions picked for the {subject.label} mistakes you haven't fixed yet: the questions you got wrong (once a few days have passed) and others that test the same idea. Get them right on two different days and the mistake closes.
        </p>
        <Link to="/errors" className="mt-1 inline-block text-xs font-semibold text-brand hover:text-brand-ink">← Back to the error log</Link>
      </div>
      {set.quick.length > 0 && set.written.length > 0 && (
        <Segmented value={tab} onChange={setTab} options={[['quick', `Quick-fire · ${set.quick.length}`], ['written', `Written answers · ${set.written.length}`]]} />
      )}
      {tab === 'quick' && set.quick.length > 0
        ? <BoardSprint key="fix-quick" fixedIds={set.quick} />
        : <BoardApplied key="fix-written" fixedIds={set.written} />}
    </div>
  );
}
