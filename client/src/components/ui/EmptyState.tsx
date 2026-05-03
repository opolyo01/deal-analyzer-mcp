import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <div className="surface-panel flex flex-col items-center justify-center gap-5 p-12 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/50">— empty —</div>
      <div className="space-y-2">
        <h3 className="font-display text-2xl font-700 tracking-tight text-ink">{title}</h3>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
