import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildProjectionSeries } from '../../lib/projections';
import { currency } from '../../lib/format';
import type { DealAnalysis } from '../../lib/types';

function axisCurrency(value: number) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value)}`;
}

interface ProjectionChartProps {
  analysis: DealAnalysis;
}

export function ProjectionChart({ analysis }: ProjectionChartProps) {
  const data = buildProjectionSeries(analysis, 10);

  return (
    <section className="surface-panel p-6">
      <div className="mb-4">
        <p className="section-kicker">Projection</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Ten-year cash flow outlook</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          This keeps assumptions flat and shows the difference between pure cash flow and cash flow plus principal paydown.
        </p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#ded9cf" vertical={false} />
            <XAxis dataKey="year" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={axisCurrency} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value: number | string) => currency(Number(value))} />
            <Legend />
            <ReferenceLine y={0} stroke="#6f6b62" strokeDasharray="4 4" />
            <Line type="monotone" dataKey="cumulativeCashFlow" name="Cumulative cash flow" stroke="#257a5a" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="principalPaydown" name="Principal paydown" stroke="#2f6fa3" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line type="monotone" dataKey="cumulativeWealth" name="Cash flow + principal" stroke="#a36f10" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
