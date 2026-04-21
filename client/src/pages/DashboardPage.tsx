import { startTransition, useEffect, useState } from 'react';
import { deleteDeal, getDeals } from '../lib/api';
import { getDealLabel, sortDeals, splitDealLabel } from '../lib/deals';
import { compactNumber, currency, errorMessage, percent } from '../lib/format';
import type { CurrentUser, SavedDeal } from '../lib/types';
import { CashFlowComparisonChart } from '../components/charts/CashFlowComparisonChart';
import { ReturnsBarChart } from '../components/charts/ReturnsBarChart';
import { DealCard } from '../components/DealCard';
import { EmptyState } from '../components/ui/EmptyState';
import { ScoreBadge } from '../components/ui/ScoreBadge';
import { StatCard } from '../components/ui/StatCard';

interface DashboardPageProps {
  user: CurrentUser | null;
  isAuthLoading: boolean;
}

type RecommendationFilter = 'ALL' | 'BUY' | 'HOLD' | 'PASS';

function filterButtonClasses(filter: RecommendationFilter, activeFilter: RecommendationFilter) {
  if (filter !== activeFilter) return 'border-line bg-white text-muted hover:border-muted/40 hover:text-ink';
  if (filter === 'BUY') return 'border-green/25 bg-green-soft text-green';
  if (filter === 'PASS') return 'border-red/25 bg-red-soft text-red';
  if (filter === 'HOLD') return 'border-gold/25 bg-gold-soft text-gold';
  return 'border-blue/25 bg-blue-soft text-blue';
}

