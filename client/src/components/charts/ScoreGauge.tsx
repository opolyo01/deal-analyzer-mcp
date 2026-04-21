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
  const radius = 84;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clampedScore / 10);
  const stroke = gaugeColor(clampedScore, recommendation);

  return (
    <section className="surface-panel self-start overflow-hidden p-6">
      <p className="section-kicker">Investment score</p>

      <div className="mx-auto mt-5 w-full max-w-[240px]">
        <div className="relative">
          <svg viewBox="0 0 220 140" className="h-auto w-full">
            <path
              d="M26 114 A84 84 0 0 1 194 114"
              fill="none"
              stroke="#ece9e2"
              strokeWidth="18"
              strokeLinecap="round"
            />
            <path
              d="M26 114 A84 84 0 0 1 194 114"
              fill="none"
              stroke={stroke}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>

          <div className="pointer-events-none absolute inset-x-0 top-[46%] flex -translate-y-1/2 flex-col items-center text-center">
            <div className="text-4xl font-semibold tracking-tight">{clampedScore}</div>
            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-muted">{recommendation}</p>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-4 max-w-[22rem] text-sm leading-6 text-muted">
        Built from cash flow, return metrics, debt coverage, and whether core assumptions were missing or estimated.
      </p>
    </section>
  );
}
