import type { DealAnalysis } from './types';

export interface ProjectionPoint {
  year: string;
  cumulativeCashFlow: number;
  cumulativeWealth: number;
  principalPaydown: number;
}

export function buildProjectionSeries(analysis: DealAnalysis, years = 10): ProjectionPoint[] {
  const monthlyCashFlow = Number(analysis.summary.monthlyCashFlow || 0);
  const monthlyPrincipalPaydown = Number(analysis.summary.monthlyPrincipalPaydown || 0);

  return Array.from({ length: years }, (_, index) => {
    const yearNumber = index + 1;
    const cumulativeCashFlow = Math.round(monthlyCashFlow * 12 * yearNumber);
    const principalPaydown = Math.round(monthlyPrincipalPaydown * 12 * yearNumber);

    return {
      year: `Year ${yearNumber}`,
      cumulativeCashFlow,
      principalPaydown,
      cumulativeWealth: cumulativeCashFlow + principalPaydown,
    };
  });
}
