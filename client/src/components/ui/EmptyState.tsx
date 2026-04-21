import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  return (
    <div className="surface-panel flex flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="rounded-full border border-line bg-page px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        Empty
      </div>
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}
