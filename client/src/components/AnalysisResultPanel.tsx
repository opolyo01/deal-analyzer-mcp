import { currency, number, percent } from '../lib/format';
import type { DealAnalysis } from '../lib/types';
import { ExpensePieChart } from './charts/ExpensePieChart';
import { ProjectionChart } from './charts/ProjectionChart';
import { ScoreGauge } from './charts/ScoreGauge';
import { MetricCard } from './ui/MetricCard';
import { ScoreBadge } from './ui/ScoreBadge';

interface AnalysisResultPanelProps {
  analysis: DealAnalysis | null;
  photoUrl: string | null;
  parserNotes: string[];
  savedId: string | null;
  isStale: boolean;
}

export function AnalysisResultPanel({ analysis, photoUrl, parserNotes, savedId, isStale }: AnalysisResultPanelProps) {
  if (!analysis) {
    return (
      <section className="surface-panel p-6">
        <p className="section-kicker">Result</p>
        <div className="mt-4 rounded-3xl border border-dashed border-line bg-page/70 p-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">No analysis yet</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Paste a listing URL or fill in the deal form, then run an analysis to see score, expenses, and long-term cash flow.
          </p>
        </div>
      </section>
    );
  }

  const summary = analysis.summary;
  const input = analysis.input;
  const breakdown = summary.monthlyExpenseBreakdown;
  const expenseRows = [
    { label: 'Debt payment (P&I)', value: breakdown.debtPayment ?? breakdown.mortgage ?? summary.monthlyMortgage },
    { label: 'Interest portion', value: breakdown.interest ?? summary.monthlyInterest },
    { label: 'Principal paydown', value: breakdown.principalPaydown ?? summary.monthlyPrincipalPaydown },
    { label: 'Taxes', value: breakdown.taxes },
    { label: 'Insurance', value: breakdown.insurance },
    { label: 'HOA', value: breakdown.hoa },
    { label: 'Other monthly costs', value: breakdown.otherMonthlyCosts },
    { label: 'Vacancy reserve', value: breakdown.vacancy },
    { label: 'Repairs reserve', value: breakdown.repairs },
    { label: 'Capex reserve', value: breakdown.capex },
    { label: 'Management', value: breakdown.management },
  ];

  const estimatedNotes: string[] = [];
  if (summary.estimatedInputs.rent && summary.marketRent) {
    estimatedNotes.push(
      `Rent was estimated at ${currency(summary.marketRent.rent)} per month with ${summary.marketRent.confidence || 'low'} confidence.`,
    );
  }
  if (summary.estimatedInputs.taxes && input.taxEstimate) {
    estimatedNotes.push(`Taxes were estimated from ${input.taxEstimate.state || 'default'} location assumptions.`);
  }
  if (summary.estimatedInputs.insurance && input.insuranceEstimate) {
    estimatedNotes.push('Insurance was estimated from property type and location heuristics.');
  }

  return (
    <div className="grid min-w-0 gap-5">
      <section className="surface-panel p-6">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={input.address || input.label || 'Listing'}
            className="mb-5 h-56 w-full rounded-3xl object-cover"
          />
        ) : null}

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="section-kicker">Latest analysis</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">{input.label || input.address || 'Current deal'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {input.address || input.propertyType || 'Rental investment analysis'} {input.price ? `at ${currency(input.price)}` : ''}
            </p>
            {savedId ? <p className="mt-3 text-sm font-medium text-green">Saved to your dashboard.</p> : null}
          </div>

          <ScoreBadge recommendation={summary.recommendation} score={summary.score} />
        </div>

        {isStale ? (
          <div className="mt-4 rounded-2xl border border-gold/30 bg-gold-soft px-4 py-3 text-sm font-medium text-gold">
            Form values changed after the last analysis. Run it again to refresh the charts and metrics.
          </div>
        ) : null}

        {parserNotes.length ? (
          <div className="mt-4 rounded-2xl border border-line/70 bg-page/70 px-4 py-3 text-sm leading-6 text-muted">
            <span className="font-semibold text-ink">Import notes:</span> {parserNotes.join(' ')}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="After debt"
            value={currency(summary.monthlyCashFlow)}
            tone={summary.monthlyCashFlow >= 0 ? 'positive' : 'negative'}
          />
          <MetricCard
            label="Before principal"
            value={currency(summary.monthlyCashFlowBeforePrincipal)}
            tone={summary.monthlyCashFlowBeforePrincipal >= 0 ? 'accent' : 'negative'}
          />
          <MetricCard label="Cap rate" value={percent(summary.capRate)} />
          <MetricCard label="Cash-on-cash" value={percent(summary.cashOnCashReturn)} />
          <MetricCard label="DSCR" value={number(summary.dscr, 2)} />
          <MetricCard label="Break-even rent" value={currency(summary.breakEvenRent)} />
          <MetricCard label="Rent used" value={currency(input.rent)} />
          <MetricCard label="Principal paydown" value={currency(summary.monthlyPrincipalPaydown)} />
        </div>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(260px,0.82fr),minmax(0,1.18fr)] xl:items-start">
        <ScoreGauge score={summary.score} recommendation={summary.recommendation} />
        <ExpensePieChart summary={summary} />
      </div>

      <ProjectionChart analysis={analysis} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
        <section className="surface-panel p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="section-kicker">Expense detail</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">Monthly cost stack</h3>
            </div>
            <p className="text-sm text-muted">{currency(summary.monthlyAllInCost)} total cash out</p>
          </div>

          <div className="mt-5 space-y-3">
            {expenseRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-2xl border border-line/70 bg-page/70 px-4 py-3">
                <span className="text-sm text-ink">{row.label}</span>
                <span className="text-sm font-semibold text-muted">{currency(row.value)}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-5">
          <section className="surface-panel p-6">
            <p className="section-kicker">Strengths</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">What is working</h3>
            <div className="mt-5 grid gap-3">
              {analysis.strengths.length ? (
                analysis.strengths.map((strength) => (
                  <div key={strength} className="rounded-2xl border border-green/20 bg-green-soft/75 p-4 text-sm leading-6 text-green">
                    {strength}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-line/70 bg-page/70 p-4 text-sm leading-6 text-muted">
                  No major upside callouts under the current assumptions.
                </div>
              )}
            </div>
          </section>

          <section className="surface-panel p-6">
            <p className="section-kicker">Risks</p>
            <h3 className="mt-2 text-xl font-semibold tracking-tight">What to verify</h3>
            <div className="mt-5 grid gap-3">
              {analysis.risks.length ? (
                analysis.risks.map((risk) => (
                  <div key={risk} className="rounded-2xl border border-red/20 bg-red-soft/75 p-4 text-sm leading-6 text-red">
                    {risk}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-line/70 bg-page/70 p-4 text-sm leading-6 text-muted">
                  No major warning flags were generated by the current model inputs.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {estimatedNotes.length ? (
        <section className="surface-panel p-6">
          <p className="section-kicker">Estimated inputs</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Assumptions that still need verification</h3>
          <div className="mt-5 grid gap-3">
            {estimatedNotes.map((note) => (
              <div key={note} className="rounded-2xl border border-gold/20 bg-gold-soft/75 p-4 text-sm leading-6 text-gold">
                {note}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
