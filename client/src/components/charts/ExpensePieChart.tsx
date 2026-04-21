import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
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

  return (
    <section className="surface-panel p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Monthly outflow mix</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Where the money goes each month</h3>
        </div>
        <p className="text-sm text-muted">{currency(summary.monthlyAllInCost)} all in</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[260px,minmax(0,1fr)] lg:items-center">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" innerRadius={62} outerRadius={94} paddingAngle={2}>
                {slices.map((slice, index) => (
                  <Cell key={slice.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number | string) => currency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grid gap-2">
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
