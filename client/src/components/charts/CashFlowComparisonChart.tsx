import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDealLabel, shortDealLabel } from '../../lib/deals';
import { currency } from '../../lib/format';
import type { SavedDeal } from '../../lib/types';

function axisCurrency(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

interface CashFlowComparisonChartProps {
  deals: SavedDeal[];
  title: string;
  description: string;
}

export function CashFlowComparisonChart({ deals, title, description }: CashFlowComparisonChartProps) {
  const data = deals.map((deal) => ({
    label: shortDealLabel(getDealLabel(deal), 16),
    fullLabel: getDealLabel(deal),
    afterDebt: Number(deal.analysis.summary.monthlyCashFlow || 0),
    beforePrincipal: Number(deal.analysis.summary.monthlyCashFlowBeforePrincipal || 0),
  }));

  if (!data.length) return null;

  return (
    <section className="surface-panel p-6">
      <div className="mb-4">
        <p className="section-kicker">Cash flow</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={8}>
            <CartesianGrid stroke="#ded9cf" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={axisCurrency} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value: number | string) => currency(Number(value))}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullLabel || '')}
            />
            <Legend />
            <ReferenceLine y={0} stroke="#6f6b62" strokeDasharray="4 4" />
            <Bar dataKey="afterDebt" name="After debt" fill="#257a5a" radius={[8, 8, 0, 0]} />
            <Bar dataKey="beforePrincipal" name="Before principal" fill="#a36f10" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
