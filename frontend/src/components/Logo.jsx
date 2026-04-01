/**
 * MyAICoach logo — two coloured bars + wordmark
 * size: "sm" | "md" | "lg"
 * dark: true = white text (for navy backgrounds), false = navy text (for light backgrounds)
 */
export default function Logo({ size = 'md', dark = true }) {
  const bar  = { sm: 'w-2 h-5', md: 'w-2.5 h-7', lg: 'w-3 h-9' }[size];
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];

  return (
    <div className="flex items-center gap-2.5">
      {/* Two-bar mark */}
      <div className="flex gap-0.5 shrink-0">
        <span className={`${bar} rounded-sm bg-barca-red`} />
        <span className={`${bar} rounded-sm bg-barca-gold`} />
      </div>
      {/* Wordmark */}
      <span className={`font-extrabold tracking-tight ${text} ${dark ? 'text-white' : 'text-barca-navy'}`}>
        MyAICoach
      </span>
    </div>
  );
}
