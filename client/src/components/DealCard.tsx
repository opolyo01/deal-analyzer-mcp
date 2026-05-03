import { Link } from 'react-router-dom';
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
  const detailHref = `/add?deal=${deal.id}`;

  return (
    <article className={`surface-panel p-5 transition-all ${selected ? 'ring-1 ring-gold/30 border-gold/20' : ''}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex gap-4">
          <input
            type="checkbox"
            className="mt-1.5 h-4 w-4 rounded accent-[#d49838]"
            checked={selected}
            onChange={() => onToggleSelect(deal.id)}
            aria-label={`Select ${getDealLabel(deal)} for comparison`}
          />

          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/60">#{String(index + 1).padStart(2, '0')}</span>
              <span className="font-mono text-xs text-muted/60">{formatDate(deal.createdAt)}</span>
            </div>

            <h3 className="mt-1.5 font-display text-xl font-700 tracking-tight text-ink">
              <Link to={detailHref} className="hover:text-gold transition-colors">
                {getDealLabel(deal)}
              </Link>
            </h3>
            <p className="mt-1 text-sm text-muted">{getDealSubtitle(deal)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-end">
          <ScoreBadge recommendation={summary.recommendation} score={summary.score} />
          <Link
            to={detailHref}
            className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-muted hover:border-line/80 hover:text-ink"
          >
            Open analysis
          </Link>
          <button
            type="button"
            onClick={() => onDelete(deal.id)}
            disabled={isDeleting}
            className="rounded-lg border border-red/20 px-4 py-2 text-xs font-medium text-red/70 hover:border-red/40 hover:text-red"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {primaryStrength ? (
            <div className="rounded-xl border border-green/20 bg-green-soft p-3 text-xs leading-5 text-green/90">
              <span className="font-semibold">Strength —</span> {primaryStrength}
            </div>
          ) : null}
          {primaryRisk ? (
            <div className="rounded-xl border border-red/20 bg-red-soft p-3 text-xs leading-5 text-red/90">
              <span className="font-semibold">Risk —</span> {primaryRisk}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
