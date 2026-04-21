interface ScoreBadgeProps {
  recommendation: string;
  score: number;
}

function badgeClasses(recommendation: string) {
  const normalized = recommendation.toLowerCase();
  if (normalized === 'buy') return 'border-green/25 bg-green-soft text-green';
  if (normalized === 'pass') return 'border-red/25 bg-red-soft text-red';
  return 'border-gold/25 bg-gold-soft text-gold';
}

export function ScoreBadge({ recommendation, score }: ScoreBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${badgeClasses(recommendation)}`}>
      <span>{recommendation}</span>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs text-ink">{score}/10</span>
    </div>
  );
}
