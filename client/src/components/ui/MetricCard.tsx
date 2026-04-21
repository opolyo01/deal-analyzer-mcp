import type { ReactNode } from 'react';

type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';

const toneClasses: Record<MetricTone, string> = {
  neutral: 'border-line/80 bg-page/70',
  positive: 'border-green/20 bg-green-soft/75',
  negative: 'border-red/20 bg-red-soft/75',
  accent: 'border-blue/20 bg-blue-soft/75',
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
    <div className={`rounded-2xl border ${toneClasses[tone]} ${compact ? 'p-4' : 'p-5'} ${className}`.trim()}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className={`mt-2 font-semibold tracking-tight ${compact ? 'text-xl' : 'text-3xl'}`}>{value}</div>
      {hint ? <p className="mt-2 text-sm leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}
