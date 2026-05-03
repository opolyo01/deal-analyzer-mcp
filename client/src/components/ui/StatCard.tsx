import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
}

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="surface-panel p-5">
      <p className="section-kicker">{label}</p>
      <div className="mt-3 font-mono text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</div>
      {subtitle ? <p className="mt-2 text-xs text-muted">{subtitle}</p> : null}
    </div>
  );
}