export function DashboardPage({ user, isAuthLoading }: DashboardPageProps) {
  const [deals, setDeals] = useState<SavedDeal[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextDeals = sortDeals(await getDeals());
        if (!cancelled) {
          setDeals(nextDeals);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(errorMessage(caughtError, 'Failed to load saved deals.'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const rankedDeals = sortDeals(deals);
  const recommendationCounts = {
    BUY: rankedDeals.filter((deal) => deal.analysis.summary.recommendation === 'BUY').length,
    HOLD: rankedDeals.filter((deal) => deal.analysis.summary.recommendation === 'HOLD').length,
    PASS: rankedDeals.filter((deal) => deal.analysis.summary.recommendation === 'PASS').length,
  };
  const filteredDeals = recommendationFilter === 'ALL'
    ? rankedDeals
    : rankedDeals.filter((deal) => deal.analysis.summary.recommendation === recommendationFilter);
  const selectedDeals = filteredDeals.filter((deal) => selectedIds.includes(deal.id));
  const chartDeals = selectedDeals.length >= 2 ? selectedDeals : filteredDeals.slice(0, 5);
  const bestSelectedDeal = selectedDeals.length >= 2 ? sortDeals(selectedDeals)[0] : null;
  const averageScore = filteredDeals.length
    ? (filteredDeals.reduce((sum, deal) => sum + Number(deal.analysis.summary.score || 0), 0) / filteredDeals.length).toFixed(1)
    : '0.0';
  const buyCount = filteredDeals.filter((deal) => deal.analysis.summary.recommendation === 'BUY').length;
  const topDeal = filteredDeals[0] || null;
  const totalCashFlow = filteredDeals.reduce((sum, deal) => sum + Number(deal.analysis.summary.monthlyCashFlow || 0), 0);
  const topDealLabel = topDeal ? getDealLabel(topDeal) : null;
  const topDealParts = topDealLabel ? splitDealLabel(topDealLabel) : null;
  const filterOptions: Array<{ value: RecommendationFilter; label: string; count: number }> = [
    { value: 'ALL', label: 'All', count: rankedDeals.length },
    { value: 'BUY', label: 'Buy', count: recommendationCounts.BUY },
    { value: 'HOLD', label: 'Hold', count: recommendationCounts.HOLD },
    { value: 'PASS', label: 'Pass', count: recommendationCounts.PASS },
  ];

  useEffect(() => {
    const visibleIds = new Set(filteredDeals.map((deal) => deal.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [recommendationFilter, deals]);

  function handleToggleSelect(id: string) {
    startTransition(() => {
      setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);

    try {
      await deleteDeal(id);
      startTransition(() => {
        setDeals((current) => current.filter((deal) => deal.id !== id));
        setSelectedIds((current) => current.filter((value) => value !== id));
      });
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Failed to delete deal.'));
    } finally {
      setDeletingId(null);
    }
  }

  const comparisonRows = [
    { label: 'Score', render: (deal: SavedDeal) => `${deal.analysis.summary.score}/10` },
    { label: 'After debt', render: (deal: SavedDeal) => currency(deal.analysis.summary.monthlyCashFlow) },
    { label: 'Before principal', render: (deal: SavedDeal) => currency(deal.analysis.summary.monthlyCashFlowBeforePrincipal) },
    { label: 'Cap rate', render: (deal: SavedDeal) => percent(deal.analysis.summary.capRate) },
    { label: 'Cash-on-cash', render: (deal: SavedDeal) => percent(deal.analysis.summary.cashOnCashReturn) },
    { label: 'DSCR', render: (deal: SavedDeal) => deal.analysis.summary.dscr.toFixed(2) },
    { label: 'Break-even rent', render: (deal: SavedDeal) => currency(deal.analysis.summary.breakEvenRent) },
  ];

  return (
    <div className="grid gap-6">
      <section className="surface-panel overflow-hidden p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="section-kicker">Saved deals</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Rank your pipeline and compare the best opportunities.</h1>
            <p className="mt-3 text-base leading-7 text-muted">
              Use the checkboxes to compare multiple deals side by side. The charts below fall back to your best saved deals until
              you choose a specific comparison set.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/add"
              className="rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            >
              New analysis
            </a>
            {selectedDeals.length ? (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
              >
                Clear selection
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Filter rating</span>
          {filterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRecommendationFilter(option.value)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${filterButtonClasses(option.value, recommendationFilter)}`}
            >
              {option.label} ({option.count})
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Saved deals"
            value={filteredDeals.length}
            subtitle={recommendationFilter === 'ALL' ? (user ? 'Synced to your account' : 'Server-local pipeline') : `${rankedDeals.length} total before filter`}
          />
          <StatCard label="Buy rated" value={buyCount} subtitle={`${averageScore} average score`} />
          <StatCard label="Monthly cash flow" value={currency(totalCashFlow)} subtitle="Combined after-debt cash flow" />
          <StatCard
            label="Top deal"
            value={
              topDeal && topDealParts ? (
                <div title={topDealLabel || undefined}>
                  <div className="text-[2rem] leading-[1.05] break-words">{topDealParts.primary}</div>
                  {topDealParts.secondary ? (
                    <div className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-muted">{topDealParts.secondary}</div>
                  ) : null}
                </div>
              ) : (
                'None yet'
              )
            }
            subtitle={topDeal ? `${topDeal.analysis.summary.score}/10 overall score` : 'Analyze and save your first one'}
          />
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red/20 bg-red-soft px-5 py-4 text-sm font-medium text-red">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="surface-panel h-44 animate-pulse bg-page/70" />
          ))}
        </div>
      ) : filteredDeals.length ? (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <ReturnsBarChart
              deals={chartDeals}
              title={selectedDeals.length >= 2 ? 'Selected return profile' : 'Top deals by return profile'}
              description={
                selectedDeals.length >= 2
                  ? 'Cap rate and cash-on-cash return for the deals you selected.'
                  : 'A quick read on the cap rate and leveraged return spread across your best saved deals.'
              }
            />
            <CashFlowComparisonChart
              deals={chartDeals}
              title={selectedDeals.length >= 2 ? 'Selected cash flow comparison' : 'Top deals by cash flow'}
              description={
                selectedDeals.length >= 2
                  ? 'After-debt cash flow versus before-principal cash flow for the selected deals.'
                  : 'How your best deals stack up on pure cash flow and cash flow before principal paydown.'
              }
            />
          </div>

          {bestSelectedDeal ? (
            <section className="surface-panel p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="section-kicker">Selected comparison</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    {selectedDeals.length} deals selected for side-by-side review
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Best current pick in this comparison set: <span className="font-semibold text-ink">{getDealLabel(bestSelectedDeal)}</span>
                  </p>
                </div>

                <ScoreBadge
                  recommendation={bestSelectedDeal.analysis.summary.recommendation}
                  score={bestSelectedDeal.analysis.summary.score}
                />
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-3 text-left">
                  <thead>
                    <tr>
                      <th className="px-4 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Metric</th>
                      {selectedDeals.map((deal) => {
                        const label = getDealLabel(deal);
                        const { primary, secondary } = splitDealLabel(label);

                        return (
                          <th key={deal.id} className="min-w-[240px] px-4 pb-2 align-bottom">
                            <div className="space-y-1" title={label}>
                              <div className="text-base font-semibold leading-snug text-ink">{primary}</div>
                              {secondary ? (
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{secondary}</div>
                              ) : null}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.label}>
                        <td className="rounded-l-2xl border border-line/70 bg-page/70 px-4 py-3 text-sm text-muted">{row.label}</td>
                        {selectedDeals.map((deal) => (
                          <td key={`${row.label}-${deal.id}`} className="border-y border-r border-line/70 bg-white px-4 py-3 text-sm font-medium text-ink last:rounded-r-2xl">
                            {row.render(deal)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="grid gap-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="section-kicker">Pipeline</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Saved deal cards</h2>
              </div>
              <p className="text-sm text-muted">
                {selectedDeals.length ? `${selectedDeals.length} selected for comparison` : `Top score: ${topDeal?.analysis.summary.score || 0}/10`}
              </p>
            </div>

            {filteredDeals.map((deal, index) => (
              <DealCard
                key={deal.id}
                deal={deal}
                index={index}
                selected={selectedIds.includes(deal.id)}
                onToggleSelect={handleToggleSelect}
                onDelete={handleDelete}
                isDeleting={deletingId === deal.id}
              />
            ))}
          </section>
        </>
      ) : rankedDeals.length ? (
        <EmptyState
          title={`No ${recommendationFilter.toLowerCase()}-rated deals`}
          description={`Your dashboard has saved deals, but none match the ${recommendationFilter} filter right now.`}
          actions={
            <button
              type="button"
              onClick={() => setRecommendationFilter('ALL')}
              className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
            >
              Show all deals
            </button>
          }
        />
      ) : (
        <EmptyState
          title={isAuthLoading || user ? 'No saved deals yet' : 'Your dashboard is empty'}
          description={
            isAuthLoading || user
              ? 'Run a full analysis and save a few deals to unlock comparison charts and ranked pipeline views.'
              : 'Sign in to keep a persistent saved-deal pipeline, or run a quick analysis first and come back once you have deals to compare.'
          }
          actions={
            <>
              <a
                href="/add"
                className="rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                Start analysis
              </a>
              {!user ? (
                <a
                  href="/auth/google"
                  className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
                >
                  Sign in
                </a>
              ) : null}
              <a
                href="/quick-check"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
              >
                Open quick check
              </a>
            </>
          }
        />
      )}

      {filteredDeals.length ? (
        <section className="rounded-3xl border border-line/80 bg-page/80 px-5 py-4 text-sm text-muted">
          {recommendationFilter === 'ALL'
            ? `Portfolio snapshot: ${buyCount} buy-rated deal${buyCount === 1 ? '' : 's'}, ${compactNumber(totalCashFlow)} in combined monthly after-debt cash flow, and an average score of ${averageScore}.`
            : `Filtered snapshot: ${filteredDeals.length} ${recommendationFilter.toLowerCase()}-rated deal${filteredDeals.length === 1 ? '' : 's'}, ${compactNumber(totalCashFlow)} in combined monthly after-debt cash flow, and an average score of ${averageScore}.`}
        </section>
      ) : null}
    </div>
  );
}
