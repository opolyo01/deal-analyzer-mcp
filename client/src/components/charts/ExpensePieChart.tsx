import { currency } from '../../lib/format';
import type { AnalysisSummary } from '../../lib/types';

const COLORS = ['#257a5a', '#2f6fa3', '#a36f10', '#b54747', '#7e6f5b', '#66a88f', '#8bb8db', '#d39d3d', '#d56b6b'];

interface ExpensePieChartProps {
  summary: AnalysisSummary;
}

export function ExpensePieChart({ summary }: ExpensePieChartProps) {
  const breakdown = summary.monthlyExpenseBreakdown;
  const debtPayment = breakdown.debtPayment ?? breakdown.mortgage ?? summary.monthlyMortgage;
  const slices = [
    { name: 'Debt', value: debtPayment },
    { name: 'Taxes', value: breakdown.taxes },
    { name: 'Insurance', value: breakdown.insurance },
    { name: 'HOA', value: breakdown.hoa },
    { name: 'Other', value: breakdown.otherMonthlyCosts },
    { name: 'Vacancy', value: breakdown.vacancy },
    { name: 'Repairs', value: breakdown.repairs },
    { name: 'Capex', value: breakdown.capex },
    { name: 'Management', value: breakdown.management },
  ].filter((entry) => entry.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gradient = slices.length
    ? (() => {
        let current = 0;
        return `conic-gradient(${slices
          .map((slice, index) => {
            const next = current + (slice.value / total) * 360;
            const segment = `${COLORS[index % COLORS.length]} ${current.toFixed(2)}deg ${next.toFixed(2)}deg`;
            current = next;
            return segment;
          })
          .join(', ')})`;
      })()
    : 'conic-gradient(#ece9e2 0deg 360deg)';

  return (
    <section className="surface-panel self-start overflow-hidden p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Monthly outflow mix</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Where the money goes each month</h3>
        </div>
        <p className="text-sm text-muted">{currency(summary.monthlyAllInCost)} all in</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[220px,minmax(0,1fr)] lg:items-center">
        <div className="mx-auto flex w-full max-w-[220px] justify-center">
          <div
            className="relative h-[220px] w-[220px] rounded-full"
            style={{ backgroundImage: gradient }}
          >
            <div className="absolute inset-[32px] rounded-full border border-line/70 bg-white/95" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Monthly total</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-ink">{currency(summary.monthlyAllInCost)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {slices.map((slice, index) => (
            <div key={slice.name} className="flex items-center justify-between rounded-2xl border border-line/70 bg-page/70 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-sm font-medium text-ink">{slice.name}</span>
              </div>
              <span className="text-sm font-semibold text-muted">{currency(slice.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
