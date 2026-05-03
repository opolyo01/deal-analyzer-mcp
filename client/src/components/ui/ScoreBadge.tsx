interface ScoreBadgeProps {
  recommendation: string;
  score: number;
}

function verdictClass(recommendation: string) {
  const n = recommendation.toLowerCase();
  if (n === 'buy') return 'verdict-buy';
  if (n === 'pass') return 'verdict-pass';
  return 'verdict-hold';
}

function borderClass(recommendation: string) {
  const n = recommendation.toLowerCase();
  if (n === 'buy') return 'border-green/20 bg-green-soft';
  if (n === 'pass') return 'border-red/20 bg-red-soft';
  return 'border-gold/20 bg-gold-soft';
}

export function ScoreBadge({ recommendation, score }: ScoreBadgeProps) {
  return (
    <div className={`inline-flex items-center gap-3 rounded-xl border px-4 py-2.5 ${borderClass(recommendation)}`}>
      <span className={`font-display text-sm font-700 uppercase tracking-wider ${verdictClass(recommendation)}`}>
        {recommendation}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted">{score}/10</span>
    </div>
  );
}
