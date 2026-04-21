import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  subtitle?: ReactNode;
}

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      <div className="mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}
