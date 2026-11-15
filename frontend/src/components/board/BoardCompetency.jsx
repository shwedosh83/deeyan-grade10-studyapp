import { useState } from 'react';
import { useSubject } from '../../context/SubjectContext';
import BoardSprint from './BoardSprint';
import BoardApplied from './BoardApplied';
import { Segmented } from './ui';

// Competency practice: only the official CISCE competency-focused item bank.
// Quick-fire = its objective items (Sprint engine); Written = its subjective items (Applied engine).
export default function BoardCompetency() {
  const { subject } = useSubject();
  const [tab, setTab] = useState('quick');
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="max-w-2xl">
        <p className="eyebrow">Competency practice</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          Questions from CISCE's official competency-focused item bank for {subject.label}. They test applying ideas to unfamiliar situations, reading data and diagrams, and reasoning, the kind of question the board has been adding since 2024.
        </p>
      </div>
      <Segmented value={tab} onChange={setTab} options={[['quick', 'Quick-fire (marked instantly)'], ['written', 'Written answers']]} />
      {tab === 'quick'
        ? <BoardSprint key="quick" fixedSource="competency" />
        : <BoardApplied key="written" fixedSource="competency" />}
    </div>
  );
}
