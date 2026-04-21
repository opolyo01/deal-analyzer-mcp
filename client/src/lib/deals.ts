import type { SavedDeal } from './types';

export function getDealLabel(deal: Pick<SavedDeal, 'label' | 'analysis' | 'input'>) {
  return (
    deal.label ||
    deal.analysis.input.label ||
    deal.analysis.input.address ||
    (typeof deal.input.label === 'string' ? deal.input.label : null) ||
    (typeof deal.input.address === 'string' ? deal.input.address : null) ||
    'Untitled deal'
  );
}

export function getDealSubtitle(deal: Pick<SavedDeal, 'analysis'>) {
  return deal.analysis.input.address || deal.analysis.input.propertyType || 'Saved deal';
}

export function splitDealLabel(label: string) {
  const parts = label
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { primary: label, secondary: null };
  }

  return {
    primary: parts[0],
    secondary: parts.slice(1).join(', '),
  };
}

export function shortDealLabel(label: string, maxLength = 18) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

export function sortDeals(deals: SavedDeal[]) {
  return [...deals].sort((left, right) => {
    const scoreDelta = Number(right.analysis.summary.score || 0) - Number(left.analysis.summary.score || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return Number(right.analysis.summary.monthlyCashFlow || 0) - Number(left.analysis.summary.monthlyCashFlow || 0);
  });
}
