import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

interface ScoreGaugeProps {
  score: number;
  recommendation: string;
}

function gaugeColor(score: number, recommendation: string) {
  if (recommendation.toLowerCase() === 'buy' || score >= 8) return '#257a5a';
  if (recommendation.toLowerCase() === 'pass' || score <= 4) return '#b54747';
  return '#a36f10';
}

export function ScoreGauge({ score, recommendation }: ScoreGaugeProps) {
  const clampedScore = Math.max(0, Math.min(10, Number(score || 0)));
  const data = [{ name: 'Score', value: clampedScore, fill: gaugeColor(clampedScore, recommendation) }];

  return (
    <section className="surface-panel p-6">
      <p className="section-kicker">Investment score</p>
      <div className="relative mt-4 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} innerRadius="72%" outerRadius="100%" startAngle={210} endAngle={-30} barSize={18}>
            <PolarAngleAxis type="number" domain={[0, 10]} tick={false} axisLine={false} />
            <RadialBar background dataKey="value" cornerRadius={14} />
          </RadialBarChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-6 text-center">
          <div className="text-5xl font-semibold tracking-tight">{clampedScore}</div>
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-muted">{recommendation}</p>
        </div>
      </div>

      <p className="text-sm leading-6 text-muted">
        Built from cash flow, return metrics, debt coverage, and whether core assumptions were missing or estimated.
      </p>
    </section>
  );
}
