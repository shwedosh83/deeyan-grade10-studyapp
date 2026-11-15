import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubject } from '../../context/SubjectContext';
import BoardSprint from './BoardSprint';
import BoardApplied from './BoardApplied';
import { Segmented } from './ui';

const COPY = {
  competency: {
    eyebrow: 'Competency practice',
    blurb: s => `Questions from CISCE's official competency-focused item bank for ${s}. They test applying ideas to unfamiliar situations, reading data and diagrams, and reasoning, the kind of question the board has been adding since 2024.`,
  },
  classwork: {
    eyebrow: 'School tests',
    blurb: s => `Questions from your own ${s} class tests and worksheets, with the model answers. Retry the ones that cost you marks.`,
  },
};

// Practice drawn from one source only: the CISCE competency bank, or his uploaded school tests.
// Quick-fire = objective items (Sprint engine); Written = subjective items (Applied engine).
export default function BoardCompetency({ source = 'competency' }) {
  const { subject } = useSubject();
  const [tab, setTab] = useState('quick');
  const copy = COPY[source];
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="max-w-2xl">
        <p className="eyebrow">{copy.eyebrow}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{copy.blurb(subject.label)}</p>
        {source === 'classwork' && <Link to="/school" className="mt-1 inline-block text-xs font-semibold text-brand hover:text-brand-ink">Upload another test →</Link>}
      </div>
      <Segmented value={tab} onChange={setTab} options={[['quick', 'Quick-fire (marked instantly)'], ['written', 'Written answers']]} />
      {tab === 'quick'
        ? <BoardSprint key={`quick-${source}`} fixedSource={source} />
        : <BoardApplied key={`written-${source}`} fixedSource={source} />}
    </div>
  );
}
