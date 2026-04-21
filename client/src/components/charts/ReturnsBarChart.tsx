import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getDealLabel, shortDealLabel } from '../../lib/deals';
import type { SavedDeal } from '../../lib/types';

interface ReturnsBarChartProps {
  deals: SavedDeal[];
  title: string;
  description: string;
}

export function ReturnsBarChart({ deals, title, description }: ReturnsBarChartProps) {
  const data = deals.map((deal) => ({
    label: shortDealLabel(getDealLabel(deal), 16),
    fullLabel: getDealLabel(deal),
    capRate: Number(deal.analysis.summary.capRate || 0) * 100,
    cashOnCash: Number(deal.analysis.summary.cashOnCashReturn || 0) * 100,
  }));

  if (!data.length) return null;

  return (
    <section className="surface-panel p-6">
      <div className="mb-4">
        <p className="section-kicker">Returns</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={8}>
            <CartesianGrid stroke="#ded9cf" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value: number | string) => `${Number(value).toFixed(1)}%`}
              labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullLabel || '')}
            />
            <Legend />
            <Bar dataKey="capRate" name="Cap rate" fill="#2f6fa3" radius={[8, 8, 0, 0]} />
            <Bar dataKey="cashOnCash" name="Cash-on-cash" fill="#257a5a" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
