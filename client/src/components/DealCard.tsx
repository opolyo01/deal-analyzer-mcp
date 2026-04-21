import { currency, formatDate, percent } from '../lib/format';
import { getDealLabel, getDealSubtitle } from '../lib/deals';
import type { SavedDeal } from '../lib/types';
import { MetricCard } from './ui/MetricCard';
import { ScoreBadge } from './ui/ScoreBadge';

interface DealCardProps {
  deal: SavedDeal;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export function DealCard({ deal, index, selected, onToggleSelect, onDelete, isDeleting }: DealCardProps) {
  const summary = deal.analysis.summary;
  const primaryRisk = deal.analysis.risks[0] || null;
  const primaryStrength = deal.analysis.strengths[0] || null;

  return (
    <article className={`surface-panel p-5 transition ${selected ? 'ring-2 ring-green/20' : ''}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-[var(--green)]"
            checked={selected}
            onChange={() => onToggleSelect(deal.id)}
            aria-label={`Select ${getDealLabel(deal)} for comparison`}
          />

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted/70">Rank {index + 1}</p>
              <p className="text-sm text-muted">{formatDate(deal.createdAt)}</p>
            </div>

            <h3 className="mt-1 text-xl font-semibold tracking-tight">{getDealLabel(deal)}</h3>
            <p className="mt-1 text-sm text-muted">{getDealSubtitle(deal)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:flex-col xl:items-end">
          <ScoreBadge recommendation={summary.recommendation} score={summary.score} />
          <button
            type="button"
            onClick={() => onDelete(deal.id)}
            disabled={isDeleting}
            className="rounded-full border border-red/20 bg-white px-4 py-2 text-sm font-semibold text-red hover:border-red/40"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="After debt" value={currency(summary.monthlyCashFlow)} compact tone={summary.monthlyCashFlow >= 0 ? 'positive' : 'negative'} />
        <MetricCard
          label="Before principal"
          value={currency(summary.monthlyCashFlowBeforePrincipal)}
          compact
          tone={summary.monthlyCashFlowBeforePrincipal >= 0 ? 'accent' : 'negative'}
        />
        <MetricCard label="Cap rate" value={percent(summary.capRate)} compact />
        <MetricCard label="Cash-on-cash" value={percent(summary.cashOnCashReturn)} compact />
      </div>

      {primaryStrength || primaryRisk ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {primaryStrength ? (
            <div className="rounded-2xl border border-green/20 bg-green-soft/70 p-3 text-sm leading-6 text-green">
              <span className="font-semibold">Strength:</span> {primaryStrength}
            </div>
          ) : null}
          {primaryRisk ? (
            <div className="rounded-2xl border border-red/20 bg-red-soft/70 p-3 text-sm leading-6 text-red">
              <span className="font-semibold">Risk:</span> {primaryRisk}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
