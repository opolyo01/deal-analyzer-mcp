import type { ReactNode } from 'react';

type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';

const toneClasses: Record<MetricTone, string> = {
  neutral: 'border-line bg-surface',
  positive: 'border-green/20 bg-green-soft',
  negative: 'border-red/20 bg-red-soft',
  accent: 'border-blue/20 bg-blue-soft',
};

const valueToneClasses: Record<MetricTone, string> = {
  neutral: 'text-ink',
  positive: 'text-green',
  negative: 'text-red',
  accent: 'text-blue',
};

interface MetricCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
  compact?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
  compact = false,
  className = '',
}: MetricCardProps) {
  return (
    <div className={`rounded-xl border ${toneClasses[tone]} ${compact ? 'p-4' : 'p-5'} ${className}`.trim()}>
      <p className="section-kicker">{label}</p>
      <div className={`mt-2 font-mono font-semibold tabular-nums tracking-tight ${valueToneClasses[tone]} ${compact ? 'text-xl' : 'text-3xl'}`}>
        {value}
      </div>
      {hint ? <p className="mt-2 text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}
