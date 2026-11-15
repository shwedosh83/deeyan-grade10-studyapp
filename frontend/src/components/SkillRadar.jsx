// SVG radar of real accuracy (per skill or per chapter) from useProgress(). Needs at least 3 data points.
import { bandOf } from './progress/bands';

// Short display labels for the radar axes
const SHORT_LABELS = {
  'Cell Biology': 'Cell Biology',
  'Genetics & Heredity': 'Genetics',
  'Plant Physiology': 'Plant Physio.',
  'Human Physiology': 'Human Physio.',
  'Nervous System & Coordination': 'Nervous System',
  'Reproduction': 'Reproduction',
  'Ecology & Environment': 'Ecology',
  'Diagrams & Experiments': 'Diagrams',
  'Indian Freedom Struggle': 'Freedom Struggle',
  'Gandhi & Mass Movements': 'Gandhi & Mvmts',
  'Independence & Partition': 'Independence',
  'World Wars & Fascism': 'World Wars',
  'International Organisations': 'Intl. Orgs',
  'Indian Constitution': 'Constitution',
  'Executive & Parliament': 'Executive',
  'Judiciary': 'Judiciary',
  'Periodic Table & Properties': 'Periodic Table',
  'Chemical Bonding': 'Bonding',
  'Acids, Bases & Salts': 'Acids & Bases',
  'Analytical Chemistry': 'Analytical',
  'Mole Concept & Stoichiometry': 'Mole Concept',
  'Electrolysis': 'Electrolysis',
  'Metallurgy': 'Metallurgy',
  'Study of Compounds': 'Compounds',
  'Organic Chemistry': 'Organic',
  'Force: Turning Forces and Uniform Circular Motion': 'Force & Circular',
  'Electricity and Magnetism': 'Electricity & Magn.',
  'Location and Physical Features': 'Location',
  'Climate and Monsoon': 'Climate',
  'Natural Vegetation': 'Vegetation',
  'Mineral Resources': 'Minerals',
  'Energy Resources': 'Energy',
  'Agriculture and Crops': 'Agriculture',
  'Manufacturing Industries': 'Industries',
};


const shorten = (label) => {
  if (SHORT_LABELS[label]) return SHORT_LABELS[label];
  return label.length > 20 ? `${label.slice(0, 18).trim()}…` : label;
};

// points: [{ label, accuracy (0–100), answered, correct }] — straight from progress data, nothing filled in.
export default function SkillRadar({ points = [], title = 'Skill overview', basis = 'skill', emptyAction = null }) {
  const N = points.length;

  if (N < 3) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Shape of your strengths</p>
        <h2 className="section-title mt-0.5">{title}</h2>
        <div className="mt-4 rounded-xl bg-surface-2 p-6 text-center">
          <p className="text-sm text-ink-2">
            The radar needs at least 3 {basis === 'chapter' ? 'chapters' : 'topics'} with answers — you have {N} so far. Practise a few more chapters to fill it in.
          </p>
          {emptyAction && <div className="mt-4">{emptyAction}</div>}
        </div>
      </div>
    );
  }

  const SIZE = 340, CX = SIZE / 2, CY = SIZE / 2, R = 100;
  const angleStep = 360 / N;
  const rings = [0.25, 0.5, 0.75, 1.0];
  const polar = (angle, r) => {
    const a = (angle - 90) * (Math.PI / 180);
    return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
  };
  const ringPoints = f => points.map((_, i) => { const p = polar(i * angleStep, f * R); return `${p.x},${p.y}`; }).join(' ');
  const dataPoints = points.map((pt, i) => { const p = polar(i * angleStep, ((pt.accuracy ?? 0) / 100) * R); return `${p.x},${p.y}`; }).join(' ');

  return (
    <div className="card p-6">
      <p className="eyebrow">Shape of your strengths</p>
      <h2 className="section-title mt-0.5">{title}</h2>
      <p className="mt-1 text-xs text-ink-3">Accuracy per {basis}, from every answer you've given in this subject.</p>
      <div className="mt-4 flex flex-col items-center gap-10 lg:flex-row">
        <div className="shrink-0 pl-16 pr-8">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible" role="img" aria-label={`${title} radar chart`}>
            {rings.map((r, ri) => (
              <polygon key={ri} points={ringPoints(r)} className="fill-none stroke-line" strokeWidth={ri === rings.length - 1 ? 1.5 : 1} />
            ))}
            {points.map((_, i) => {
              const o = polar(i * angleStep, R);
              return <line key={i} x1={CX} y1={CY} x2={o.x} y2={o.y} className="stroke-line" strokeWidth={1} />;
            })}
            <polygon points={dataPoints} className="fill-brand/15 stroke-brand transition-all duration-300" strokeWidth={2} strokeLinejoin="round" />
            {points.map((pt, i) => {
              const p = polar(i * angleStep, ((pt.accuracy ?? 0) / 100) * R);
              return <circle key={i} cx={p.x} cy={p.y} r={4} className="fill-brand stroke-surface" strokeWidth={2}><title>{`${pt.label}: ${pt.accuracy}% (${pt.correct}/${pt.answered})`}</title></circle>;
            })}
            {rings.map((r, ri) => {
              const p = polar(0, r * R);
              return <text key={ri} x={p.x + 4} y={p.y - 2} fontSize={8} className="fill-ink-3">{r * 100}%</text>;
            })}
            {points.map((pt, i) => {
              const p = polar(i * angleStep, R + 28);
              const anchor = p.x < CX - 8 ? 'end' : p.x > CX + 8 ? 'start' : 'middle';
              return (
                <text key={i} x={p.x} y={p.y} fontSize={9.5} fontWeight={500} className="fill-ink-2" textAnchor={anchor} dominantBaseline="middle">
                  {shorten(pt.label)}
                </text>
              );
            })}
          </svg>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          {points.map(pt => {
            const b = bandOf(pt.accuracy, pt.answered);
            return (
              <div key={pt.label} className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${b.dot}`} />
                <span className="flex-1 truncate text-xs text-ink-2" title={pt.label}>{pt.label}</span>
                <span className="text-[11px] text-ink-3">{pt.correct}/{pt.answered}</span>
                <span className={`w-10 text-right text-xs font-semibold ${b.text}`}>{pt.accuracy}%</span>
                <div className="progress-track h-1.5 w-20">
                  <div className={`progress-fill ${b.bar}`} style={{ width: `${pt.accuracy}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
