// Custom SVG Spider/Radar chart for skill visualization
const BIOLOGY_SKILLS = [
  'Cell Biology',
  'Genetics & Heredity',
  'Plant Physiology',
  'Human Physiology',
  'Nervous System & Coordination',
  'Reproduction',
  'Ecology & Environment',
  'Diagrams & Experiments',
];

const HC_SKILLS = [
  'Indian Freedom Struggle',
  'Gandhi & Mass Movements',
  'Independence & Partition',
  'World Wars & Fascism',
  'International Organisations',
  'Indian Constitution',
  'Executive & Parliament',
  'Judiciary',
];

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
};

export function getSkillsForSubject(subjectId) {
  return subjectId === 'biology' ? BIOLOGY_SKILLS : HC_SKILLS;
}

export default function SkillRadar({ skillScores, subjectId }) {
  const skills = getSkillsForSubject(subjectId);
  const N = skills.length;
  const SIZE = 340;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 100; // outer radius

  // Aggregate accuracy per skill across all chapters
  const skillMap = {};
  skills.forEach(s => { skillMap[s] = { correct: 0, total: 0 }; });

  skillScores.forEach(row => {
    if (skillMap[row.skill]) {
      skillMap[row.skill].correct += row.correct_attempts;
      skillMap[row.skill].total += row.total_attempts;
    }
  });

  const accuracies = skills.map(s => {
    const { correct, total } = skillMap[s];
    return total > 0 ? correct / total : 0;
  });

  // Convert polar to cartesian
  function polar(angle, r) {
    const a = (angle - 90) * (Math.PI / 180);
    return {
      x: CX + r * Math.cos(a),
      y: CY + r * Math.sin(a),
    };
  }

  const angleStep = 360 / N;

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0];

  // Build polygon points for data
  const dataPoints = accuracies.map((acc, i) => {
    const p = polar(i * angleStep, acc * R);
    return `${p.x},${p.y}`;
  }).join(' ');

  // Build grid polygon points for each ring
  function ringPoints(factor) {
    return skills.map((_, i) => {
      const p = polar(i * angleStep, factor * R);
      return `${p.x},${p.y}`;
    }).join(' ');
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Skill Overview</h2>
      <div className="flex flex-col items-center gap-10 sm:flex-row sm:items-center">
        {/* SVG Chart — overflow:visible so labels outside bounds show */}
        <div className="shrink-0 pl-16 pr-8">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible">
          {/* Grid rings */}
          {rings.map((r, ri) => (
            <polygon
              key={ri}
              points={ringPoints(r)}
              fill="none"
              stroke={ri === rings.length - 1 ? '#CBD5E1' : '#E2E8F0'}
              strokeWidth={ri === rings.length - 1 ? 1.5 : 1}
            />
          ))}

          {/* Axis lines */}
          {skills.map((_, i) => {
            const outer = polar(i * angleStep, R);
            return (
              <line
                key={i}
                x1={CX} y1={CY}
                x2={outer.x} y2={outer.y}
                stroke="#E2E8F0"
                strokeWidth={1}
              />
            );
          })}

          {/* Data polygon */}
          <polygon
            points={dataPoints}
            fill="#004D98"
            fillOpacity={0.15}
            stroke="#004D98"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Data points */}
          {accuracies.map((acc, i) => {
            const p = polar(i * angleStep, acc * R);
            return (
              <circle
                key={i}
                cx={p.x} cy={p.y} r={4}
                fill="#004D98"
                stroke="white"
                strokeWidth={2}
              />
            );
          })}

          {/* Ring labels (%) */}
          {rings.map((r, ri) => {
            const p = polar(0, r * R);
            return (
              <text
                key={ri}
                x={p.x + 4} y={p.y - 2}
                fontSize={8}
                fill="#94A3B8"
              >
                {r * 100}%
              </text>
            );
          })}

          {/* Axis labels */}
          {skills.map((skill, i) => {
            const angle = i * angleStep;
            const labelR = R + 28;
            const p = polar(angle, labelR);
            const label = SHORT_LABELS[skill] || skill;

            let anchor = 'middle';
            if (p.x < CX - 8) anchor = 'end';
            else if (p.x > CX + 8) anchor = 'start';

            return (
              <text
                key={i}
                x={p.x} y={p.y}
                fontSize={9.5}
                fontWeight={500}
                fill="#374151"
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {label}
              </text>
            );
          })}
        </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-2 w-full">
          {skills.map((skill, i) => {
            const { correct, total } = skillMap[skill];
            const acc = total > 0 ? Math.round((correct / total) * 100) : null;
            const color = acc === null ? 'bg-gray-200' : acc >= 70 ? 'bg-barca-navy' : acc >= 40 ? 'bg-amber-400' : 'bg-barca-red';
            const textColor = acc === null ? 'text-gray-400' : acc >= 70 ? 'text-barca-navy' : acc >= 40 ? 'text-amber-500' : 'text-barca-red';

            return (
              <div key={skill} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                <span className="text-xs text-gray-600 flex-1">{skill}</span>
                <span className={`text-xs font-semibold w-12 text-right ${textColor}`}>
                  {acc !== null ? `${acc}%` : '—'}
                </span>
                <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: acc !== null ? `${acc}%` : '0%' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
